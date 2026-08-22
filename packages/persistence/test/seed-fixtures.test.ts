import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import {
  curriculumTopicIdSchema,
  dataRootGenerationSchema,
  exerciseGenerationCandidateSchema,
  mistakeIdSchema,
} from "@open-deutsch/contracts";
import {
  completedAttemptSchema,
  correctedTextFromCorrection,
  correctionSchema,
  learnerProfileSchema,
  materializeGeneratedExerciseSet,
  mistakeCategorySchema,
  objectiveEvaluationSchema,
  originalTextFromCorrection,
  startedExerciseSnapshotSchema,
  vocabularyEntrySchema,
} from "@open-deutsch/domain";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  inspectDataRootChoice,
  materializeDataRootSelection,
  OpenDeutschRepository,
  openOpenDeutschDatabase,
  preparedActivitySchema,
  resolveDataRootLayout,
  writeBootstrapPointer,
} from "../src/index.js";
import {
  applyPersistenceSeedFixture,
  persistenceSeedFixtureNames,
} from "./support/seed-fixtures.js";

const factory = createDeterministicContractFactory();

function parseJson(value: unknown): unknown {
  return JSON.parse(String(value)) as unknown;
}

function expectCanonicalLearner(database: DatabaseSync): void {
  const profile = database.prepare("SELECT * FROM learner_profiles").get() as Record<
    string,
    unknown
  >;
  const settings = database.prepare("SELECT * FROM learner_settings").get() as Record<
    string,
    unknown
  >;
  const interests = database
    .prepare("SELECT value FROM learner_interests ORDER BY position")
    .all()
    .map((row) => (row as { value: string }).value);
  const preferredTopics = database
    .prepare("SELECT value FROM learner_preferred_topics ORDER BY position")
    .all()
    .map((row) => (row as { value: string }).value);
  expect(
    learnerProfileSchema.parse({
      schemaVersion: profile["schema_version"],
      learnerId: profile["learner_id"],
      levelEstimate: {
        currentLevel: profile["current_level"],
        targetLevel: profile["target_level"],
        basis: profile["level_basis"],
        updatedAt: profile["level_updated_at"],
      },
      everydayGermanyGoal: profile["everyday_germany_goal"],
      motivation: profile["motivation"],
      interests,
      preferredTopics,
      availableStudyMinutesPerWeek: profile["available_study_minutes_per_week"],
      correctionPreferences: {
        timing: settings["correction_timing"],
        coverage: settings["correction_coverage"],
        showConciseExplanation: settings["show_concise_explanation"] === 1,
        showNaturalAlternative: settings["show_natural_alternative"] === 1,
      },
      onboardingState: profile["onboarding_state"],
      inferredStrengths: [],
      inferredWeaknesses: [],
      uiLocale: settings["ui_locale"],
      teachingLanguage: settings["teaching_language"],
      defaultTeachingProfileId: settings["teaching_profile_id"],
      createdAt: profile["created_at"],
      updatedAt: profile["updated_at"],
    }).learnerId,
  ).toBe("learner_0000000000000001");
}

