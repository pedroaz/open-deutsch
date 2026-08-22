import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { dataRootGenerationSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  inspectDataRootChoice,
  materializeDataRootSelection,
  openDataRootDatabase,
  openDeutschMigrations,
  openOpenDeutschDatabase,
  resolveDataRootLayout,
  writeBootstrapPointer,
} from "../src/index.js";

const factory = createDeterministicContractFactory();

async function migratedDatabase(disposableData: { dataRoot: string; configRoot: string }) {
  const plan = await inspectDataRootChoice(disposableData.dataRoot);
  await materializeDataRootSelection(plan, {
    generation: dataRootGenerationSchema.parse(1),
    createdAt: factory.nextInstant(),
    testMode: true,
  });
  const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "schema.json");
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
  expect(handle.schemaVersion).toBe(16);
  handle.close();
  const database = new DatabaseSync(resolveDataRootLayout(disposableData.dataRoot).database);
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function insertLearner(database: DatabaseSync, learnerId: string) {
  const instant = factory.nextInstant();
  database
    .prepare(
      `INSERT INTO learner_profiles (
        learner_id, current_level, target_level, level_basis,
        everyday_germany_goal, motivation, available_study_minutes_per_week,
        onboarding_state, level_updated_at, created_at, updated_at
      ) VALUES (?, 'a2', 'b1', 'self-reported', ?, ?, 120, 'in-progress', ?, ?, ?)`,
    )
    .run(
      learnerId,
      "Handle everyday appointments",
      "Live independently",
      instant,
      instant,
      instant,
    );
}

