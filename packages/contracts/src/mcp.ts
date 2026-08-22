import {
  activityIdSchema,
  attemptIdSchema,
  correlationIdSchema,
  curriculumTopicIdSchema,
  dataRootGenerationSchema,
  historyEntryIdSchema,
  learnerIdSchema,
  mistakeIdSchema,
  planIdSchema,
  utcInstantSchema,
  vocabularyIdSchema,
  voiceSessionIdSchema,
} from "./common.js";
import { openDeutschErrorSchema } from "./errors.js";
import { boundaryUnion, strictBoundaryObject, z } from "./schema-system.js";
import { listeningResultSchema, voiceActivityContextSchema } from "./voice.js";

const text = (maximum: number) => z.string().min(1).max(maximum).regex(/\S/u);
const count = z.int().nonnegative().max(10_000);
const revisionSchema = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const mcpIdempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u)
  .brand<"McpIdempotencyKey">();

export const mcpToolNames = [
  "open_deutsch_read_learner_context",
  "open_deutsch_read_practice_context",
  "open_deutsch_read_curriculum_coverage",
  "open_deutsch_create_activity",
  "open_deutsch_save_attempt_feedback",
  "open_deutsch_save_listening_result",
  "open_deutsch_replace_weekly_plan",
  "open_deutsch_save_voice_summary",
] as const;
export const mcpToolNameSchema = z.enum(mcpToolNames);

export const mcpToolAnnotationSchema = strictBoundaryObject({
  readOnlyHint: z.boolean(),
  destructiveHint: z.boolean(),
  idempotentHint: z.boolean(),
  openWorldHint: z.boolean(),
});
export const mcpConfirmationPolicySchema = z.enum(["none", "preview-and-explicit-confirmation"]);

const generationInput = { dataRootGeneration: dataRootGenerationSchema };
const writeInput = { ...generationInput, idempotencyKey: mcpIdempotencyKeySchema };

export const learnerContextReadInputSchema = strictBoundaryObject({
  ...generationInput,
  sections: z
    .array(z.enum(["profile", "goals", "teaching-defaults"]))
    .min(1)
    .max(3),
});
const learnerContextDataSchema = z.strictObject({
  learnerId: learnerIdSchema,
  approximateLevel: z.enum(["A1", "A2", "B1", "B2"]),
  everydayLifeGoal: text(500),
  availableMinutesPerWeek: z.int().min(15).max(2_100),
  explanationLanguage: z.enum(["en", "de"]),
  teachingProfile: z.enum(["conversation-partner", "strict-corrector"]),
});

export const practiceContextReadInputSchema = strictBoundaryObject({
  ...generationInput,
  focus: z.enum(["recommendation", "mistakes", "vocabulary", "weekly-plan", "all"]),
  maximumItemsPerSection: z.int().min(1).max(20).default(5),
});
const practiceContextDataSchema = z.strictObject({
  currentPlan: z
    .strictObject({ planId: planIdSchema, summary: text(500), goalCount: count })
    .nullable(),
  mistakes: z
    .array(
      z.strictObject({
        mistakeId: mistakeIdSchema,
        category: text(100),
        occurrenceCount: z.int().positive().max(10_000),
        summary: text(300),
      }),
    )
    .max(20),
  dueVocabulary: z
    .array(
      z.strictObject({
        vocabularyId: vocabularyIdSchema,
        lemma: text(160),
        dueOn: z.iso.date(),
      }),
    )
    .max(20),
  recommendation: z
    .strictObject({ primary: text(500), alternatives: z.array(text(300)).max(3) })
    .nullable(),
});

export const curriculumCoverageReadInputSchema = strictBoundaryObject({
  ...generationInput,
  band: z.enum(["A1", "A2", "B1", "B2"]).optional(),
  domain: text(100).optional(),
  includeLearnerRelevance: z.boolean().default(false),
});
const curriculumCoverageDataSchema = z.strictObject({
  matchingTopicCount: count,
  foundationReadyCount: count,
  gaps: z
    .array(
      z.strictObject({
        topicId: curriculumTopicIdSchema,
        band: z.enum(["A1", "A2", "B1", "B2"]),
        domain: text(100),
        summary: text(500),
      }),
    )
    .max(100),
  nextGap: z
    .strictObject({
      topicId: curriculumTopicIdSchema,
      band: z.enum(["A1", "A2", "B1", "B2"]),
      domain: text(100),
      summary: text(500),
    })
    .nullable(),
});

