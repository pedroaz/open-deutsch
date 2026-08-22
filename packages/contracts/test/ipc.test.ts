import { describe, expect, expectTypeOf, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  desktopIpcChannels,
  desktopIpcEventSchema,
  desktopIpcRequestSchema,
  desktopIpcResponseSchema,
  learningOperationKinds,
  calendarDateSchema,
  dataRootGenerationSchema,
  placementResultSchema,
  toBoundaryJsonSchema,
  type DesktopIpcRequest,
  type OpenDeutschDesktopBridge,
} from "../src/index.js";

const factory = createDeterministicContractFactory();
const requestId = () => factory.nextId("correlation");
const writingInput = (learnerText: string) => ({
  kind: "writing-correction" as const,
  learnerText,
});
const editableSettings = {
  approximateLevel: "a2" as const,
  everydayGermanyGoal: "Handle appointments confidently.",
  availableStudyMinutesPerWeek: 90,
  defaultTeachingProfileId: "conversation-partner" as const,
  explanationLanguage: "de" as const,
  uiLocale: "en" as const,
  correctionPreferences: {
    timing: "adaptive" as const,
    coverage: "all-meaningful" as const,
    showConciseExplanation: true,
    showNaturalAlternative: true,
  },
  modelPreferences: {
    schemaVersion: 1 as const,
    correction: {
      model: { mode: "automatic" as const },
      effort: { mode: "semantic" as const, effort: "balanced" as const },
    },
    generation: {
      model: { mode: "automatic" as const },
      effort: { mode: "semantic" as const, effort: "balanced" as const },
    },
    helper: {
      model: { mode: "automatic" as const },
      effort: { mode: "semantic" as const, effort: "fast" as const },
    },
    research: {
      model: { mode: "automatic" as const },
      effort: { mode: "semantic" as const, effort: "deep" as const },
    },
  },
};