function insertExercise(database: DatabaseSync) {
  const exerciseId = factory.nextId("exercise");
  database
    .prepare(
      `INSERT INTO exercises (
        exercise_id, activity_id, kind, cefr_band, started_at, objectives_json,
        instructions, explanation, content_json, answer_contract_json,
        ai_provenance_json, snapshot_json
      ) VALUES (?, ?, 'free-writing', 'a2', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      exerciseId,
      factory.nextId("activity"),
      factory.nextInstant(),
      JSON.stringify([{ key: "appointment", description: "Request an appointment" }]),
      "Write a short appointment request.",
      "Use a greeting and a time expression.",
      JSON.stringify({ prompt: "Write to a medical practice." }),
      JSON.stringify({ kind: "free-text", maximumCharacters: 1000, evaluation: "ai" }),
      JSON.stringify({ source: "ai", producer: "codex-host" }),
      JSON.stringify({ immutable: "started exercise snapshot" }),
    );
  return exerciseId;
}

function insertAttempt(database: DatabaseSync, exerciseId: string) {
  const attemptId = factory.nextId("attempt");
  database
    .prepare(
      `INSERT INTO attempts (
        attempt_id, exercise_id, status, started_at, exercise_snapshot_json,
        terminal_after_previous_event_ms, objective_evaluations_json, feedback_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      attemptId,
      exerciseId,
      "in-progress",
      factory.nextInstant(),
      JSON.stringify({ exerciseId, immutable: true }),
      null,
      null,
      null,
    );
  return attemptId;
}

describe("learner, settings, and model-preference tables", () => {
  it("separates repository defaults from learner overrides and supports onboarding edits", async ({
    disposableData,
  }) => {
    const database = await migratedDatabase(disposableData);
    const defaults = database
      .prepare(
        `SELECT workload, source, model_mode, effort_mode, semantic_effort
         FROM model_preference_defaults ORDER BY workload`,
      )
      .all();
    expect(defaults).toEqual([
      {
        workload: "correction",
        source: "repository-default",
        model_mode: "automatic",
        effort_mode: "semantic",
        semantic_effort: "balanced",
      },
      {
        workload: "generation",
        source: "repository-default",
        model_mode: "automatic",
        effort_mode: "semantic",
        semantic_effort: "balanced",
      },
      {
        workload: "helper",
        source: "repository-default",
        model_mode: "automatic",
        effort_mode: "semantic",
        semantic_effort: "fast",
      },
      {
        workload: "research",
        source: "repository-default",
        model_mode: "automatic",
        effort_mode: "semantic",
        semantic_effort: "deep",
      },
    ]);
    expect(() =>
      database
        .prepare(
          `UPDATE model_preference_defaults SET semantic_effort = 'fast' WHERE workload = 'correction'`,
        )
        .run(),
    ).toThrow(/OD_MODEL_DEFAULT_IMMUTABLE/u);

    const learnerId = factory.nextId("learner");
    insertLearner(database, learnerId);
    database
      .prepare(
        `INSERT INTO learner_settings (
          learner_id, ui_locale, teaching_language, correction_timing,
          correction_coverage, show_concise_explanation, show_natural_alternative, updated_at
        ) VALUES (?, 'en', 'de', 'adaptive', 'all-meaningful', 1, 1, ?)`,
      )
      .run(learnerId, factory.nextInstant());
    expect(
      database
        .prepare(`SELECT teaching_profile_id FROM learner_settings WHERE learner_id = ?`)
        .get(learnerId),
    ).toEqual({ teaching_profile_id: "conversation-partner" });
    database
      .prepare(
        `UPDATE learner_settings SET teaching_profile_id = 'strict-corrector' WHERE learner_id = ?`,
      )
      .run(learnerId);
    database
      .prepare(
        `INSERT INTO model_preference_overrides (
          learner_id, workload, model_mode, model_id,
          effort_mode, semantic_effort, effort_id, updated_at
        ) VALUES (?, 'helper', 'exact', 'runtime-model', 'exact', NULL, 'low', ?)`,
      )
      .run(learnerId, factory.nextInstant());
    database
      .prepare(
        `UPDATE learner_profiles
         SET everyday_germany_goal = ?, onboarding_state = 'complete', updated_at = ?
         WHERE learner_id = ?`,
      )
      .run("Book appointments confidently", factory.nextInstant(), learnerId);
    expect(
      database
        .prepare(
          `SELECT everyday_germany_goal, onboarding_state FROM learner_profiles WHERE learner_id = ?`,
        )
        .get(learnerId),
    ).toEqual({
      everyday_germany_goal: "Book appointments confidently",
      onboarding_state: "complete",
    });
    expect(
      database
        .prepare(`SELECT model_id, effort_id FROM model_preference_overrides WHERE learner_id = ?`)
        .get(learnerId),
    ).toEqual({ model_id: "runtime-model", effort_id: "low" });
    database.close();
  });

  it("enforces diagnostic provenance, locales, preference correlation, and foreign keys", async ({
    disposableData,
  }) => {
    const database = await migratedDatabase(disposableData);
    const learnerId = factory.nextId("learner");
    const instant = factory.nextInstant();
    expect(() =>
      database
        .prepare(
          `INSERT INTO learner_profiles (
            learner_id, current_level, target_level, level_basis,
            everyday_germany_goal, motivation, available_study_minutes_per_week,
            onboarding_state, level_updated_at, created_at, updated_at
          ) VALUES (?, 'a2', 'b1', 'diagnostic', 'Goal', 'Motivation', 120, 'complete', ?, ?, ?)`,
        )
        .run(learnerId, instant, instant, instant),
    ).toThrow();
    insertLearner(database, learnerId);
    expect(() =>
      database
        .prepare(
          `INSERT INTO learner_settings (
            learner_id, ui_locale, teaching_language, correction_timing,
            correction_coverage, show_concise_explanation, show_natural_alternative, updated_at
          ) VALUES (?, 'fr', 'de', 'adaptive', 'priority-only', 1, 1, ?)`,
        )
        .run(learnerId, factory.nextInstant()),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `INSERT INTO model_preference_overrides (
            learner_id, workload, model_mode, model_id,
            effort_mode, semantic_effort, effort_id, updated_at
          ) VALUES (?, 'generation', 'exact', NULL, 'semantic', NULL, NULL, ?)`,
        )
        .run(learnerId, factory.nextInstant()),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `INSERT INTO model_preference_overrides (
            learner_id, workload, model_mode, model_id,
            effort_mode, semantic_effort, effort_id, updated_at
          ) VALUES (?, 'helper', 'automatic', 'must-be-null', 'semantic', 'fast', NULL, ?)`,
        )
        .run(learnerId, factory.nextInstant()),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `INSERT INTO learner_settings (
            learner_id, ui_locale, teaching_language, correction_timing,
            correction_coverage, show_concise_explanation, show_natural_alternative, updated_at
          ) VALUES ('learner_missing0000000000', 'en', 'de', 'adaptive', 'priority-only', 1, 1, ?)`,
        )
        .run(factory.nextInstant()),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `INSERT INTO learner_settings (
            learner_id, ui_locale, teaching_language, teaching_profile_id, correction_timing,
            correction_coverage, show_concise_explanation, show_natural_alternative, updated_at
          ) VALUES (?, 'en', 'de', 'credential-backed', 'adaptive', 'priority-only', 1, 1, ?)`,
        )
        .run(learnerId, factory.nextInstant()),
    ).toThrow();
    database.close();
  });
});