export const activityCreateInputSchema = strictBoundaryObject({
  ...writeInput,
  activity: z.strictObject({
    kind: z.enum([
      "writing",
      "grammar",
      "vocabulary",
      "reading",
      "listening",
      "speaking",
      "placement",
    ]),
    title: text(160),
    instructions: text(2_000),
    destinationSurface: z.enum(["writing", "practice", "vocabulary"]),
    curriculumTopicIds: z.array(curriculumTopicIdSchema).max(12),
    naturalRequest: text(1_000).optional(),
    voiceContext: voiceActivityContextSchema.optional(),
  }),
});
const activityCreateDataSchema = z.strictObject({
  activityId: activityIdSchema,
  destinationSurface: z.enum(["writing", "practice", "vocabulary"]),
  persistence: z.literal("until-completed-or-deleted"),
  replayed: z.boolean(),
});

export const attemptFeedbackSaveInputSchema = strictBoundaryObject({
  ...writeInput,
  activityId: activityIdSchema,
  expectedActivityRevision: revisionSchema,
  feedback: z.strictObject({
    outcome: z.enum(["completed", "partially-completed", "abandoned"]),
    summary: text(1_000),
    objectiveResults: z.array(z.enum(["met", "partially-met", "not-met", "not-evaluated"])).max(20),
    evidence: z.array(text(500)).max(20),
  }),
});
const attemptFeedbackDataSchema = z.strictObject({
  attemptId: attemptIdSchema,
  activityId: activityIdSchema,
  replayed: z.boolean(),
});

export const weeklyPlanReplacementInputSchema = strictBoundaryObject({
  ...writeInput,
  expectedCurrentPlanId: planIdSchema.nullable(),
  preview: z.strictObject({
    previewId: correlationIdSchema,
    confirmation: z.literal("confirmed"),
    summary: text(1_000),
  }),
  plan: z.strictObject({
    weekStartsOn: z.iso.date(),
    naturalRequest: text(1_000).optional(),
    goals: z
      .array(
        z.strictObject({
          title: text(160),
          rationale: text(500),
          suggestions: z.array(text(500)).min(1).max(8),
        }),
      )
      .min(1)
      .max(12),
  }),
});
const weeklyPlanReplacementDataSchema = z.strictObject({
  planId: planIdSchema,
  replacedPlanId: planIdSchema.nullable(),
  replayed: z.boolean(),
});

export const voiceSummarySaveInputSchema = strictBoundaryObject({
  ...writeInput,
  summary: z.strictObject({
    scenario: text(300),
    topic: text(300),
    durationMilliseconds: z.int().positive().max(86_400_000).nullable(),
    observedIssues: z.array(text(500)).max(20),
    vocabularyNotes: z.array(text(500)).max(30),
    feedback: text(2_000),
    nextSteps: z.array(text(500)).max(10),
    occurredAt: utcInstantSchema,
  }),
});
export const listeningResultSaveInputSchema = strictBoundaryObject({
  ...writeInput,
  activityId: activityIdSchema,
  expectedActivityRevision: revisionSchema,
  result: listeningResultSchema,
  occurredAt: utcInstantSchema,
});
const listeningResultDataSchema = z.strictObject({
  attemptId: attemptIdSchema,
  activityId: activityIdSchema,
  historyEntryId: historyEntryIdSchema,
  replayed: z.boolean(),
});
const voiceSummaryDataSchema = z.strictObject({
  voiceSessionId: voiceSessionIdSchema,
  replayed: z.boolean(),
});

const successResult = <Data extends z.ZodType>(data: Data) =>
  strictBoundaryObject({ status: z.literal("ok"), summary: text(1_200), data });
const errorResult = strictBoundaryObject({
  status: z.literal("error"),
  summary: text(500),
  error: openDeutschErrorSchema,
});
const toolResult = <Data extends z.ZodType>(data: Data) =>
  boundaryUnion([successResult(data), errorResult]);

