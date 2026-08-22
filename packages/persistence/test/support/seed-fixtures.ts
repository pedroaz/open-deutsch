import type { DatabaseSync } from "node:sqlite";

import {
  aiProvenanceSchema,
  attemptFeedbackSchema,
  correctionSchema,
  exerciseAnswerSchema,
  exerciseDefinitionSchema,
  learnerProfileSchema,
  objectiveEvaluationSchema,
  startedExerciseSnapshotSchema,
} from "@open-deutsch/domain";

export const persistenceSeedFixtureNames = [
  "new-learner",
  "writing-with-errors",
  "recurring-dative",
  "vocabulary-due",
  "existing-dataset",
] as const;

export type PersistenceSeedFixtureName = (typeof persistenceSeedFixtureNames)[number];

const instant = "2026-08-15T10:00:00.000Z";
const curriculumTopicId = "curriculum-topic_0000000000000001";
const aiProvenance = aiProvenanceSchema.parse({
  source: "ai",
  producer: "desktop-app-server",
  modelRequestId: "model-request_0000000000000001",
  generatedAt: instant,
  modelSelection: { availability: "reported", modelId: "gpt-5.4", effortId: "medium" },
});
const exercise = exerciseDefinitionSchema.parse({
  exerciseId: "exercise_0000000000000001",
  aiProvenance,
  cefrBand: "a2",
  objectives: [{ key: "appointment", description: "Request an appointment" }],
  instructions: "Write an appointment request.",
  explanation: "Use a greeting and the correct case after prepositions.",
  hints: [],
  feedbackMode: "submit-at-end",
  curriculumTopicIds: [curriculumTopicId],
  vocabularySetLinks: [],
  kind: "free-writing",
  content: { prompt: "Ask for an appointment on Tuesday." },
  answerContract: { kind: "free-text", maximumCharacters: 1_000, evaluation: "ai" },
});
const startedExercise = startedExerciseSnapshotSchema.parse({
  schemaVersion: 1,
  lifecycle: "started",
  startedAt: instant,
  exercise,
});
const exerciseAnswer = exerciseAnswerSchema.parse({
  kind: "free-writing",
  text: "Ich fahre mit der Bus.",
});
const objectiveEvaluations = [
  objectiveEvaluationSchema.parse({
    outcome: "developing",
    evidence: "The request is understandable but the dative article needs correction.",
    uncertainty: { level: "none" },
  }),
];
const deterministicFeedback = attemptFeedbackSchema.parse({
  source: { kind: "deterministic" },
  summary: "Article needs correction",
  strengths: [],
  improvements: ["Use the dative article after mit."],
  overallUncertainty: { level: "none" },
  mistakeIds: [],
  vocabularyCandidateIds: [],
});
const dativeCategory = JSON.stringify({
  kind: "grammar",
  categoryKey: "dative-case",
  curriculumTopicIds: [curriculumTopicId],
});
const primaryCorrection = correctionSchema.parse({
  schemaVersion: 1,
  correctionId: "correction_0000000000000001",
  attemptId: "attempt_0000000000000001",
  createdAt: instant,
  aiProvenance,
  alignment: [
    { kind: "unchanged", text: "Ich fahre mit " },
    {
      kind: "replacement",
      originalText: "der",
      correctedText: "dem",
      category: "grammar",
      severity: "meaning-affecting",
      priority: "high",
      explanation: "Mit takes dative; Bus is masculine.",
      grammarTopicIds: [curriculumTopicId],
      uncertainty: { level: "none" },
    },
    { kind: "unchanged", text: " Bus." },
  ],
  naturalAlternative: { status: "not-needed" },
  vocabularyCandidates: [],
  followUp: { status: "not-suggested" },
  overallUncertainty: { level: "none" },
});
const recurringCorrection = correctionSchema.parse({
  ...primaryCorrection,
  correctionId: "correction_0000000000000002",
  alignment: [
    {
      kind: "replacement",
      originalText: "der",
      correctedText: "dem",
      category: "grammar",
      severity: "meaning-affecting",
      priority: "high",
      explanation: "Dative article",
      grammarTopicIds: [curriculumTopicId],
      uncertainty: { level: "none" },
    },
  ],
});
const learnerProfile = learnerProfileSchema.parse({
  schemaVersion: 1,
  learnerId: "learner_0000000000000001",
  levelEstimate: {
    currentLevel: "a2",
    targetLevel: "b1",
    basis: "self-reported",
    updatedAt: instant,
  },
  everydayGermanyGoal: "Handle appointments independently",
  motivation: "Build confidence in Germany",
  interests: ["Everyday life"],
  preferredTopics: ["Appointments"],
  availableStudyMinutesPerWeek: 120,
  correctionPreferences: {
    timing: "adaptive",
    coverage: "all-meaningful",
    showConciseExplanation: true,
    showNaturalAlternative: true,
  },
  onboardingState: "in-progress",
  inferredStrengths: [],
  inferredWeaknesses: [],
  uiLocale: "en",
  teachingLanguage: "en",
  defaultTeachingProfileId: "conversation-partner",
  createdAt: instant,
  updatedAt: instant,
});