describe("started lesson, exercise, attempt, and answer tables", () => {
  it("stores immutable started snapshots, multiple attempts, and ordered answers", async ({
    disposableData,
  }) => {
    const database = await migratedDatabase(disposableData);
    expect(() =>
      database
        .prepare(
          `INSERT INTO lessons (
            activity_id, lifecycle, kind, cefr_band, title, started_at,
            objectives_json, explanation, content_json, intent_json,
            ai_provenance_json, snapshot_json
          ) VALUES (?, 'generated', 'custom', 'a2', 'Generated only', ?, '[]', 'x', '[]', '{}', '{}', '{}')`,
        )
        .run(factory.nextId("activity"), factory.nextInstant()),
    ).toThrow();

    const exerciseId = insertExercise(database);
    const firstAttempt = insertAttempt(database, exerciseId);
    const secondAttempt = insertAttempt(database, exerciseId);
    database
      .prepare(
        `INSERT INTO answers (
          attempt_id, position, submitted_after_previous_event_ms, answer_json
        ) VALUES (?, 0, 500, ?), (?, 1, 700, ?)`,
      )
      .run(
        firstAttempt,
        JSON.stringify({ kind: "free-writing", text: "Guten Tag" }),
        firstAttempt,
        JSON.stringify({ kind: "free-writing", text: "Ich brauche einen Termin." }),
      );
    database
      .prepare(
        `UPDATE attempts SET status = 'completed', terminal_after_previous_event_ms = 1500,
          objective_evaluations_json = ?, feedback_json = ? WHERE attempt_id = ?`,
      )
      .run(
        JSON.stringify([
          { outcome: "developing", evidence: "Needs revision", uncertainty: { level: "none" } },
        ]),
        JSON.stringify({ summary: "Completed" }),
        firstAttempt,
      );
    expect(
      database.prepare(`SELECT attempt_id, status FROM attempts ORDER BY started_at`).all(),
    ).toEqual([
      { attempt_id: firstAttempt, status: "completed" },
      { attempt_id: secondAttempt, status: "in-progress" },
    ]);
    expect(
      database
        .prepare(`SELECT position, answer_json FROM answers WHERE attempt_id = ? ORDER BY position`)
        .all(firstAttempt)
        .map((row) => ({
          position: row["position"],
          answer: JSON.parse(String(row["answer_json"])) as unknown,
        })),
    ).toEqual([
      { position: 0, answer: { kind: "free-writing", text: "Guten Tag" } },
      {
        position: 1,
        answer: { kind: "free-writing", text: "Ich brauche einen Termin." },
      },
    ]);
    expect(() =>
      database
        .prepare(`UPDATE exercises SET snapshot_json = '{}' WHERE exercise_id = ?`)
        .run(exerciseId),
    ).toThrow(/OD_EXERCISE_SNAPSHOT_IMMUTABLE/u);
    expect(() =>
      database
        .prepare(`UPDATE answers SET answer_json = '{}' WHERE attempt_id = ? AND position = 0`)
        .run(firstAttempt),
    ).toThrow(/OD_ANSWER_IMMUTABLE/u);
    database.close();
  });

  it("rejects contradictory attempt state and orphan answers", async ({ disposableData }) => {
    const database = await migratedDatabase(disposableData);
    const exerciseId = insertExercise(database);
    expect(() =>
      database
        .prepare(
          `INSERT INTO attempts (
            attempt_id, exercise_id, status, started_at, exercise_snapshot_json,
            terminal_after_previous_event_ms, objective_evaluations_json, feedback_json
          ) VALUES (?, ?, 'completed', ?, '{}', 100, '[]', NULL)`,
        )
        .run(factory.nextId("attempt"), exerciseId, factory.nextInstant()),
    ).toThrow();
    const noAnswerAttempt = insertAttempt(database, exerciseId);
    expect(() =>
      database
        .prepare(
          `UPDATE attempts SET status = 'completed', terminal_after_previous_event_ms = 100,
            objective_evaluations_json = '[]', feedback_json = '{}' WHERE attempt_id = ?`,
        )
        .run(noAnswerAttempt),
    ).toThrow(/OD_ATTEMPT_COMPLETION_REQUIRES_ANSWER/u);
    expect(() =>
      database
        .prepare(
          `INSERT INTO answers (
            attempt_id, position, submitted_after_previous_event_ms, answer_json
          ) VALUES (?, 0, 0, '{}')`,
        )
        .run(factory.nextId("attempt")),
    ).toThrow();
    database.close();
  });
});

