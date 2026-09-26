import {
  activityIdSchema,
  curriculumTopicIdSchema,
  dataRootGenerationSchema,
  historyEntryIdSchema,
  utcInstantSchema,
} from "./common.js";
import { z } from "./schema-system.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const key = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/u);
export const courseStageSchema = z.enum(["a1-1", "a1-2"]);
export const courseStepSchema = z.enum([
  "learn",
  "practice",
  "reading",
  "writing",
  "listening",
  "speaking",
]);
export const courseReferenceSchema = z.strictObject({
  version: text(40),
  unitId: key,
  step: courseStepSchema,
  mode: z.enum(["course", "challenge"]),
});
const localized = z.strictObject({ en: text(8000), de: text(8000) });
export const courseObjectiveSchema = z.strictObject({
  id: key,
  skill: z.enum(["reading", "writing", "listening", "speaking"]),
  description: localized,
  criterion: localized,
});
export const courseUnitSchema = z.strictObject({
  id: key,
  stage: courseStageSchema,
  title: localized,
  curriculumTopicIds: z.array(curriculumTopicIdSchema).min(1).max(4),
  prerequisites: z.array(key).max(12),
  grammar: localized,
  explanation: localized,
  examples: z
    .array(z.strictObject({ german: text(500), meaning: localized }))
    .min(3)
    .max(20),
  vocabulary: z
    .array(z.strictObject({ german: text(120), meaning: localized }))
    .min(6)
    .max(40),
  objectives: z.array(courseObjectiveSchema).length(4),
  tasks: z.strictObject({
    practice: localized,
    reading: localized,
    writing: localized,
    listening: localized,
    speaking: localized,
  }),
  listeningScript: text(2400),
  listeningQuestions: z.array(localized).min(2).max(6),
  listeningAnswers: z.array(localized).min(2).max(6),
  sourceIds: z.array(key).min(1).max(10),
});
export const learningCourseSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    version: text(40),
    sources: z
      .array(
        z.strictObject({
          id: key,
          title: text(300),
          url: z.url().startsWith("https://"),
          publisher: text(160),
          reviewedOn: z.iso.date(),
          claim: text(1000),
        }),
      )
      .min(1)
      .max(20),
    units: z.array(courseUnitSchema).length(12),
  })
  .superRefine((course, ctx) => {
    const ids = new Set<string>();
    const objectiveIds = new Set<string>();
    for (const unit of course.units) {
      if (ids.has(unit.id) || unit.prerequisites.some((id) => !ids.has(id)))
        ctx.addIssue({ code: "custom", message: "Invalid unit order or identity" });
      ids.add(unit.id);
      if (new Set(unit.objectives.map((o) => o.skill)).size !== 4)
        ctx.addIssue({ code: "custom", message: "Four skill objectives required" });
      for (const objective of unit.objectives) {
        if (objectiveIds.has(objective.id))
          ctx.addIssue({ code: "custom", message: "Duplicate objective" });
        objectiveIds.add(objective.id);
      }
      if (unit.sourceIds.some((id) => !course.sources.some((source) => source.id === id)))
        ctx.addIssue({ code: "custom", message: "Unknown course source" });
      if (unit.listeningQuestions.length !== unit.listeningAnswers.length)
        ctx.addIssue({ code: "custom", message: "Listening guidance mismatch" });
    }
    for (const stage of courseStageSchema.options)
      if (course.units.filter((u) => u.stage === stage).length !== 6)
        ctx.addIssue({ code: "custom", message: "Six units per stage required" });
  });
export const courseEvidenceSchema = z.strictObject({
  objectiveId: key,
  skill: z.enum(["reading", "writing", "listening", "speaking"]),
  outcome: z.enum(["demonstrated", "developing", "not-demonstrated", "not-evaluated"]),
  evidence: text(1000),
  uncertainty: z.enum(["none", "some", "substantial"]),
});
export const courseActivityResultSchema = z.strictObject({
  reference: courseReferenceSchema,
  activityId: activityIdSchema,
  completed: z.boolean(),
  historyEntryIds: z.array(historyEntryIdSchema).max(100),
  evidence: z.array(courseEvidenceSchema).max(100),
});
export const learningPathStateSchema = z.strictObject({
  selectedStage: courseStageSchema,
  current: courseReferenceSchema.nullable(),
  marks: z
    .array(
      z.strictObject({
        reference: courseReferenceSchema,
        status: z.enum(["completed", "skipped", "not-started"]),
        updatedAt: utcInstantSchema,
      }),
    )
    .max(500),
  activities: z.array(courseActivityResultSchema).max(2000),
});
export const learningPathSnapshotSchema = z.strictObject({
  explanationLanguage: z.enum(["en", "de"]),
  rootGeneration: dataRootGenerationSchema,
  course: learningCourseSchema.nullable(),
  state: learningPathStateSchema,
});
export const learningPathUpdateSchema = z.strictObject({
  expectedGeneration: dataRootGenerationSchema,
  reference: courseReferenceSchema,
  action: z.enum(["select", "complete-explanation", "skip", "reopen"]),
});
export type LearningCourse = z.infer<typeof learningCourseSchema>;
export type CourseReference = z.infer<typeof courseReferenceSchema>;
export type CourseUnit = z.infer<typeof courseUnitSchema>;
export type LearningPathState = z.infer<typeof learningPathStateSchema>;
export type CourseEvidence = z.infer<typeof courseEvidenceSchema>;

export const courseTeachingContextSchema = z.strictObject({
  objective: z
    .strictObject({
      id: key,
      skill: z.enum(["reading", "writing", "listening", "speaking"]),
      description: text(1000),
      criterion: text(1000),
    })
    .optional(),
  foundation: text(12000),
});
