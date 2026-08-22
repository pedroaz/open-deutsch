import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { dataRootGenerationSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  inspectDataRootChoice,
  materializeDataRootSelection,
  openOpenDeutschDatabase,
  OpenDeutschRepository,
  resolveDataRootLayout,
  writeBootstrapPointer,
  writingAttemptPersistenceSchema,
} from "../src/index.js";

const factory = createDeterministicContractFactory();

async function openFixture(disposableData: { dataRoot: string; configRoot: string }) {
  const plan = await inspectDataRootChoice(disposableData.dataRoot);
  await materializeDataRootSelection(plan, {
    generation: dataRootGenerationSchema.parse(1),
    createdAt: factory.nextInstant(),
    testMode: true,
  });
  const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "writing.json");
  await writeBootstrapPointer({
    bootstrapFile,
    dataRoot: disposableData.dataRoot,
    expectedGeneration: null,
    selectedAt: factory.nextInstant(),
  });
  const database = await openOpenDeutschDatabase({
    bootstrapFile,
    dataRoot: disposableData.dataRoot,
    rootGeneration: dataRootGenerationSchema.parse(1),
  });
  return {
    database,
    repository: new OpenDeutschRepository(database),
    reader: new DatabaseSync(resolveDataRootLayout(disposableData.dataRoot).database),
  };
}

function writingRecord(overrides: { historyEntryId?: string; noChanges?: boolean } = {}) {
  const startedAt = factory.nextInstant();
  const completedAt = factory.nextInstant();
  const activityId = factory.nextId("activity");
  const exerciseId = factory.nextId("exercise");
  const attemptId = factory.nextId("attempt");
  const correctionId = factory.nextId("correction");
  const historyEntryId = overrides.historyEntryId ?? factory.nextId("historyEntry");
  const modelRequestId = factory.nextId("modelRequest");
  const mistakeId = factory.nextId("mistake");
  const aiProvenance = {
    source: "ai" as const,
    producer: "desktop-app-server" as const,
    modelRequestId,
    generatedAt: completedAt,
    modelSelection: {
      availability: "reported" as const,
      modelId: "gpt-runtime",
      effortId: "medium",
    },
  };
  const exercise = {
    exerciseId,
    aiProvenance,
    cefrBand: "a2" as const,
    objectives: [{ key: "writing-correction", description: "Write a clear request." }],
    instructions: "Write a short appointment request.",
    hints: [],
    feedbackMode: "submit-at-end" as const,
    curriculumTopicIds: [],
    vocabularySetLinks: [],
    kind: "free-writing" as const,
    content: { prompt: "Request an appointment." },
    answerContract: {
      kind: "free-text" as const,
      maximumCharacters: 10_000,
      evaluation: "ai" as const,
    },
  };
  return writingAttemptPersistenceSchema.parse({
    activityId,
    historyEntryId,
    title: "Appointment request",
    workload: "correction",
    startedExercise: { schemaVersion: 1, lifecycle: "started", startedAt, exercise },
    attemptId,
    answer: {
      submittedAfterPreviousEventMilliseconds: 0,
      answer: { kind: "free-writing", text: "Ich brauche ein Termin." },
    },
    completedAfterPreviousEventMilliseconds: 1_000,
    objectiveEvaluations: [
      {
        outcome: "developing",
        evidence: "The request is understandable and needs an article correction.",
        uncertainty: { level: "none" },
      },
    ],
    feedback: {
      source: { kind: "ai", modelRequestId },
      summary: "The article was corrected.",
      strengths: ["The request is understandable."],
      improvements: ["Use the accusative masculine article."],
      nextStep: "Write another appointment request.",
      overallUncertainty: { level: "none" },
      mistakeIds: overrides.noChanges ? [] : [mistakeId],
      vocabularyCandidateIds: [],
    },
    correction: {
      schemaVersion: 1,
      correctionId,
      attemptId,
      createdAt: completedAt,
      aiProvenance,
      alignment: overrides.noChanges
        ? [{ kind: "unchanged", text: "Ich brauche ein Termin." }]
        : [
            { kind: "unchanged", text: "Ich brauche " },
            {
              kind: "replacement",
              originalText: "ein",
              correctedText: "einen",
              category: "grammar",
              severity: "minor",
              priority: "medium",
              explanation: "Use the accusative masculine article.",
              grammarTopicIds: [],
              uncertainty: { level: "none" },
            },
            { kind: "unchanged", text: " Termin." },
          ],
      naturalAlternative: { status: "provided", text: "Ich benötige einen Termin." },
      vocabularyCandidates: [
        {
          lemma: "benötigen",
          meaning: "to need",
          sourceExcerpt: "brauche",
          rationale: "A formal alternative.",
          uncertainty: { level: "none" },
        },
      ],
      followUp: {
        status: "suggested",
        title: "Another request",
        reason: "Reinforce the article pattern.",
        naturalRequest: "Write another appointment request.",
        grammarTopicIds: [],
      },
      overallUncertainty: { level: "none" },
    },
    vocabularyEntries: [],
    mistakes: overrides.noChanges
      ? []
      : [
          {
            proposedMistakeId: mistakeId,
            alignmentSegmentPosition: 1,
            category: { kind: "grammar", categoryKey: "grammar", curriculumTopicIds: [] },
          },
        ],
    completedAt,
  });
}