describe("correction, change, and mistake evidence tables", () => {
  it("reconstructs correction evidence and preserves recurrence/amendment records", async ({
    disposableData,
  }) => {
    const database = await migratedDatabase(disposableData);
    const exerciseId = insertExercise(database);
    const attemptId = insertAttempt(database, exerciseId);
    const correctionId = factory.nextId("correction");
    database
      .prepare(
        `INSERT INTO corrections (
          correction_id, attempt_id, created_at,
          ai_provenance_json, natural_alternative_json, follow_up_json,
          overall_uncertainty_json
        ) VALUES (?, ?, ?, '{}', '{"status":"not-needed"}',
          '{"status":"not-suggested"}', '{"level":"none"}')`,
      )
      .run(correctionId, attemptId, factory.nextInstant());
    const change = database.prepare(
      `INSERT INTO correction_changes (
        correction_id, position, kind, original_text, corrected_text,
        category, severity, priority, explanation, grammar_topic_ids_json, uncertainty_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    change.run(correctionId, 0, "unchanged", "Ich ", "Ich ", null, null, null, null, null, null);
    change.run(
      correctionId,
      1,
      "replacement",
      "gehen",
      "gehe",
      "grammar",
      "meaning-affecting",
      "high",
      "Match the verb to ich.",
      "[]",
      '{"level":"none"}',
    );
    change.run(correctionId, 2, "unchanged", ".", ".", null, null, null, null, null, null);
    database
      .prepare(
        `UPDATE corrections SET state = 'final', original_text = 'Ich gehen.',
          corrected_text = 'Ich gehe.' WHERE correction_id = ?`,
      )
      .run(correctionId);
    const segments = database
      .prepare(
        `SELECT original_text, corrected_text
         FROM correction_changes WHERE correction_id = ? ORDER BY position`,
      )
      .all(correctionId);
    expect(segments.map((row) => row["original_text"]).join("")).toBe("Ich gehen.");
    expect(segments.map((row) => row["corrected_text"]).join("")).toBe("Ich gehe.");

    const mistakeId = factory.nextId("mistake");
    const inferred = JSON.stringify({
      kind: "grammar",
      categoryKey: "subject-verb-agreement",
      curriculumTopicIds: [factory.nextId("curriculumTopic")],
    });
    database
      .prepare(
        `INSERT INTO mistakes (
          mistake_id, inferred_category_json, effective_category_json,
          classification_source, disposition
        ) VALUES (?, ?, ?, 'inferred', 'active')`,
      )
      .run(mistakeId, inferred, inferred);
    database
      .prepare(
        `INSERT INTO mistake_occurrences (
          mistake_id, correction_id, attempt_id, alignment_segment_position,
          observed_on, before_context, evidence_text, after_context, explanation
        ) VALUES (?, ?, ?, 1, '2026-08-15', 'Ich ', 'gehen', '.', 'Verb agreement')`,
      )
      .run(mistakeId, correctionId, attemptId);
    const mismatchedAttemptId = insertAttempt(database, exerciseId);
    expect(() =>
      database
        .prepare(
          `INSERT INTO mistake_occurrences (
            mistake_id, correction_id, attempt_id, alignment_segment_position,
            observed_on, before_context, evidence_text, after_context, explanation
          ) VALUES (?, ?, ?, 2, '2026-08-15', '', 'mismatch', '', 'wrong attempt')`,
        )
        .run(mistakeId, correctionId, mismatchedAttemptId),
    ).toThrow();
    const amended = JSON.stringify({
      kind: "grammar",
      categoryKey: "present-tense-conjugation",
      curriculumTopicIds: [factory.nextId("curriculumTopic")],
    });
    database
      .prepare(
        `INSERT INTO mistake_amendments (
          amendment_id, mistake_id, previous_category_json,
          amended_category_json, note, amended_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "amendment_0000000000000001",
        mistakeId,
        inferred,
        amended,
        "Use the more specific category.",
        factory.nextInstant(),
      );
    database
      .prepare(
        `UPDATE mistakes SET effective_category_json = ?, classification_source = 'learner-amended',
          learner_amended_at = ?, learner_amendment_note = ? WHERE mistake_id = ?`,
      )
      .run(amended, factory.nextInstant(), "Use the more specific category.", mistakeId);
    expect(
      database
        .prepare(
          `SELECT classification_source, effective_category_json FROM mistakes WHERE mistake_id = ?`,
        )
        .get(mistakeId),
    ).toEqual({ classification_source: "learner-amended", effective_category_json: amended });
    expect(
      database
        .prepare(`SELECT count(*) AS count FROM mistake_occurrences WHERE mistake_id = ?`)
        .get(mistakeId),
    ).toEqual({ count: 1 });
    database.close();
  });

  it("rejects no-op changes, duplicate recurrence evidence, and correction mutation", async ({
    disposableData,
  }) => {
    const database = await migratedDatabase(disposableData);
    const exerciseId = insertExercise(database);
    const attemptId = insertAttempt(database, exerciseId);
    const correctionId = factory.nextId("correction");
    database
      .prepare(
        `INSERT INTO corrections (
          correction_id, attempt_id, created_at,
          ai_provenance_json, natural_alternative_json, follow_up_json,
          overall_uncertainty_json
        ) VALUES (?, ?, ?, '{}', '{}', '{}', '{}')`,
      )
      .run(correctionId, attemptId, factory.nextInstant());
    expect(() =>
      database
        .prepare(
          `INSERT INTO correction_changes (
            correction_id, position, kind, original_text, corrected_text,
            category, severity, priority, explanation, grammar_topic_ids_json, uncertainty_json
          ) VALUES (?, 0, 'replacement', 'same', 'same', 'grammar', 'minor', 'low', 'x', '[]', '{}')`,
        )
        .run(correctionId),
    ).toThrow();
    database
      .prepare(
        `INSERT INTO correction_changes (
          correction_id, position, kind, original_text, corrected_text,
          category, severity, priority, explanation, grammar_topic_ids_json, uncertainty_json
        ) VALUES (?, 1, 'replacement', 'gehen', 'gehe', 'grammar', 'minor', 'low', 'x', '[]', '{}')`,
      )
      .run(correctionId);
    expect(() =>
      database
        .prepare(
          `UPDATE corrections SET state = 'final', original_text = 'gehen', corrected_text = 'gehe'
           WHERE correction_id = ?`,
        )
        .run(correctionId),
    ).toThrow(/OD_CORRECTION_ALIGNMENT_INVALID/u);
    database
      .prepare(
        `INSERT INTO correction_changes (
          correction_id, position, kind, original_text, corrected_text,
          category, severity, priority, explanation, grammar_topic_ids_json, uncertainty_json
        ) VALUES (?, 0, 'unchanged', 'Ich ', 'Ich ', NULL, NULL, NULL, NULL, NULL, NULL)`,
      )
      .run(correctionId);
    expect(() =>
      database
        .prepare(
          `UPDATE corrections SET state = 'final', original_text = 'mismatch', corrected_text = 'Ich gehe'
           WHERE correction_id = ?`,
        )
        .run(correctionId),
    ).toThrow(/OD_CORRECTION_ALIGNMENT_INVALID/u);
    database
      .prepare(
        `UPDATE corrections SET state = 'final', original_text = 'Ich gehen', corrected_text = 'Ich gehe'
         WHERE correction_id = ?`,
      )
      .run(correctionId);
    expect(() =>
      database
        .prepare(`DELETE FROM correction_changes WHERE correction_id = ? AND position = 1`)
        .run(correctionId),
    ).toThrow(/OD_CORRECTION_CHANGE_IMMUTABLE/u);
    expect(() =>
      database
        .prepare(`UPDATE corrections SET natural_alternative_json = '{}' WHERE correction_id = ?`)
        .run(correctionId),
    ).toThrow(/OD_CORRECTION_EVIDENCE_IMMUTABLE/u);
    expect(() =>
      database
        .prepare(`UPDATE corrections SET original_text = 'changed' WHERE correction_id = ?`)
        .run(correctionId),
    ).toThrow(/OD_CORRECTION_EVIDENCE_IMMUTABLE/u);

    const mistakeId = factory.nextId("mistake");
    expect(() =>
      database
        .prepare(
          `INSERT INTO mistakes (
            mistake_id, inferred_category_json, effective_category_json,
            classification_source, disposition
          ) VALUES (?, '{"kind":"grammar"}', '{"kind":"vocabulary"}', 'inferred', 'active')`,
        )
        .run(factory.nextId("mistake")),
    ).toThrow();
    database
      .prepare(
        `INSERT INTO mistakes (
          mistake_id, inferred_category_json, effective_category_json,
          classification_source, disposition
        ) VALUES (?, '{"kind":"grammar"}', '{"kind":"grammar"}', 'inferred', 'active')`,
      )
      .run(mistakeId);
    const occurrence = database.prepare(
      `INSERT INTO mistake_occurrences (
        mistake_id, correction_id, attempt_id, alignment_segment_position,
        observed_on, before_context, evidence_text, after_context, explanation
      ) VALUES (?, ?, ?, 0, '2026-08-15', '', 'same', '', 'evidence')`,
    );
    occurrence.run(mistakeId, correctionId, attemptId);
    expect(() => occurrence.run(mistakeId, correctionId, attemptId)).toThrow();

    expect(() =>
      database
        .prepare(`INSERT INTO mistake_deletions (mistake_id, deleted_at) VALUES (?, ?)`)
        .run(mistakeId, factory.nextInstant()),
    ).toThrow(/OD_MISTAKE_DELETE_REQUIRES_REMOVAL/u);
    database.prepare(`DELETE FROM mistakes WHERE mistake_id = ?`).run(mistakeId);
    database
      .prepare(`INSERT INTO mistake_deletions (mistake_id, deleted_at) VALUES (?, ?) `)
      .run(mistakeId, factory.nextInstant());
    expect(
      database.prepare(`SELECT * FROM mistakes WHERE mistake_id = ?`).get(mistakeId),
    ).toBeUndefined();
    expect(
      database
        .prepare(`SELECT mistake_id FROM mistake_deletions WHERE mistake_id = ?`)
        .get(mistakeId),
    ).toEqual({ mistake_id: mistakeId });
    expect(() =>
      database
        .prepare(
          `INSERT INTO mistakes (
            mistake_id, inferred_category_json, effective_category_json,
            classification_source, disposition
          ) VALUES (?, '{"kind":"grammar"}', '{"kind":"grammar"}', 'inferred', 'active')`,
        )
        .run(mistakeId),
    ).toThrow(/OD_MISTAKE_ALREADY_DELETED/u);
    expect(() =>
      database.prepare("DELETE FROM attempts WHERE attempt_id = ?").run(attemptId),
    ).toThrow(/OD_ATTEMPT_DELETE_REQUIRES_TOMBSTONE/u);
    database
      .prepare("INSERT INTO attempt_deletions (attempt_id, deleted_at) VALUES (?, ?)")
      .run(attemptId, factory.nextInstant());
    database.prepare("DELETE FROM attempts WHERE attempt_id = ?").run(attemptId);
    expect(
      database.prepare("SELECT attempt_id FROM attempts WHERE attempt_id = ?").get(attemptId),
    ).toBeUndefined();
    database.close();
  });
});

describe("vocabulary and review tables", () => {
  it("confirms candidates, applies ordered reviews, supports edits, and suspends cards", async ({
    disposableData,
  }) => {
    const database = await migratedDatabase(disposableData);
    const vocabularyId = factory.nextId("vocabulary");
    const createdAt = factory.nextInstant();
    database
      .prepare(
        `INSERT INTO vocabulary_entries (
          vocabulary_id, lemma, meaning, lexeme_json, examples_json, source_json,
          created_at, updated_at
        ) VALUES (?, 'der Termin', 'appointment', ?, ?, ?, ?, ?)`,
      )
      .run(
        vocabularyId,
        JSON.stringify({
          partOfSpeech: "noun",
          nounForm: { gender: "masculine", article: "der" },
          plural: { status: "form", form: "Termine" },
        }),
        JSON.stringify([
          { german: "Ich brauche einen Termin.", meaning: "I need an appointment." },
        ]),
        JSON.stringify({ kind: "learner", context: "Useful for appointments" }),
        createdAt,
        createdAt,
      );
    expect(() =>
      database
        .prepare(
          `INSERT INTO vocabulary_reviews (
            review_id, vocabulary_id, expected_revision, reviewed_at, grade, next_due_on, next_stage
          ) VALUES (?, ?, 0, ?, 'good', '2026-08-20', 2)`,
        )
        .run(factory.nextId("review"), vocabularyId, factory.nextInstant()),
    ).toThrow(/OD_VOCABULARY_REVIEW_STATE_CONFLICT/u);
    const confirmedAt = factory.nextInstant();
    database
      .prepare(
        `UPDATE vocabulary_entries SET status = 'active', confirmed_at = ?, due_on = '2026-08-15',
          stage = 1, updated_at = ? WHERE vocabulary_id = ? AND status = 'candidate'`,
      )
      .run(confirmedAt, confirmedAt, vocabularyId);
    const reviewId = factory.nextId("review");
    const reviewedAt = factory.nextInstant();
    database
      .prepare(
        `INSERT INTO vocabulary_reviews (
          review_id, vocabulary_id, expected_revision, reviewed_at, grade, next_due_on, next_stage
        ) VALUES (?, ?, 0, ?, 'good', '2026-08-20', 2)`,
      )
      .run(reviewId, vocabularyId, reviewedAt);
    expect(() =>
      database.prepare("DELETE FROM vocabulary_reviews WHERE review_id = ?").run(reviewId),
    ).toThrow(/OD_VOCABULARY_REVIEW_IMMUTABLE/u);
    expect(
      database
        .prepare(
          `SELECT status, revision, due_on, stage, last_review_id, last_grade
           FROM vocabulary_entries WHERE vocabulary_id = ?`,
        )
        .get(vocabularyId),
    ).toEqual({
      status: "active",
      revision: 1,
      due_on: "2026-08-20",
      stage: 2,
      last_review_id: reviewId,
      last_grade: "good",
    });
    expect(() =>
      database
        .prepare(
          `INSERT INTO vocabulary_reviews (
            review_id, vocabulary_id, expected_revision, reviewed_at, grade, next_due_on, next_stage
          ) VALUES (?, ?, 0, ?, 'easy', '2026-08-25', 3)`,
        )
        .run(factory.nextId("review"), vocabularyId, factory.nextInstant()),
    ).toThrow(/OD_VOCABULARY_REVIEW_STATE_CONFLICT/u);
    database
      .prepare(
        `UPDATE vocabulary_entries SET meaning = 'scheduled appointment', status = 'suspended',
          suspended_at = ?, suspension_reason = 'learner-paused', updated_at = ?
         WHERE vocabulary_id = ?`,
      )
      .run(factory.nextInstant(), factory.nextInstant(), vocabularyId);
    expect(() =>
      database
        .prepare(
          `INSERT INTO vocabulary_reviews (
            review_id, vocabulary_id, expected_revision, reviewed_at, grade, next_due_on, next_stage
          ) VALUES (?, ?, 1, ?, 'hard', '2026-08-25', 2)`,
        )
        .run(factory.nextId("review"), vocabularyId, factory.nextInstant()),
    ).toThrow(/OD_VOCABULARY_REVIEW_STATE_CONFLICT/u);
    expect(
      database
        .prepare("SELECT meaning, status FROM vocabulary_entries WHERE vocabulary_id = ?")
        .get(vocabularyId),
    ).toEqual({ meaning: "scheduled appointment", status: "suspended" });
    expect(() =>
      database.prepare("DELETE FROM vocabulary_entries WHERE vocabulary_id = ?").run(vocabularyId),
    ).toThrow(/OD_VOCABULARY_DELETE_REQUIRES_TOMBSTONE/u);
    database
      .prepare("INSERT INTO vocabulary_deletions (vocabulary_id, deleted_at) VALUES (?, ?)")
      .run(vocabularyId, factory.nextInstant());
    database.prepare("DELETE FROM vocabulary_entries WHERE vocabulary_id = ?").run(vocabularyId);
    expect(
      database
        .prepare("SELECT count(*) AS count FROM vocabulary_reviews WHERE vocabulary_id = ?")
        .get(vocabularyId),
    ).toEqual({ count: 0 });
    database.close();
  });
});

describe("weekly plan and Voice summary tables", () => {
  it("replaces only current advisory state and retains structured local history", async ({
    disposableData,
  }) => {
    const database = await migratedDatabase(disposableData);
    const insertPlan = database.prepare(
      `INSERT INTO weekly_plans (
        plan_id, week_starts_on, requested_from, plan_json, created_at
      ) VALUES (?, '2026-08-10', ?, ?, ?)`,
    );
    const firstPlan = factory.nextId("plan");
    const secondPlan = factory.nextId("plan");
    insertPlan.run(
      firstPlan,
      "desktop",
      JSON.stringify({ goals: [{ title: "First" }] }),
      factory.nextInstant(),
    );
    insertPlan.run(
      secondPlan,
      "codex",
      JSON.stringify({ goals: [{ title: "Updated" }] }),
      factory.nextInstant(),
    );
    expect(
      database.prepare("SELECT plan_id, is_current FROM weekly_plans ORDER BY created_at").all(),
    ).toEqual([
      { plan_id: firstPlan, is_current: 0 },
      { plan_id: secondPlan, is_current: 1 },
    ]);
    expect(() =>
      database
        .prepare("UPDATE weekly_plans SET plan_json = '{}' WHERE plan_id = ?")
        .run(secondPlan),
    ).toThrow(/OD_WEEKLY_PLAN_IMMUTABLE/u);

    const voiceSessionId = factory.nextId("voiceSession");
    database
      .prepare(
        `INSERT INTO voice_summaries (
          voice_session_id, summarized_at, scenario_title, target_level, summary_json
        ) VALUES (?, ?, 'At the pharmacy', 'a2', ?)`,
      )
      .run(
        voiceSessionId,
        factory.nextInstant(),
        JSON.stringify({
          duration: { status: "not-reported" },
          observedIssues: [],
          vocabulary: [],
          feedback: { summary: "Practised asking for medicine." },
          nextSteps: [{ title: "Repeat key phrases" }],
        }),
      );
    expect(
      database
        .prepare(
          "SELECT scenario_title, target_level FROM voice_summaries WHERE voice_session_id = ?",
        )
        .get(voiceSessionId),
    ).toEqual({ scenario_title: "At the pharmacy", target_level: "a2" });
    expect(() =>
      database
        .prepare("UPDATE voice_summaries SET summary_json = '{}' WHERE voice_session_id = ?")
        .run(voiceSessionId),
    ).toThrow(/OD_VOICE_SUMMARY_IMMUTABLE/u);
    database.close();
  });
});

describe("activity, History, handoff, and attachment metadata", () => {
  it("upgrades populated History metadata before admitting plan-generation evidence", async ({
    disposableData,
  }) => {
    const plan = await inspectDataRootChoice(disposableData.dataRoot);
    await materializeDataRootSelection(plan, {
      generation: dataRootGenerationSchema.parse(1),
      createdAt: factory.nextInstant(),
      testMode: true,
    });
    const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "history-v10.json");
    await writeBootstrapPointer({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      expectedGeneration: null,
      selectedAt: factory.nextInstant(),
    });
    const oldHandle = await openDataRootDatabase({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      rootGeneration: dataRootGenerationSchema.parse(1),
      migrations: openDeutschMigrations.slice(0, 10),
    });
    expect(oldHandle.schemaVersion).toBe(10);
    oldHandle.close();

    const beforeUpgrade = new DatabaseSync(resolveDataRootLayout(disposableData.dataRoot).database);
    beforeUpgrade.exec("PRAGMA foreign_keys = ON;");
    const historyEntryId = factory.nextId("historyEntry");
    const topicId = factory.nextId("curriculumTopic");
    beforeUpgrade
      .prepare(
        `INSERT INTO history_entries (
          history_entry_id, entity_kind, entity_id, skill, activity_type, title,
          occurred_at, reconstruction_json, root_generation
        ) VALUES (?, 'attempt', ?, 'writing', 'writing', 'Preserved writing', ?, '{}', 1)`,
      )
      .run(historyEntryId, factory.nextId("attempt"), factory.nextInstant());
    beforeUpgrade
      .prepare(
        `INSERT INTO history_curriculum_topics (history_entry_id, curriculum_topic_id)
         VALUES (?, ?)`,
      )
      .run(historyEntryId, topicId);
    beforeUpgrade.close();

    const upgraded = await openOpenDeutschDatabase({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      rootGeneration: dataRootGenerationSchema.parse(1),
    });
    expect(upgraded.schemaVersion).toBe(16);
    upgraded.close();
    const afterUpgrade = new DatabaseSync(resolveDataRootLayout(disposableData.dataRoot).database);
    afterUpgrade.exec("PRAGMA foreign_keys = ON;");
    expect(
      afterUpgrade
        .prepare(
          `SELECT h.title, t.curriculum_topic_id
           FROM history_entries h JOIN history_curriculum_topics t USING (history_entry_id)
           WHERE h.history_entry_id = ?`,
        )
        .get(historyEntryId),
    ).toEqual({ title: "Preserved writing", curriculum_topic_id: topicId });
    afterUpgrade.close();
  });

  it("keeps portable shared context and filterable reconstruction metadata", async ({
    disposableData,
  }) => {
    const database = await migratedDatabase(disposableData);
    const activityId = factory.nextId("activity");
    database
      .prepare(
        `INSERT INTO prepared_activities (
          activity_id, activity_type, title, origin_surface, context_json, prepared_at, root_generation
        ) VALUES (?, 'writing', 'Write an appointment request', 'codex', '{}', ?, 1)`,
      )
      .run(activityId, factory.nextInstant());
    const topicId = factory.nextId("curriculumTopic");
    database
      .prepare(
        `INSERT INTO activity_context_references (activity_id, reference_kind, reference_id)
         VALUES (?, 'curriculum-topic', ?)`,
      )
      .run(activityId, topicId);
    const handoffId = factory.nextId("persistentHandoff");
    database
      .prepare(
        `INSERT INTO persistent_handoffs (
          handoff_id, activity_id, origin_surface, destination_surface, target_kind,
          target_reference, status, created_at, updated_at, root_generation
        ) VALUES (?, ?, 'codex', 'desktop', 'desktop-activity', ?, 'opened', ?, ?, 1)`,
      )
      .run(handoffId, activityId, activityId, factory.nextInstant(), factory.nextInstant());
    const historyId = factory.nextId("historyEntry");
    database
      .prepare(
        `INSERT INTO history_entries (
          history_entry_id, entity_kind, entity_id, skill, activity_type, title,
          occurred_at, reconstruction_json, root_generation
        ) VALUES (?, 'attempt', ?, 'writing', 'writing', 'Appointment request', ?, '{}', 1)`,
      )
      .run(historyId, factory.nextId("attempt"), factory.nextInstant());
    database
      .prepare(
        `INSERT INTO history_curriculum_topics (history_entry_id, curriculum_topic_id)
         VALUES (?, ?)`,
      )
      .run(historyId, topicId);
    database
      .prepare(
        `INSERT INTO attachment_metadata (
          attachment_id, owner_kind, owner_id, kind, media_type, relative_path,
          byte_size, sha256, created_at, root_generation
        ) VALUES (?, 'history', ?, 'document', 'application/pdf', ?, 42, ?, ?, 1)`,
      )
      .run(
        "attachment_0000000000000001",
        historyId,
        "attachments/history/example.pdf",
        "a".repeat(64),
        factory.nextInstant(),
      );
    expect(
      database
        .prepare(
          `SELECT h.skill, h.activity_type, t.curriculum_topic_id
           FROM history_entries h JOIN history_curriculum_topics t USING (history_entry_id)
           WHERE h.history_entry_id = ?`,
        )
        .get(historyId),
    ).toEqual({ skill: "writing", activity_type: "writing", curriculum_topic_id: topicId });
    const planHistoryId = factory.nextId("historyEntry");
    database
      .prepare(
        `INSERT INTO history_entries (
          history_entry_id, entity_kind, entity_id, skill, activity_type, title,
          occurred_at, reconstruction_json, root_generation
        ) VALUES (?, 'plan', ?, 'writing', 'plan-generation', 'Weekly plan', ?, '{}', 1)`,
      )
      .run(planHistoryId, factory.nextId("plan"), factory.nextInstant());
    expect(
      database
        .prepare(
          "SELECT entity_kind, activity_type FROM history_entries WHERE history_entry_id = ?",
        )
        .get(planHistoryId),
    ).toEqual({ entity_kind: "plan", activity_type: "plan-generation" });
    expect(() =>
      database
        .prepare(
          `INSERT INTO attachment_metadata (
            attachment_id, owner_kind, owner_id, kind, media_type, relative_path,
            byte_size, sha256, created_at, root_generation
          ) VALUES (?, 'history', ?, 'document', 'text/plain', '../outside', 1, ?, ?, 1)`,
        )
        .run("attachment_0000000000000002", historyId, "b".repeat(64), factory.nextInstant()),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `INSERT INTO attachment_metadata (
            attachment_id, owner_kind, owner_id, kind, media_type, relative_path,
            byte_size, sha256, created_at, root_generation
          ) VALUES (?, 'history', ?, 'document', 'text/plain', 'attachments/orphan.txt',
            1, ?, ?, 1)`,
        )
        .run(
          "attachment_0000000000000003",
          factory.nextId("historyEntry"),
          "c".repeat(64),
          factory.nextInstant(),
        ),
    ).toThrow(/OD_ATTACHMENT_OWNER_INVALID/u);
    expect(() =>
      database
        .prepare(
          `INSERT INTO attachment_metadata (
            attachment_id, owner_kind, owner_id, kind, media_type, relative_path,
            byte_size, sha256, created_at, root_generation
          ) VALUES (?, 'history', ?, 'document', 'text/plain', 'attachments/wrong-generation.txt',
            1, ?, ?, 2)`,
        )
        .run("attachment_0000000000000004", historyId, "d".repeat(64), factory.nextInstant()),
    ).toThrow(/OD_ATTACHMENT_OWNER_INVALID/u);
    database.close();
  });
});