function expectCanonicalCompletedWriting(database: DatabaseSync): void {
  const exerciseRow = database
    .prepare("SELECT * FROM exercises WHERE exercise_id = 'exercise_0000000000000001'")
    .get() as Record<string, unknown>;
  const snapshot = startedExerciseSnapshotSchema.parse(parseJson(exerciseRow["snapshot_json"]));
  expect(parseJson(exerciseRow["objectives_json"])).toEqual(snapshot.exercise.objectives);
  expect(parseJson(exerciseRow["ai_provenance_json"])).toEqual(snapshot.exercise.aiProvenance);
  expect(exerciseRow["explanation"]).toBe(snapshot.exercise.explanation);

  const attempt = database
    .prepare("SELECT * FROM attempts WHERE attempt_id = 'attempt_0000000000000001'")
    .get() as Record<string, unknown>;
  const attemptSnapshot = startedExerciseSnapshotSchema.parse(
    parseJson(attempt["exercise_snapshot_json"]),
  );
  const rawEvaluations: unknown = parseJson(attempt["objective_evaluations_json"]);
  if (
    !Array.isArray(rawEvaluations) ||
    rawEvaluations.length !== attemptSnapshot.exercise.objectives.length
  )
    throw new Error("seed objective evaluations are incomplete");
  const evaluations = rawEvaluations.map((evaluation: unknown) =>
    objectiveEvaluationSchema.parse(evaluation),
  );
  const answers = database
    .prepare(
      `SELECT submitted_after_previous_event_ms, answer_json FROM answers
       WHERE attempt_id = 'attempt_0000000000000001' ORDER BY position`,
    )
    .all()
    .map((row) => {
      const answer = row as Record<string, unknown>;
      return {
        submittedAfterPreviousEventMilliseconds: answer["submitted_after_previous_event_ms"],
        answer: parseJson(answer["answer_json"]),
      };
    });
  expect(
    completedAttemptSchema.parse({
      schemaVersion: 1,
      attemptId: attempt["attempt_id"],
      startedAt: attempt["started_at"],
      status: "completed",
      interaction: {
        kind: attemptSnapshot.exercise.kind,
        exercise: {
          ...attemptSnapshot.exercise,
          objectives: attemptSnapshot.exercise.objectives.map((objective, index) => ({
            ...objective,
            evaluation: evaluations[index],
          })),
        },
        answers,
      },
      completedAfterPreviousEventMilliseconds: attempt["terminal_after_previous_event_ms"],
      feedback: parseJson(attempt["feedback_json"]),
    }).status,
  ).toBe("completed");
}

function expectCanonicalCorrections(database: DatabaseSync, expectedCount: number): void {
  const headers = database
    .prepare("SELECT * FROM corrections ORDER BY correction_id")
    .all() as Array<Record<string, unknown>>;
  expect(headers).toHaveLength(expectedCount);
  for (const header of headers) {
    const correctionId = header["correction_id"];
    if (typeof correctionId !== "string") throw new Error("Seed correction ID is invalid.");
    const changes = database
      .prepare("SELECT * FROM correction_changes WHERE correction_id = ? ORDER BY position")
      .all(correctionId) as Array<Record<string, unknown>>;
    const alignment = changes.map((change) =>
      change["kind"] === "unchanged"
        ? { kind: "unchanged", text: change["original_text"] }
        : {
            kind: change["kind"],
            originalText: change["original_text"],
            correctedText: change["corrected_text"],
            category: change["category"],
            severity: change["severity"],
            priority: change["priority"],
            explanation: change["explanation"],
            grammarTopicIds: parseJson(change["grammar_topic_ids_json"]),
            uncertainty: parseJson(change["uncertainty_json"]),
          },
    );
    const correction = correctionSchema.parse({
      schemaVersion: 1,
      correctionId: header["correction_id"],
      attemptId: header["attempt_id"],
      createdAt: header["created_at"],
      aiProvenance: parseJson(header["ai_provenance_json"]),
      alignment,
      naturalAlternative: parseJson(header["natural_alternative_json"]),
      vocabularyCandidates: [],
      followUp: parseJson(header["follow_up_json"]),
      overallUncertainty: parseJson(header["overall_uncertainty_json"]),
    });
    expect(originalTextFromCorrection(correction)).toBe(header["original_text"]);
    expect(correctedTextFromCorrection(correction)).toBe(header["corrected_text"]);
  }
}