describe("typed preload and IPC contracts", () => {
  it("exposes only the accepted semantic operation channels", () => {
    expect(desktopIpcChannels).toEqual([
      "app/readiness",
      "data-root/read",
      "data-root/choose",
      "data-root/confirm",
      "privacy/ai-disclosure/read",
      "privacy/ai-disclosure/acknowledge",
      "placement/complete",
      "reading/complete",
      "codex-activity/prepare",
      "learner-profile/read",
      "learner-profile/complete-onboarding",
      "learner-settings/read",
      "learner-settings/update",
      "diagnostics/read",
      "diagnostics/export",
      "logs/clear",
      "dashboard/read",
      "weekly-plan/read",
      "vocabulary/read",
      "vocabulary-set/create",
      "vocabulary/confirm",
      "vocabulary/review",
      "vocabulary/edit",
      "vocabulary/suspend",
      "vocabulary/resume",
      "vocabulary/delete",
      "prepared-activity/read",
      "exercise-set/start",
      "exercise-set/complete",
      "exercise-set/abandon",
      "history/read",
      "history/mistake-amend",
      "history/delete",
      "codex/integration/read",
      "codex/integration/action",
      "codex/account/read",
      "codex/account/login/start",
      "codex/account/login/cancel",
      "codex/account/logout",
      "codex/models/read",
      "codex/rate-limits/read",
      "learning-operation/start",
      "learning-operation/retry",
      "learning-operation/cancel",
    ]);
    expect(learningOperationKinds).toEqual([
      "writing-prompt",
      "writing-correction",
      "contextual-help",
      "exercise-generation",
      "exercise-feedback",
      "weekly-plan-generation",
    ]);
  });

  it("validates every request and correlates the TypeScript bridge by channel", () => {
    const requests: unknown[] = [
      { channel: "app/readiness", requestId: requestId(), payload: {} },
      { channel: "data-root/read", requestId: requestId(), payload: {} },
      {
        channel: "data-root/choose",
        requestId: requestId(),
        payload: { expectedGeneration: dataRootGenerationSchema.parse(2) },
      },
      {
        channel: "data-root/confirm",
        requestId: requestId(),
        payload: { selectionId: requestId() },
      },
      { channel: "privacy/ai-disclosure/read", requestId: requestId(), payload: {} },
      { channel: "privacy/ai-disclosure/acknowledge", requestId: requestId(), payload: {} },
      {
        channel: "placement/complete",
        requestId: requestId(),
        payload: {
          result: placementResultSchema.parse({
            schemaVersion: 1,
            completedOn: "2026-08-20",
            estimatedLevel: "a2",
            uncertainty: { level: "some", explanation: "Orientation only." },
            sampleResults: [
              {
                kind: "grammar",
                topic: "Articles",
                outcome: "developing",
                evidence: "One item.",
                uncertainty: { level: "some", explanation: "One item only." },
              },
              {
                kind: "vocabulary",
                topic: "Appointments",
                outcome: "demonstrated",
                evidence: "One item.",
                uncertainty: { level: "some", explanation: "One item only." },
              },
              {
                kind: "reading",
                topic: "Notices",
                outcome: "developing",
                evidence: "One item.",
                uncertainty: { level: "some", explanation: "One item only." },
              },
              {
                kind: "writing",
                topic: "Messages",
                outcome: "developing",
                evidence: "One item.",
                uncertainty: { level: "substantial", explanation: "No model review." },
              },
            ],
            voiceCalibration: {
              status: "unavailable",
              code: "OD_HANDOFF_VOICE_SESSION_UNSUPPORTED",
              explanation: "Unavailable.",
            },
          }),
        },
      },
      {
        channel: "reading/complete",
        requestId: requestId(),
        payload: {
          result: {
            schemaVersion: 1,
            title: "A notice",
            cefrBand: "a2",
            source: {
              kind: "bundled",
              label: "Open Deutsch",
              retrievedOn: calendarDateSchema.parse("2026-08-20"),
            },
            passage: "The appointment starts at ten.",
            exerciseResults: [
              {
                kind: "comprehension",
                outcome: "demonstrated",
                evidence: "Time identified.",
                uncertainty: { level: "some", explanation: "One item." },
              },
              {
                kind: "summary",
                outcome: "developing",
                evidence: "Summary retained.",
                uncertainty: { level: "substantial", explanation: "No model scoring." },
              },
              {
                kind: "vocabulary-in-context",
                outcome: "developing",
                evidence: "Word retained.",
                uncertainty: { level: "some", explanation: "One item." },
              },
              {
                kind: "inference",
                outcome: "developing",
                evidence: "Inference retained.",
                uncertainty: { level: "some", explanation: "One item." },
              },
            ],
            difficultWords: ["Termin"],
            promptInjectionNotice: "OD_UNTRUSTED_READING_TEXT_TREATED_AS_DATA",
          },
        },
      },
      {
        channel: "codex-activity/prepare",
        requestId: requestId(),
        payload: {
          title: "Appointment listening",
          context: {
            schemaVersion: 1,
            kind: "listening",
            targetLevel: "a2",
            scenario: "Understand an appointment call",
            difficulty: "intermediate",
            correctionTiming: "after-each",
            objectives: ["Catch the new time."],
            script: "The caller moves the appointment to Thursday.",
            questions: ["What is the new time?"],
            answerGuidance: ["State the time as evidence."],
            handoff: {
              status: "unavailable",
              code: "OD_HANDOFF_VOICE_SESSION_UNSUPPORTED",
              explanation: "Exact handoff is unavailable.",
            },
          },
        },
      },
      { channel: "learner-profile/read", requestId: requestId(), payload: {} },
      {
        channel: "learner-profile/complete-onboarding",
        requestId: requestId(),
        payload: {
          approximateLevel: "a2",
          everydayGermanyGoal: "Handle appointments confidently.",
          availableStudyMinutesPerWeek: 90,
          defaultTeachingProfileId: "conversation-partner",
          explanationLanguage: "de",
          placement: { status: "skipped" },
        },
      },
      { channel: "learner-settings/read", requestId: requestId(), payload: {} },
      {
        channel: "learner-settings/update",
        requestId: requestId(),
        payload: { expectedUpdatedAt: "2026-08-15T08:30:00.000Z", settings: editableSettings },
      },
      { channel: "diagnostics/read", requestId: requestId(), payload: {} },
      { channel: "diagnostics/export", requestId: requestId(), payload: {} },
      { channel: "logs/clear", requestId: requestId(), payload: {} },
      { channel: "dashboard/read", requestId: requestId(), payload: {} },
      { channel: "weekly-plan/read", requestId: requestId(), payload: {} },
      {
        channel: "prepared-activity/read",
        requestId: requestId(),
        payload: { activityId: factory.nextId("activity") },
      },
      {
        channel: "exercise-set/start",
        requestId: requestId(),
        payload: {
          activityId: factory.nextId("activity"),
          feedbackModeOverride: "submit-at-end",
        },
      },
      {
        channel: "exercise-set/complete",
        requestId: requestId(),
        payload: {
          activityId: factory.nextId("activity"),
          answers: [
            {
              attemptId: factory.nextId("attempt"),
              answer: { kind: "multiple-choice", selectedOptionPosition: 2 },
            },
          ],
        },
      },
      {
        channel: "exercise-set/abandon",
        requestId: requestId(),
        payload: { activityId: factory.nextId("activity") },
      },
      {
        channel: "history/read",
        requestId: requestId(),
        payload: { skill: "writing", activityType: "writing", maximum: 50 },
      },
      {
        channel: "history/mistake-amend",
        requestId: requestId(),
        payload: {
          expectedGeneration: dataRootGenerationSchema.parse(1),
          mistakeId: factory.nextId("mistake"),
          effectiveCategory: {
            kind: "grammar",
            categoryKey: "grammar.article",
            curriculumTopicIds: [],
          },
        },
      },
      {
        channel: "history/delete",
        requestId: requestId(),
        payload: { historyEntryId: factory.nextId("historyEntry") },
      },
      { channel: "codex/integration/read", requestId: requestId(), payload: {} },
      {
        channel: "codex/integration/action",
        requestId: requestId(),
        payload: { action: "install" },
      },
      { channel: "codex/account/read", requestId: requestId(), payload: {} },
      {
        channel: "codex/account/login/start",
        requestId: requestId(),
        payload: { method: "browser" },
      },
      {
        channel: "codex/account/login/cancel",
        requestId: requestId(),
        payload: { loginId: requestId() },
      },
      { channel: "codex/account/logout", requestId: requestId(), payload: {} },
      { channel: "codex/models/read", requestId: requestId(), payload: {} },
      { channel: "codex/rate-limits/read", requestId: requestId(), payload: {} },
      {
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: {
          submissionId: requestId(),
          input: writingInput("Ich gehen heute."),
        },
      },
      {
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: {
          submissionId: requestId(),
          input: {
            kind: "contextual-help",
            sessionId: requestId(),
            selectedText: "einen Termin",
            containingSentence: "Ich brauche einen Termin.",
            question: "Why is this accusative?",
            activeResultSummary: "The article was corrected.",
          },
        },
      },
      {
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: {
          submissionId: requestId(),
          input: {
            kind: "exercise-feedback",
            activityId: factory.nextId("activity"),
            attemptId: factory.nextId("attempt"),
            answer: { kind: "short-answer", text: "Ich gehe morgen zu Arzt." },
          },
        },
      },
      {
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: {
          submissionId: requestId(),
          input: {
            kind: "exercise-generation",
            request: {
              source: "mistake-pattern",
              category: {
                kind: "grammar",
                categoryKey: "dative-case",
                curriculumTopicIds: [factory.nextId("curriculumTopic")],
              },
            },
          },
        },
      },
      {
        channel: "learning-operation/retry",
        requestId: requestId(),
        payload: { previousOperationId: requestId(), submissionId: requestId() },
      },
      {
        channel: "learning-operation/cancel",
        requestId: requestId(),
        payload: { operationId: requestId() },
      },
    ] satisfies DesktopIpcRequest[];
    for (const request of requests) {
      expect(desktopIpcRequestSchema.safeParse(request).success).toBe(true);
    }
    expectTypeOf<OpenDeutschDesktopBridge["subscribe"]>().toBeFunction();
    expectTypeOf<OpenDeutschDesktopBridge["ready"]>().toBeFunction();
  });

  it("keeps onboarding profile input narrow and UI locale out of renderer writes", () => {
    const base = {
      channel: "learner-profile/complete-onboarding",
      requestId: requestId(),
      payload: {
        approximateLevel: "a2",
        everydayGermanyGoal: "Handle appointments confidently.",
        availableStudyMinutesPerWeek: 90,
        defaultTeachingProfileId: "conversation-partner",
        explanationLanguage: "de",
        placement: { status: "skipped" },
      },
    };
    expect(desktopIpcRequestSchema.safeParse(base).success).toBe(true);
    for (const extra of [
      { uiLocale: "de" },
      { accessToken: "secret" },
      { learnerId: factory.nextId("learner") },
      { modelSelection: { modelId: "forged" } },
    ]) {
      expect(
        desktopIpcRequestSchema.safeParse({
          ...base,
          payload: { ...base.payload, ...extra },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects raw filesystem, SQLite, credential, and App Server escape hatches", () => {
    for (const candidate of [
      {
        channel: "filesystem/read",
        requestId: requestId(),
        payload: { path: "/home/learner/private" },
      },
      { channel: "database/query", requestId: requestId(), payload: { sql: "select *" } },
      {
        channel: "app-server/request",
        requestId: requestId(),
        payload: { method: "thread/start", params: {} },
      },
      { channel: "codex/account/read", requestId: requestId(), payload: { accessToken: "secret" } },
      {
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: {
          input: { ...writingInput("Text"), cwd: "/", network: true },
          submissionId: requestId(),
        },
      },
      {
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: {
          submissionId: requestId(),
          input: {
            ...writingInput("Text"),
            calibration: {
              approximateLevel: "A2",
              explanationLanguage: "en",
              teachingProfile: "strict-corrector",
            },
          },
        },
      },
      {
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: { input: { kind: "writing-correction", learnerText: "Missing identifier" } },
      },
      {
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: {
          input: {
            kind: "exercise-generation",
            request: { source: "natural-request", naturalRequest: "x".repeat(2_001) },
          },
          submissionId: requestId(),
        },
      },
    ]) {
      expect(desktopIpcRequestSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("keeps contextual-help input selected, bounded, and protocol-free", () => {
    const base = {
      channel: "learning-operation/start",
      requestId: requestId(),
      payload: {
        submissionId: requestId(),
        input: {
          kind: "contextual-help",
          sessionId: requestId(),
          selectedText: "einen Termin",
          containingSentence: "Ich brauche einen Termin.",
          question: "Why is this accusative?",
        },
      },
    };
    expect(desktopIpcRequestSchema.safeParse(base).success).toBe(true);
    for (const privileged of [
      { activityId: factory.nextId("activity") },
      { priorTurns: [{ question: "private", answer: "private" }] },
      { relevantMistakes: [{ categoryKey: "forged" }] },
      { rawProtocol: { method: "turn/start" } },
      { modelId: "forged" },
    ]) {
      expect(
        desktopIpcRequestSchema.safeParse({
          ...base,
          payload: { ...base.payload, input: { ...base.payload.input, ...privileged } },
        }).success,
      ).toBe(false);
    }
  });

  it("projects only renderer-safe data-root, account, model, and rate-limit results", () => {
    const responses = [
      {
        status: "ok",
        channel: "data-root/read",
        requestId: requestId(),
        result: { status: "ready", generation: 2, displayName: "German learning", warnings: [] },
      },
      {
        status: "ok",
        channel: "codex/account/read",
        requestId: requestId(),
        result: { status: "signed-in", planType: "plus" },
      },
      {
        status: "ok",
        channel: "codex/models/read",
        requestId: requestId(),
        result: {
          models: [
            {
              id: "gpt-runtime-model",
              displayName: "Runtime model",
              isDefault: true,
              defaultReasoningEffort: "medium",
              supportedReasoningEfforts: ["low", "medium", "high"],
              inputModalities: ["text"],
            },
          ],
          runtimeDefaultModelId: "gpt-runtime-model",
          missingReasoningMetadata: [],
        },
      },
      {
        status: "ok",
        channel: "codex/rate-limits/read",
        requestId: requestId(),
        result: {
          buckets: [
            {
              limitId: "codex",
              planType: "plus",
              primary: { usedPercent: 12, resetsAt: 1_800_000_000 },
              secondary: null,
            },
          ],
        },
      },
      {
        status: "ok",
        channel: "codex/account/login/cancel",
        requestId: requestId(),
        result: { loginId: requestId(), status: "cancelled" },
      },
      {
        status: "ok",
        channel: "learning-operation/start",
        requestId: requestId(),
        result: {
          operationId: requestId(),
          submissionId: requestId(),
          status: "accepted",
          submission: "retained",
        },
      },
      {
        status: "ok",
        channel: "learning-operation/retry",
        requestId: requestId(),
        result: {
          operationId: requestId(),
          submissionId: requestId(),
          status: "accepted",
          submission: "retained",
        },
      },
      {
        status: "ok",
        channel: "learner-settings/read",
        requestId: requestId(),
        result: {
          dataRoot: { generation: 2, displayName: "German learning" },
          settings: editableSettings,
          updatedAt: "2026-08-15T08:30:00.000Z",
        },
      },
      {
        status: "ok",
        channel: "diagnostics/read",
        requestId: requestId(),
        result: {
          dataRootGeneration: 2,
          dataRootFormatVersion: 1,
          databaseSchemaVersion: 11,
          journalMode: "wal",
          foreignKeysEnabled: true,
          logFileCount: 2,
        },
      },
      {
        status: "ok",
        channel: "logs/clear",
        requestId: requestId(),
        result: { clearedFileCount: 2 },
      },
      {
        status: "ok",
        channel: "dashboard/read",
        requestId: requestId(),
        result: {
          rootGeneration: 2,
          refreshedAt: "2026-08-15T08:30:00.000Z",
          weeklyPlan: null,
          preparedActivities: [],
          dueVocabulary: [],
          recentCorrections: [],
          recurringMistakes: [],
        },
      },
      {
        status: "ok",
        channel: "prepared-activity/read",
        requestId: requestId(),
        result: {
          activityId: factory.nextId("activity"),
          title: "Appointment practice",
          curriculumTopicIds: [],
          provenance: {
            modelRequestId: factory.nextId("modelRequest"),
            generatedAt: "2026-08-15T08:30:00.000Z",
            modelId: "gpt-runtime",
            effortId: "medium",
          },
          output: {
            exercises: [
              {
                kind: "short-answer",
                title: "Appointment",
                instructions: "Answer in German.",
                explanation: null,
                cefrBand: "A2",
                objectives: ["Use appointment vocabulary."],
                hints: [],
                question: "Wann gehst du zum Arzt?",
                acceptedAnswers: ["Ich gehe morgen zum Arzt."],
              },
            ],
            uncertainty: { level: "none" },
            caveats: [],
          },
        },
      },
      {
        status: "ok",
        channel: "exercise-set/start",
        requestId: requestId(),
        result: {
          activityId: factory.nextId("activity"),
          status: "started",
          startedAt: "2026-08-15T08:30:00.000Z",
          attemptIds: [factory.nextId("attempt")],
        },
      },
      {
        status: "ok",
        channel: "exercise-set/complete",
        requestId: requestId(),
        result: {
          activityId: factory.nextId("activity"),
          status: "completed",
          completedAt: "2026-08-15T08:30:00.000Z",
        },
      },
      {
        status: "ok",
        channel: "exercise-set/abandon",
        requestId: requestId(),
        result: {
          activityId: factory.nextId("activity"),
          status: "abandoned",
          abandonedAt: "2026-08-15T08:30:00.000Z",
        },
      },
      {
        status: "ok",
        channel: "history/read",
        requestId: requestId(),
        result: {
          rootGeneration: 2,
          mistakePatterns: [
            {
              category: {
                kind: "grammar",
                categoryKey: "dative-case",
                curriculumTopicIds: [factory.nextId("curriculumTopic")],
              },
              status: "recurring",
              occurrenceCount: 2,
              classificationSource: "inferred",
              targetedPractice: { status: "not-created" },
              occurrences: [
                {
                  mistakeId: factory.nextId("mistake"),
                  observedOn: "2026-08-15",
                  evidence: { beforeContext: "mit ", evidenceText: "der", afterContext: " Bus" },
                  explanation: "Use the dative article after mit.",
                  classificationSource: "inferred",
                },
                {
                  mistakeId: factory.nextId("mistake"),
                  observedOn: "2026-08-10",
                  evidence: { beforeContext: "mit ", evidenceText: "die", afterContext: " Bahn" },
                  explanation: "This preposition requires dative here.",
                  classificationSource: "inferred",
                },
              ],
            },
          ],
          entries: [
            {
              historyEntryId: factory.nextId("historyEntry"),
              entityKind: "attempt",
              skill: "writing",
              activityType: "writing",
              title: "Appointment request",
              occurredAt: "2026-08-15T08:30:00.000Z",
              curriculumTopicIds: [],
              mistakeCategories: ["grammar.article"],
              detail: {
                kind: "writing-correction",
                learnerText: "Ich brauche ein Termin.",
                correctedText: "Ich brauche einen Termin.",
                feedback: {
                  summary: "One article was corrected.",
                  strengths: ["The request is clear."],
                  improvements: ["Use the accusative article."],
                  overallUncertainty: { level: "none" },
                },
                provenance: {
                  availability: "reported",
                  modelRequestId: factory.nextId("modelRequest"),
                  generatedAt: "2026-08-15T08:30:00.000Z",
                  modelId: "gpt-runtime",
                  effortId: "medium",
                },
                vocabularyCandidates: [
                  {
                    lemma: "benötigen",
                    meaning: "to need",
                    sourceExcerpt: "brauche",
                    rationale: "A formal alternative.",
                    uncertainty: { level: "none" },
                  },
                ],
                changes: [{ category: "grammar", explanation: "Use the accusative article." }],
              },
            },
          ],
        },
      },
      {
        status: "ok",
        channel: "history/delete",
        requestId: requestId(),
        result: { historyEntryId: factory.nextId("historyEntry"), status: "deleted" },
      },
    ];
    for (const response of responses) {
      expect(desktopIpcResponseSchema.safeParse(response).success).toBe(true);
    }
    for (const candidate of [
      { ...responses[0], result: { ...responses[0]?.result, path: "/private/root" } },
      { ...responses[1], result: { ...responses[1]?.result, email: "learner@example.com" } },
      { ...responses[1], result: { ...responses[1]?.result, accessToken: "secret" } },
      { ...responses[2], result: { ...responses[2]?.result, rawProtocol: {} } },
      { ...responses[3], result: { ...responses[3]?.result, resetCredits: { opaque: true } } },
      {
        status: "ok",
        channel: "history/read",
        requestId: requestId(),
        result: {
          rootGeneration: 2,
          mistakePatterns: [],
          entries: [
            {
              historyEntryId: factory.nextId("historyEntry"),
              entityKind: "attempt",
              skill: "writing",
              activityType: "writing",
              title: "Private history",
              occurredAt: "2026-08-15T08:30:00.000Z",
              curriculumTopicIds: [],
              mistakeCategories: [],
              detail: { kind: "reference", rawProtocol: { method: "turn/start" } },
            },
          ],
        },
      },
      {
        status: "ok",
        channel: "history/read",
        requestId: requestId(),
        result: {
          rootGeneration: 2,
          mistakePatterns: [
            {
              category: {
                kind: "grammar",
                categoryKey: "article",
                curriculumTopicIds: [factory.nextId("curriculumTopic")],
              },
              status: "single-occurrence",
              occurrenceCount: 2,
              classificationSource: "inferred",
              targetedPractice: { status: "not-created" },
              occurrences: [
                {
                  mistakeId: factory.nextId("mistake"),
                  observedOn: "2026-08-15",
                  evidence: { beforeContext: "", evidenceText: "ein", afterContext: " Termin" },
                  explanation: "One observed article issue.",
                  classificationSource: "inferred",
                },
              ],
            },
          ],
          entries: [],
        },
      },
      {
        status: "ok",
        channel: "learner-settings/read",
        requestId: requestId(),
        result: {
          dataRoot: { generation: 2, displayName: "German learning", path: "/private/root" },
          settings: editableSettings,
          updatedAt: "2026-08-15T08:30:00.000Z",
        },
      },
    ]) {
      expect(desktopIpcResponseSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("keeps privileged Settings writes closed and identity-free", () => {
    const base = {
      channel: "learner-settings/update",
      requestId: requestId(),
      payload: {
        expectedUpdatedAt: "2026-08-15T08:30:00.000Z",
        settings: editableSettings,
      },
    };
    expect(desktopIpcRequestSchema.safeParse(base).success).toBe(true);
    for (const injected of [
      { learnerId: factory.nextId("learner") },
      { dataRoot: "/private/root" },
      { accessToken: "secret" },
      { rawProtocol: { method: "model/list" } },
      { modelSelection: { model: "forged" } },
    ]) {
      expect(
        desktopIpcRequestSchema.safeParse({
          ...base,
          payload: { ...base.payload, ...injected },
        }).success,
      ).toBe(false);
    }
  });

  it("bounds renderer events and keeps authentication secrets out", () => {
    const loginId = requestId();
    const operationId = requestId();
    const submissionId = requestId();
    for (const event of [
      {
        event: "account-login",
        loginId,
        state: { status: "waiting" },
      },
      {
        event: "learning-operation-progress",
        operationId,
        submissionId,
        kind: "writing-correction",
        stage: "validating",
      },
      {
        event: "learning-operation-finished",
        operationId,
        submissionId,
        kind: "writing-correction",
        outcome: {
          status: "validated",
          modelRequestId: factory.nextId("modelRequest"),
          output: {
            correctedText: "Ich gehe heute.",
            summary: "One verb agreement correction.",
            changes: [],
            naturalAlternative: null,
            vocabularyCandidates: [],
            nextPracticeSuggestion: null,
            overallUncertainty: { level: "none" },
            caveats: [],
          },
        },
      },
      { event: "data-root-changed", generation: 3, displayName: "German learning" },
      { event: "state-invalidated", scope: "dashboard" },
    ]) {
      expect(desktopIpcEventSchema.safeParse(event).success).toBe(true);
    }
    expect(
      desktopIpcEventSchema.safeParse({
        event: "account-login",
        loginId,
        state: { status: "complete", accessToken: "secret" },
      }).success,
    ).toBe(false);
    for (const state of [
      { status: "device-code", verificationUrl: "https://auth.example", userCode: "ABCD" },
      { status: "waiting", verificationUrl: "https://auth.example", userCode: "ABCD" },
    ]) {
      expect(
        desktopIpcEventSchema.safeParse({ event: "account-login", loginId, state }).success,
      ).toBe(false);
    }
  });

  it("projects closed Draft 2020-12 request, response, and event schemas", () => {
    for (const boundary of [
      desktopIpcRequestSchema,
      desktopIpcResponseSchema,
      desktopIpcEventSchema,
    ]) {
      const schema = toBoundaryJsonSchema(boundary);
      expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(JSON.stringify(schema)).toContain('"additionalProperties":false');
    }
  });
});