export const learnerContextReadResultSchema = toolResult(learnerContextDataSchema);
export const practiceContextReadResultSchema = toolResult(practiceContextDataSchema);
export const curriculumCoverageReadResultSchema = toolResult(curriculumCoverageDataSchema);
export const activityCreateResultSchema = toolResult(activityCreateDataSchema);
export const attemptFeedbackSaveResultSchema = toolResult(attemptFeedbackDataSchema);
export const listeningResultSaveResultSchema = toolResult(listeningResultDataSchema);
export const weeklyPlanReplacementResultSchema = toolResult(weeklyPlanReplacementDataSchema);
export const voiceSummarySaveResultSchema = toolResult(voiceSummaryDataSchema);

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const additiveWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const mcpToolContracts = {
  open_deutsch_read_learner_context: {
    title: "Read learner context",
    description:
      "Read only the requested profile, goal, and teaching-default context from Open Deutsch.",
    annotations: readAnnotations,
    confirmationPolicy: "none",
    inputSchema: learnerContextReadInputSchema,
    resultSchema: learnerContextReadResultSchema,
  },
  open_deutsch_read_practice_context: {
    title: "Read practice context",
    description:
      "Read a bounded practice view containing the current plan, mistakes, due vocabulary, or recommendation.",
    annotations: readAnnotations,
    confirmationPolicy: "none",
    inputSchema: practiceContextReadInputSchema,
    resultSchema: practiceContextReadResultSchema,
  },
  open_deutsch_read_curriculum_coverage: {
    title: "Read curriculum coverage",
    description:
      "Read bounded A1–B2 curriculum coverage and gap metadata without private learner content by default.",
    annotations: readAnnotations,
    confirmationPolicy: "none",
    inputSchema: curriculumCoverageReadInputSchema,
    resultSchema: curriculumCoverageReadResultSchema,
  },
  open_deutsch_create_activity: {
    title: "Create a desktop activity",
    description:
      "Create one validated persistent learning activity that appears on the Open Deutsch dashboard.",
    annotations: additiveWriteAnnotations,
    confirmationPolicy: "none",
    inputSchema: activityCreateInputSchema,
    resultSchema: activityCreateResultSchema,
  },
  open_deutsch_save_attempt_feedback: {
    title: "Save attempt feedback",
    description:
      "Save bounded feedback for one existing Open Deutsch activity with revision conflict detection.",
    annotations: additiveWriteAnnotations,
    confirmationPolicy: "none",
    inputSchema: attemptFeedbackSaveInputSchema,
    resultSchema: attemptFeedbackSaveResultSchema,
  },
  open_deutsch_save_listening_result: {
    title: "Save listening result",
    description: "Save explicit structured listening evidence without audio or a full transcript.",
    annotations: additiveWriteAnnotations,
    confirmationPolicy: "none",
    inputSchema: listeningResultSaveInputSchema,
    resultSchema: listeningResultSaveResultSchema,
  },
  open_deutsch_replace_weekly_plan: {
    title: "Replace the weekly plan",
    description:
      "Replace the advisory weekly plan only after the learner confirms an exact preview.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    confirmationPolicy: "preview-and-explicit-confirmation",
    inputSchema: weeklyPlanReplacementInputSchema,
    resultSchema: weeklyPlanReplacementResultSchema,
  },
  open_deutsch_save_voice_summary: {
    title: "Save a Voice summary",
    description:
      "Save one bounded structured Codex Voice session summary without audio or transcript content.",
    annotations: additiveWriteAnnotations,
    confirmationPolicy: "none",
    inputSchema: voiceSummarySaveInputSchema,
    resultSchema: voiceSummarySaveResultSchema,
  },
} as const;

export type McpToolName = z.infer<typeof mcpToolNameSchema>;
export type McpIdempotencyKey = z.infer<typeof mcpIdempotencyKeySchema>;
export type McpToolContracts = typeof mcpToolContracts;
export type McpToolInput<Name extends McpToolName> = z.input<McpToolContracts[Name]["inputSchema"]>;
export type McpToolResult<Name extends McpToolName> = z.output<
  McpToolContracts[Name]["resultSchema"]
>;