describe("realistic persistence seed fixtures", () => {
  it("declares the exact supported fixture catalog", () => {
    expect(persistenceSeedFixtureNames).toEqual([
      "new-learner",
      "writing-with-errors",
      "recurring-dative",
      "vocabulary-due",
      "existing-dataset",
    ]);
  });

  for (const fixture of persistenceSeedFixtureNames) {
    it(`builds and reapplies the ${fixture} scenario independently`, async ({ disposableData }) => {
      const plan = await inspectDataRootChoice(disposableData.dataRoot);
      await materializeDataRootSelection(plan, {
        generation: dataRootGenerationSchema.parse(1),
        createdAt: factory.nextInstant(),
        testMode: true,
      });
      const bootstrapFile = path.join(
        disposableData.configRoot,
        "open-deutsch",
        `seeds-${fixture}.json`,
      );
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
      const repository = new OpenDeutschRepository(handle);
      const database = new DatabaseSync(resolveDataRootLayout(disposableData.dataRoot).database);
      database.exec("PRAGMA foreign_keys = ON;");

      applyPersistenceSeedFixture(database, fixture);
      applyPersistenceSeedFixture(database, fixture);

      if (fixture === "new-learner" || fixture === "existing-dataset") {
        expect(database.prepare("SELECT count(*) AS count FROM learner_profiles").get()).toEqual({
          count: 1,
        });
        expectCanonicalLearner(database);
      }
      if (
        fixture === "writing-with-errors" ||
        fixture === "recurring-dative" ||
        fixture === "existing-dataset"
      ) {
        expectCanonicalCompletedWriting(database);
        expectCanonicalCorrections(database, fixture === "writing-with-errors" ? 1 : 2);
      }
      if (fixture === "recurring-dative" || fixture === "existing-dataset") {
        const row = database
          .prepare(
            "SELECT effective_category_json FROM mistakes WHERE mistake_id = 'mistake_0000000000000001'",
          )
          .get() as { effective_category_json: string };
        expect(mistakeCategorySchema.parse(JSON.parse(row.effective_category_json))).toEqual({
          kind: "grammar",
          categoryKey: "dative-case",
          curriculumTopicIds: ["curriculum-topic_0000000000000001"],
        });
        expect(database.prepare("SELECT count(*) AS count FROM mistake_occurrences").get()).toEqual(
          { count: 2 },
        );
        const vocabularyCategory = JSON.stringify({
          kind: "vocabulary",
          categoryKey: "word-choice.appointment",
          lemma: "Termin",
        });
        database
          .prepare(
            `INSERT INTO mistakes (
              mistake_id, inferred_category_json, effective_category_json,
              classification_source, learner_amended_at, disposition
            ) VALUES ('mistake_0000000000000002', ?, ?, 'learner-amended',
              '2026-08-14T10:00:00.000Z', 'active')`,
          )
          .run(
            JSON.stringify({
              kind: "vocabulary",
              categoryKey: "word-choice.meeting",
              lemma: "Treffen",
            }),
            vocabularyCategory,
          );
        database
          .prepare(
            `INSERT INTO mistake_occurrences (
              mistake_id, correction_id, attempt_id, alignment_segment_position,
              observed_on, before_context, evidence_text, after_context, explanation
            ) VALUES ('mistake_0000000000000002', 'correction_0000000000000001',
              'attempt_0000000000000001', 1, '2026-08-14', 'ein ', 'Treffen',
              ' vereinbaren', 'Termin is more precise in this context.')`,
          )
          .run();
        const patterns = await repository.listMistakePatterns();
        expect(patterns).toMatchObject([
          {
            category: { kind: "grammar", categoryKey: "dative-case" },
            status: "recurring",
            occurrenceCount: 2,
            classificationSource: "inferred",
            occurrences: [
              { observedOn: "2026-08-16", evidence: { evidenceText: "der" } },
              { observedOn: "2026-08-15", evidence: { evidenceText: "der" } },
            ],
          },
          {
            category: {
              kind: "vocabulary",
              categoryKey: "word-choice.appointment",
              lemma: "Termin",
            },
            status: "single-occurrence",
            occurrenceCount: 1,
            classificationSource: "learner-amended",
            occurrences: [
              {
                observedOn: "2026-08-14",
                evidence: { evidenceText: "Treffen" },
                classificationSource: "learner-amended",
              },
            ],
          },
        ]);
        expect(
          await repository.listMistakePatterns({
            fromDate: "2026-08-16",
            toDate: "2026-08-16",
            curriculumTopicId: "curriculum-topic_0000000000000001",
            mistakeCategory: "dative-case",
          }),
        ).toMatchObject([
          {
            category: { kind: "grammar", categoryKey: "dative-case" },
            status: "single-occurrence",
            occurrenceCount: 1,
            occurrences: [{ observedOn: "2026-08-16" }],
          },
        ]);
        if (fixture === "recurring-dative") {
          const preparedAt = factory.nextInstant();
          const activityId = factory.nextId("activity");
          await repository.saveTargetedPracticeActivity(
            {
              activity: {
                activityId,
                activityType: "grammar",
                title: "Targeted dative practice",
                originSurface: "desktop",
                context: {
                  naturalRequest: "Create targeted dative practice.",
                  curriculumTopicIds: [
                    curriculumTopicIdSchema.parse("curriculum-topic_0000000000000001"),
                  ],
                  mistakeIds: [mistakeIdSchema.parse("mistake_0000000000000001")],
                  vocabularyIds: [],
                },
                preparedAt,
              },
              category: {
                kind: "grammar",
                categoryKey: "dative-case",
                curriculumTopicIds: [
                  curriculumTopicIdSchema.parse("curriculum-topic_0000000000000001"),
                ],
              },
              aiProvenance: {
                source: "ai",
                producer: "desktop-app-server",
                modelRequestId: factory.nextId("modelRequest"),
                generatedAt: preparedAt,
                modelSelection: {
                  availability: "reported",
                  modelId: "runtime-default",
                  effortId: "medium",
                },
              },
              output: exerciseGenerationCandidateSchema.parse({
                lesson: null,
                exercises: [
                  {
                    kind: "short-answer",
                    title: "Dative after mit",
                    instructions: "Answer in German.",
                    explanation: "Use the dative case after mit.",
                    cefrBand: "A2",
                    objectives: ["Use the dative article after mit."],
                    hints: [],
                    question: "Complete: Ich fahre mit ___ Bahn.",
                    acceptedAnswers: ["der"],
                  },
                ],
                uncertainty: { level: "none" },
                caveats: [],
              }),
              vocabularyEntries: [],
            },
            "targeted-practice-seed-1",
          );
          expect(
            await repository.listMistakePatterns({ mistakeCategory: "dative-case" }),
          ).toMatchObject([
            {
              targetedPractice: { status: "created", activityId, createdAt: preparedAt },
              occurrenceCount: 2,
            },
          ]);
          expect(
            database
              .prepare("SELECT output_json FROM generated_activity_payloads WHERE activity_id = ?")
              .get(activityId),
          ).toBeDefined();
          const generated = await repository.readGeneratedActivity(activityId);
          expect(generated?.output.exercises).toHaveLength(1);
          if (!generated) throw new Error("expected generated activity");
          const startedAt = factory.nextInstant();
          const exercises = materializeGeneratedExerciseSet(generated.output, {
            exerciseIds: [factory.nextId("exercise")],
            aiProvenance: generated.aiProvenance,
            curriculumTopicIds: generated.context.curriculumTopicIds,
          });
          const generatedAttemptId = factory.nextId("attempt");
          await repository.startGeneratedExerciseSet({
            activityId,
            startedAt,
            exercises: exercises.map((exercise) => ({
              attemptId: generatedAttemptId,
              snapshot: { schemaVersion: 1, lifecycle: "started", startedAt, exercise },
            })),
          });
          expect(await repository.readActiveGeneratedExerciseSet(activityId)).toEqual({
            startedAt,
            attemptIds: [generatedAttemptId],
          });
          const duplicateStartedAt = factory.nextInstant();
          const duplicateDefinitions = materializeGeneratedExerciseSet(generated.output, {
            exerciseIds: [factory.nextId("exercise")],
            aiProvenance: generated.aiProvenance,
            curriculumTopicIds: generated.context.curriculumTopicIds,
          });
          await expect(
            repository.startGeneratedExerciseSet({
              activityId,
              startedAt: duplicateStartedAt,
              exercises: duplicateDefinitions.map((exercise) => ({
                attemptId: factory.nextId("attempt"),
                snapshot: {
                  schemaVersion: 1,
                  lifecycle: "started",
                  startedAt: duplicateStartedAt,
                  exercise,
                },
              })),
            }),
          ).rejects.toThrow("OD_EXERCISE_ATTEMPT_SET_ACTIVE");
          expect(database.prepare("SELECT count(*) AS count FROM attempts").get()).toEqual({
            count: 2,
          });
          await expect(
            repository.completeGeneratedExerciseSet({
              activityId,
              completedAt: factory.nextInstant(),
              answers: [
                {
                  attemptId: generatedAttemptId,
                  historyEntryId: factory.nextId("historyEntry"),
                  answer: { kind: "short-answer", text: "eine andere mögliche Formulierung" },
                },
              ],
            }),
          ).rejects.toThrow("OD_EXERCISE_AI_FEEDBACK_REQUIRED");
          expect(
            database
              .prepare("SELECT status FROM attempts WHERE attempt_id = ?")
              .get(generatedAttemptId),
          ).toEqual({ status: "in-progress" });
          const openAnswer = {
            kind: "short-answer" as const,
            text: "eine andere mögliche Formulierung",
          };
          await repository.saveGeneratedExerciseAnswer({
            activityId,
            attemptId: generatedAttemptId,
            submittedAt: factory.nextInstant(),
            answer: openAnswer,
          });
          expect(
            database
              .prepare("SELECT answer_json FROM answers WHERE attempt_id = ?")
              .get(generatedAttemptId),
          ).toBeDefined();
          await repository.completeGeneratedExerciseSet({
            activityId,
            completedAt: factory.nextInstant(),
            answers: [
              {
                attemptId: generatedAttemptId,
                historyEntryId: factory.nextId("historyEntry"),
                answer: openAnswer,
                aiFeedback: {
                  modelRequestId: factory.nextId("modelRequest"),
                  output: {
                    outcome: "developing",
                    summary: "The answer is understandable but does not use the requested form.",
                    strengths: ["The response is a plausible German phrase."],
                    improvements: ["Use der to complete the supplied sentence."],
                    objectiveEvaluations: [
                      {
                        outcome: "developing",
                        evidence: "The requested dative article was not supplied.",
                        uncertainty: { level: "none" },
                      },
                    ],
                    suggestedAnswer: "der",
                    nextStep: "Try another sentence with mit.",
                    overallUncertainty: { level: "none" },
                    caveats: [],
                  },
                },
              },
            ],
          });
          expect(
            database
              .prepare("SELECT status FROM attempts WHERE attempt_id = ?")
              .get(generatedAttemptId),
          ).toEqual({ status: "completed" });
          const generatedHistory = (await repository.listHistory()).find(
            ({ detail }) => detail.kind === "exercise-attempt",
          );
          expect(generatedHistory?.detail).toMatchObject({
            kind: "exercise-attempt",
            answer: openAnswer,
            suggestedAnswer: "der",
            feedback: { source: { kind: "ai" } },
          });
          expect(generatedHistory?.skill).toBe("writing");
          expect(await repository.readActiveGeneratedExerciseSet(activityId)).toBeUndefined();
          const abandonedActivityId = factory.nextId("activity");
          const abandonedAt = factory.nextInstant();
          await repository.saveGeneratedPracticeActivity(
            {
              activity: {
                activityId: abandonedActivityId,
                activityType: "custom-lesson",
                title: "Reusable abandoned practice",
                originSurface: "desktop",
                context: {
                  naturalRequest: "Practise another dative sentence.",
                  curriculumTopicIds: generated.context.curriculumTopicIds,
                  mistakeIds: [],
                  vocabularyIds: [],
                },
                preparedAt: abandonedAt,
              },
              aiProvenance: generated.aiProvenance,
              output: generated.output,
              vocabularyEntries: [],
            },
            "generated-abandon-seed-1",
          );
          const abandonedExerciseId = factory.nextId("exercise");
          const abandonedAttemptId = factory.nextId("attempt");
          const abandonedDefinition = materializeGeneratedExerciseSet(generated.output, {
            exerciseIds: [abandonedExerciseId],
            aiProvenance: generated.aiProvenance,
            curriculumTopicIds: generated.context.curriculumTopicIds,
          })[0];
          if (!abandonedDefinition) throw new Error("expected generated exercise");
          await repository.startGeneratedExerciseSet({
            activityId: abandonedActivityId,
            startedAt: abandonedAt,
            exercises: [
              {
                attemptId: abandonedAttemptId,
                snapshot: {
                  schemaVersion: 1,
                  lifecycle: "started",
                  startedAt: abandonedAt,
                  exercise: abandonedDefinition,
                },
              },
            ],
          });
          expect(
            await repository.abandonGeneratedExerciseSet({
              activityId: abandonedActivityId,
              abandonedAt: factory.nextInstant(),
            }),
          ).toEqual([abandonedAttemptId]);
          expect(
            await repository.readActiveGeneratedExerciseSet(abandonedActivityId),
          ).toBeUndefined();
          expect(
            database
              .prepare("SELECT status FROM attempts WHERE attempt_id = ?")
              .get(abandonedAttemptId),
          ).toEqual({ status: "abandoned" });
          expect(await repository.readGeneratedActivity(abandonedActivityId)).toBeDefined();
          expect(
            database.prepare("SELECT count(*) AS count FROM mistake_occurrences").get(),
          ).toEqual({
            count: 3,
          });
        }
      }
      if (fixture === "vocabulary-due" || fixture === "existing-dataset") {
        const due = await repository.listDueVocabulary("2026-08-15");
        expect(due).toHaveLength(1);
        expect(vocabularyEntrySchema.parse(due[0]).state.status).toBe("active");
      }
      if (fixture === "existing-dataset") {
        const activity = database.prepare("SELECT * FROM prepared_activities").get() as Record<
          string,
          unknown
        >;
        expect(
          preparedActivitySchema.parse({
            activityId: activity["activity_id"],
            activityType: activity["activity_type"],
            title: activity["title"],
            originSurface: activity["origin_surface"],
            context: parseJson(activity["context_json"]),
            preparedAt: activity["prepared_at"],
          }).activityId,
        ).toBe("activity_0000000000000099");
        expect(activity["root_generation"]).toBe(1);
        expect(database.prepare("SELECT count(*) AS count FROM prepared_activities").get()).toEqual(
          { count: 1 },
        );

        const dashboard = await repository.readDashboardSnapshot("2026-08-15");
        expect(dashboard.rootGeneration).toBe(1);
        expect(dashboard.weeklyPlan).toBeNull();
        expect(dashboard.preparedActivities).toEqual([
          {
            activityId: "activity_0000000000000099",
            activityType: "writing",
            title: "Follow-up writing",
            originSurface: "desktop",
            preparedAt: "2026-08-15T10:00:00.000Z",
          },
        ]);
        expect(dashboard.preparedActivities[0]).not.toHaveProperty("context");
        expect(dashboard.dueVocabulary).toEqual([
          {
            vocabularyId: "vocabulary_0000000000000001",
            lemma: "der Termin",
            meaning: "appointment",
            dueOn: "2026-08-15",
            stage: 1,
          },
        ]);
        expect(dashboard.recentCorrections).toEqual([
          {
            correctionId: "correction_0000000000000001",
            createdAt: "2026-08-15T10:00:00.000Z",
            changedSegmentCount: 1,
          },
          {
            correctionId: "correction_0000000000000002",
            createdAt: "2026-08-15T10:00:00.000Z",
            changedSegmentCount: 1,
          },
        ]);
        expect(dashboard.recurringMistakes).toEqual([
          {
            mistakeId: "mistake_0000000000000001",
            category: {
              kind: "grammar",
              categoryKey: "dative-case",
              curriculumTopicIds: ["curriculum-topic_0000000000000001"],
            },
            occurrenceCount: 2,
            lastObservedOn: "2026-08-16",
          },
        ]);
        expect(await repository.readCorrectionMistakeSample()).toEqual([
          {
            kind: "grammar",
            categoryKey: "dative-case",
            occurrenceCount: 2,
            lastObservedOn: "2026-08-16",
          },
        ]);
        expect(JSON.stringify(await repository.readCorrectionMistakeSample())).not.toContain(
          "evidenceText",
        );
      }

      database.close();
      handle.close();
    });
  }
});