function seedNewLearner(database: DatabaseSync) {
  database
    .prepare(
      `INSERT OR IGNORE INTO learner_profiles (
        learner_id, current_level, target_level, level_basis, everyday_germany_goal,
        motivation, available_study_minutes_per_week, onboarding_state,
        level_updated_at, created_at, updated_at
      ) VALUES ('learner_0000000000000001', 'a2', 'b1', 'self-reported',
        'Handle appointments independently', 'Build confidence in Germany', 120,
        'in-progress', ?, ?, ?)`,
    )
    .run(instant, instant, instant);
  database
    .prepare(
      `INSERT OR IGNORE INTO learner_settings (
        learner_id, ui_locale, teaching_language, correction_timing, correction_coverage,
        show_concise_explanation, show_natural_alternative, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      learnerProfile.learnerId,
      learnerProfile.uiLocale,
      learnerProfile.teachingLanguage,
      learnerProfile.correctionPreferences.timing,
      learnerProfile.correctionPreferences.coverage,
      learnerProfile.correctionPreferences.showConciseExplanation ? 1 : 0,
      learnerProfile.correctionPreferences.showNaturalAlternative ? 1 : 0,
      learnerProfile.updatedAt,
    );
  const interestStatement = database.prepare(
    `INSERT OR IGNORE INTO learner_interests (learner_id, position, value) VALUES (?, ?, ?)`,
  );
  for (const [position, value] of learnerProfile.interests.entries()) {
    interestStatement.run(learnerProfile.learnerId, position, value);
  }
  const topicStatement = database.prepare(
    `INSERT OR IGNORE INTO learner_preferred_topics (learner_id, position, value)
     VALUES (?, ?, ?)`,
  );
  for (const [position, value] of learnerProfile.preferredTopics.entries()) {
    topicStatement.run(learnerProfile.learnerId, position, value);
  }
}

function seedWritingWithErrors(database: DatabaseSync) {
  if (
    database
      .prepare("SELECT 1 FROM corrections WHERE correction_id = 'correction_0000000000000001'")
      .get() !== undefined
  ) {
    return;
  }
  database
    .prepare(
      `INSERT OR IGNORE INTO exercises (
        exercise_id, activity_id, kind, cefr_band, started_at, objectives_json,
        instructions, explanation, content_json, answer_contract_json, ai_provenance_json,
        snapshot_json
      ) VALUES (?, 'activity_0000000000000001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      exercise.exerciseId,
      exercise.kind,
      exercise.cefrBand,
      startedExercise.startedAt,
      JSON.stringify(exercise.objectives),
      exercise.instructions,
      exercise.explanation ?? null,
      JSON.stringify(exercise.content),
      JSON.stringify(exercise.answerContract),
      JSON.stringify(exercise.aiProvenance),
      JSON.stringify(startedExercise),
    );
  database
    .prepare(
      `INSERT OR IGNORE INTO attempts (
        attempt_id, exercise_id, status, started_at, exercise_snapshot_json
      ) VALUES ('attempt_0000000000000001', 'exercise_0000000000000001',
        'in-progress', ?, ?)`,
    )
    .run(instant, JSON.stringify(startedExercise));
  database
    .prepare(
      `INSERT OR IGNORE INTO answers (
        attempt_id, position, submitted_after_previous_event_ms, answer_json
      ) VALUES ('attempt_0000000000000001', 0, 500,
        ?)`,
    )
    .run(JSON.stringify(exerciseAnswer));
  database
    .prepare(
      `UPDATE attempts SET status = 'completed', terminal_after_previous_event_ms = 1000,
        objective_evaluations_json = ?, feedback_json = ?
       WHERE attempt_id = 'attempt_0000000000000001' AND status = 'in-progress'`,
    )
    .run(JSON.stringify(objectiveEvaluations), JSON.stringify(deterministicFeedback));
  database
    .prepare(
      `INSERT OR IGNORE INTO corrections (
        correction_id, attempt_id, created_at, ai_provenance_json,
        natural_alternative_json, follow_up_json, overall_uncertainty_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      primaryCorrection.correctionId,
      primaryCorrection.attemptId,
      primaryCorrection.createdAt,
      JSON.stringify(primaryCorrection.aiProvenance),
      JSON.stringify(primaryCorrection.naturalAlternative),
      JSON.stringify(primaryCorrection.followUp),
      JSON.stringify(primaryCorrection.overallUncertainty),
    );
  const change = database.prepare(
    `INSERT OR IGNORE INTO correction_changes (
      correction_id, position, kind, original_text, corrected_text,
      category, severity, priority, explanation, grammar_topic_ids_json, uncertainty_json
    ) VALUES ('correction_0000000000000001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  change.run(
    0,
    "unchanged",
    "Ich fahre mit ",
    "Ich fahre mit ",
    null,
    null,
    null,
    null,
    null,
    null,
  );
  change.run(
    1,
    "replacement",
    "der",
    "dem",
    "grammar",
    "meaning-affecting",
    "high",
    "Mit takes dative; Bus is masculine.",
    JSON.stringify([curriculumTopicId]),
    JSON.stringify({ level: "none" }),
  );
  change.run(2, "unchanged", " Bus.", " Bus.", null, null, null, null, null, null);
  database
    .prepare(
      `UPDATE corrections SET state = 'final', original_text = 'Ich fahre mit der Bus.',
        corrected_text = 'Ich fahre mit dem Bus.'
       WHERE correction_id = 'correction_0000000000000001' AND state = 'draft'`,
    )
    .run();
}

function seedRecurringDative(database: DatabaseSync) {
  if (
    database
      .prepare("SELECT 1 FROM mistakes WHERE mistake_id = 'mistake_0000000000000001'")
      .get() !== undefined
  ) {
    return;
  }
  seedWritingWithErrors(database);
  database
    .prepare(
      `INSERT OR IGNORE INTO mistakes (
        mistake_id, inferred_category_json, effective_category_json,
        classification_source, disposition
      ) VALUES ('mistake_0000000000000001', ?, ?, 'inferred', 'active')`,
    )
    .run(dativeCategory, dativeCategory);
  database
    .prepare(
      `INSERT OR IGNORE INTO corrections (
        correction_id, attempt_id, created_at, ai_provenance_json,
        natural_alternative_json, follow_up_json, overall_uncertainty_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      recurringCorrection.correctionId,
      recurringCorrection.attemptId,
      recurringCorrection.createdAt,
      JSON.stringify(recurringCorrection.aiProvenance),
      JSON.stringify(recurringCorrection.naturalAlternative),
      JSON.stringify(recurringCorrection.followUp),
      JSON.stringify(recurringCorrection.overallUncertainty),
    );
  database
    .prepare(
      `INSERT OR IGNORE INTO correction_changes (
        correction_id, position, kind, original_text, corrected_text,
        category, severity, priority, explanation, grammar_topic_ids_json, uncertainty_json
      ) VALUES ('correction_0000000000000002', 0, 'replacement', 'der', 'dem',
        'grammar', 'meaning-affecting', 'high', 'Dative article', ?, ?)`,
    )
    .run(JSON.stringify([curriculumTopicId]), JSON.stringify({ level: "none" }));
  database
    .prepare(
      `UPDATE corrections SET state = 'final', original_text = 'der', corrected_text = 'dem'
       WHERE correction_id = 'correction_0000000000000002' AND state = 'draft'`,
    )
    .run();
  database
    .prepare(
      `INSERT OR IGNORE INTO mistake_occurrences (
        mistake_id, correction_id, attempt_id, alignment_segment_position,
        observed_on, before_context, evidence_text, after_context, explanation
      ) VALUES ('mistake_0000000000000001', 'correction_0000000000000001',
        'attempt_0000000000000001', 1, '2026-08-15', 'Ich fahre mit ', 'der',
        ' Bus.', 'Dative article error')`,
    )
    .run();
  database
    .prepare(
      `INSERT OR IGNORE INTO mistake_occurrences (
        mistake_id, correction_id, attempt_id, alignment_segment_position,
        observed_on, before_context, evidence_text, after_context, explanation
      ) VALUES ('mistake_0000000000000001', 'correction_0000000000000002',
        'attempt_0000000000000001', 0, '2026-08-16', 'mit ', 'der',
        ' Bus', 'Second dative article occurrence')`,
    )
    .run();
}

function seedVocabularyDue(database: DatabaseSync) {
  database
    .prepare(
      `INSERT OR IGNORE INTO vocabulary_entries (
        vocabulary_id, lemma, meaning, lexeme_json, examples_json, source_json,
        status, confirmed_at, due_on, stage, created_at, updated_at
      ) VALUES ('vocabulary_0000000000000001', 'der Termin', 'appointment',
        '{"partOfSpeech":"noun","nounForm":{"gender":"masculine","article":"der"},
          "plural":{"status":"form","form":"Termine"}}',
        '[{"german":"Ich habe einen Termin.","meaning":"I have an appointment."}]',
        '{"kind":"learner","context":"Everyday appointments"}', 'active', ?,
        '2026-08-15', 1, ?, ?)`,
    )
    .run(instant, instant, instant);
}

function seedExistingDataset(database: DatabaseSync) {
  seedNewLearner(database);
  seedRecurringDative(database);
  seedVocabularyDue(database);
  database
    .prepare(
      `INSERT OR IGNORE INTO prepared_activities (
        activity_id, activity_type, title, origin_surface, context_json,
        prepared_at, root_generation
      ) VALUES ('activity_0000000000000099', 'writing', 'Follow-up writing', 'desktop',
        '{"naturalRequest":"Practise appointment grammar","curriculumTopicIds":[],
          "mistakeIds":["mistake_0000000000000001"],"vocabularyIds":[]}', ?, 1)`,
    )
    .run(instant);
}

export function applyPersistenceSeedFixture(
  database: DatabaseSync,
  fixture: PersistenceSeedFixtureName,
): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    if (fixture === "new-learner") seedNewLearner(database);
    if (fixture === "writing-with-errors") seedWritingWithErrors(database);
    if (fixture === "recurring-dative") seedRecurringDative(database);
    if (fixture === "vocabulary-due") seedVocabularyDue(database);
    if (fixture === "existing-dataset") seedExistingDataset(database);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}
