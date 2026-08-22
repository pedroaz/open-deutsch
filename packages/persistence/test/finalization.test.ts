import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { dataRootGenerationSchema } from "@open-deutsch/contracts";
import { attemptFeedbackSchema, type AttemptFeedback } from "@open-deutsch/domain";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  completeAttempt,
  finalizeCorrection,
  inspectDataRootChoice,
  materializeDataRootSelection,
  openOpenDeutschDatabase,
  resolveDataRootLayout,
  writeBootstrapPointer,
} from "../src/index.js";

const factory = createDeterministicContractFactory();
const validFeedback: AttemptFeedback = {
  source: { kind: "deterministic" },
  summary: "The response was evaluated.",
  strengths: ["The request is understandable."],
  improvements: ["Use the dative article after mit."],
  overallUncertainty: { level: "none" },
  mistakeIds: [],
  vocabularyCandidateIds: [],
};
const objectiveEvaluations = [
  {
    outcome: "developing" as const,
    evidence: "The request is understandable but needs a case correction.",
    uncertainty: { level: "none" as const },
  },
];

async function openFixture(disposableData: { dataRoot: string; configRoot: string }) {
  const plan = await inspectDataRootChoice(disposableData.dataRoot);
  await materializeDataRootSelection(plan, {
    generation: dataRootGenerationSchema.parse(1),
    createdAt: factory.nextInstant(),
    testMode: true,
  });
  const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "finalize.json");
  await writeBootstrapPointer({
    bootstrapFile,
    dataRoot: disposableData.dataRoot,
    expectedGeneration: null,
    selectedAt: factory.nextInstant(),
  });
  const handle = await openOpenDeutschDatabase({
    bootstrapFile,
    dataRoot: disposableData.dataRoot,
    rootGeneration: dataRootGenerationSchema.parse(1),
  });
  const writer = new DatabaseSync(resolveDataRootLayout(disposableData.dataRoot).database);
  writer.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;");
  return { handle, writer };
}

function insertExerciseAndAttempt(writer: DatabaseSync) {
  const exerciseId = factory.nextId("exercise");
  writer
    .prepare(
      `INSERT INTO exercises (
        exercise_id, activity_id, kind, cefr_band, started_at, objectives_json,
        instructions, content_json, answer_contract_json, ai_provenance_json, snapshot_json
      ) VALUES (?, ?, 'free-writing', 'a2', ?,
        '[{"key":"request","description":"Write an understandable request"}]',
        'Write.', '{}', '{}', '{}', '{}')`,
    )
    .run(exerciseId, factory.nextId("activity"), factory.nextInstant());
  const attemptId = factory.nextId("attempt");
  writer
    .prepare(
      `INSERT INTO attempts (
        attempt_id, exercise_id, status, started_at, exercise_snapshot_json
      ) VALUES (?, ?, 'in-progress', ?, '{}')`,
    )
    .run(attemptId, exerciseId, factory.nextInstant());
  return attemptId;
}

describe("leased record finalization", () => {
  it("requires an answer and makes a completed attempt terminal", async ({ disposableData }) => {
    const { handle, writer } = await openFixture(disposableData);
    const attemptId = insertExerciseAndAttempt(writer);
    await expect(
      completeAttempt(handle, {
        attemptId,
        terminalAfterPreviousEventMilliseconds: 100,
        objectiveEvaluations,
        feedback: validFeedback,
        idempotencyKey: "attempt:complete:0001",
        recordedAt: factory.nextInstant(),
      }),
    ).rejects.toThrow(/OD_ATTEMPT_COMPLETION_REQUIRES_ANSWER/u);
    expect(
      writer.prepare("SELECT status FROM attempts WHERE attempt_id = ?").get(attemptId),
    ).toEqual({
      status: "in-progress",
    });
    writer
      .prepare(
        `INSERT INTO answers (
          attempt_id, position, submitted_after_previous_event_ms, answer_json
        ) VALUES (?, 0, 50, '{}')`,
      )
      .run(attemptId);
    await expect(
      completeAttempt(handle, {
        attemptId,
        terminalAfterPreviousEventMilliseconds: 100,
        objectiveEvaluations,
        feedback: { ...validFeedback, accessToken: "private" } as AttemptFeedback,
        idempotencyKey: "attempt:complete:0001",
        recordedAt: factory.nextInstant(),
      }),
    ).rejects.toThrow("OD_ATTEMPT_FEEDBACK_INVALID");
    await expect(
      completeAttempt(handle, {
        attemptId,
        terminalAfterPreviousEventMilliseconds: 100,
        objectiveEvaluations: [],
        feedback: validFeedback,
        idempotencyKey: "attempt:complete:0001",
        recordedAt: factory.nextInstant(),
      }),
    ).rejects.toThrow("OD_ATTEMPT_OBJECTIVE_EVALUATIONS_INVALID");
    await completeAttempt(handle, {
      attemptId,
      terminalAfterPreviousEventMilliseconds: 100,
      objectiveEvaluations,
      feedback: validFeedback,
      idempotencyKey: "attempt:complete:0001",
      recordedAt: factory.nextInstant(),
    });
    expect(() =>
      writer
        .prepare("UPDATE attempts SET feedback_json = '{}' WHERE attempt_id = ?")
        .run(attemptId),
    ).toThrow(/OD_ATTEMPT_TERMINAL_IMMUTABLE/u);
    const stored = writer
      .prepare("SELECT feedback_json FROM attempts WHERE attempt_id = ?")
      .get(attemptId) as { feedback_json: string };
    expect(attemptFeedbackSchema.parse(JSON.parse(stored.feedback_json))).toEqual(validFeedback);
    writer.close();
    handle.close();
  });

  it("derives final correction text from contiguous immutable alignment", async ({
    disposableData,
  }) => {
    const { handle, writer } = await openFixture(disposableData);
    const attemptId = insertExerciseAndAttempt(writer);
    const correctionId = factory.nextId("correction");
    writer
      .prepare(
        `INSERT INTO corrections (
          correction_id, attempt_id, created_at, ai_provenance_json,
          natural_alternative_json, follow_up_json, overall_uncertainty_json
        ) VALUES (?, ?, ?, '{}', '{}', '{}', '{}')`,
      )
      .run(correctionId, attemptId, factory.nextInstant());
    const add = writer.prepare(
      `INSERT INTO correction_changes (
        correction_id, position, kind, original_text, corrected_text,
        category, severity, priority, explanation, grammar_topic_ids_json, uncertainty_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    add.run(
      correctionId,
      1,
      "replacement",
      "gehen",
      "gehe",
      "grammar",
      "minor",
      "high",
      "x",
      "[]",
      "{}",
    );
    await expect(finalizeCorrection(handle, correctionId)).rejects.toThrow(
      "OD_CORRECTION_ALIGNMENT_INVALID",
    );
    add.run(correctionId, 0, "unchanged", "Ich ", "Ich ", null, null, null, null, null, null);
    await expect(finalizeCorrection(handle, correctionId)).resolves.toEqual({
      originalText: "Ich gehen",
      correctedText: "Ich gehe",
    });
    expect(() =>
      writer.prepare("DELETE FROM correction_changes WHERE correction_id = ?").run(correctionId),
    ).toThrow(/OD_CORRECTION_CHANGE_IMMUTABLE/u);
    writer.close();
    handle.close();
  });
});