describe("transactional writing attempt persistence", () => {
  it("stores one reconstructable completed attempt and rolls back a late conflict", async ({
    disposableData,
  }) => {
    const { database, repository, reader } = await openFixture(disposableData);
    try {
      const first = writingRecord();
      await repository.saveWritingAttempt(first);
      expect(
        reader.prepare("SELECT status FROM attempts WHERE attempt_id = ?").get(first.attemptId),
      ).toEqual({ status: "completed" });
      expect(
        reader.prepare("SELECT state, original_text, corrected_text FROM corrections").get(),
      ).toEqual({
        state: "final",
        original_text: "Ich brauche ein Termin.",
        corrected_text: "Ich brauche einen Termin.",
      });
      expect(await repository.listHistory({ skill: "writing" })).toEqual([
        {
          historyEntryId: first.historyEntryId,
          entityKind: "attempt",
          entityId: first.attemptId,
          skill: "writing",
          activityType: "writing",
          title: first.title,
          occurredAt: first.completedAt,
          curriculumTopicIds: [],
          mistakeCategories: ["grammar"],
          detail: {
            kind: "writing-correction",
            learnerText: "Ich brauche ein Termin.",
            correctedText: "Ich brauche einen Termin.",
            feedback: first.feedback,
            aiProvenance: first.correction.aiProvenance,
            vocabularyCandidates: first.correction.vocabularyCandidates,
            changes: [
              {
                category: "grammar",
                explanation: "Use the accusative masculine article.",
              },
            ],
          },
          rootGeneration: 1,
        },
      ]);
      expect(reader.prepare("SELECT count(*) AS count FROM mistakes").get()).toEqual({ count: 1 });
      expect(reader.prepare("SELECT count(*) AS count FROM mistake_occurrences").get()).toEqual({
        count: 1,
      });
      expect(await repository.listMistakePatterns()).toMatchObject([
        { status: "single-occurrence", occurrenceCount: 1, category: { categoryKey: "grammar" } },
      ]);

      const unchanged = writingRecord({ noChanges: true });
      await repository.saveWritingAttempt(unchanged);
      const dashboard = await repository.readDashboardSnapshot("2026-08-20");
      const unchangedCorrection = dashboard.recentCorrections.find(
        ({ correctionId }) => correctionId === unchanged.correction.correctionId,
      );
      expect(unchangedCorrection?.changedSegmentCount).toBe(0);

      const repeated = writingRecord();
      await repository.saveWritingAttempt(repeated);
      expect(reader.prepare("SELECT count(*) AS count FROM mistakes").get()).toEqual({ count: 1 });
      expect(reader.prepare("SELECT count(*) AS count FROM mistake_occurrences").get()).toEqual({
        count: 2,
      });
      expect(await repository.listMistakePatterns()).toMatchObject([
        { status: "recurring", occurrenceCount: 2, category: { categoryKey: "grammar" } },
      ]);

      const conflicting = writingRecord({ historyEntryId: first.historyEntryId });
      await expect(repository.saveWritingAttempt(conflicting)).rejects.toThrow();
      expect(reader.prepare("SELECT count(*) AS count FROM exercises").get()).toEqual({ count: 3 });
      expect(reader.prepare("SELECT count(*) AS count FROM attempts").get()).toEqual({ count: 3 });
      expect(reader.prepare("SELECT count(*) AS count FROM corrections").get()).toEqual({
        count: 3,
      });
    } finally {
      reader.close();
      database.close();
    }
  });

  it("filters reconstruction metadata and deletes an attempt with an audit tombstone", async ({
    disposableData,
  }) => {
    const { database, repository, reader } = await openFixture(disposableData);
    try {
      const record = writingRecord();
      await repository.saveWritingAttempt(record);
      const curriculumTopicId = factory.nextId("curriculumTopic");
      reader
        .prepare(
          `INSERT INTO history_curriculum_topics (history_entry_id, curriculum_topic_id)
           VALUES (?, ?)`,
        )
        .run(record.historyEntryId, curriculumTopicId);
      reader
        .prepare(
          `INSERT INTO history_mistake_categories (history_entry_id, category) VALUES (?, ?)`,
        )
        .run(record.historyEntryId, "grammar.article");

      expect(
        await repository.listHistory({
          activityType: "writing",
          fromDate: record.completedAt.slice(0, 10),
          toDate: record.completedAt.slice(0, 10),
          curriculumTopicId,
          mistakeCategory: "grammar.article",
        }),
      ).toHaveLength(1);
      expect(await repository.listHistory({ activityType: "reading" })).toEqual([]);
      await expect(
        repository.listHistory({ fromDate: "2026-08-21", toDate: "2026-08-20" }),
      ).rejects.toThrow("OD_HISTORY_DATE_RANGE_INVALID");

      await repository.deleteHistoryEntry(record.historyEntryId, factory.nextInstant());
      expect(await repository.listHistory()).toEqual([]);
      expect(
        reader
          .prepare("SELECT attempt_id FROM attempt_deletions WHERE attempt_id = ?")
          .get(record.attemptId),
      ).toEqual({ attempt_id: record.attemptId });
      expect(
        reader
          .prepare("SELECT count(*) AS count FROM corrections WHERE attempt_id = ?")
          .get(record.attemptId),
      ).toEqual({ count: 0 });
    } finally {
      reader.close();
      database.close();
    }
  });
});
