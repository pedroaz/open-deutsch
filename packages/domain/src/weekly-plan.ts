import {
  calendarDateSchema,
  curriculumTopicIdSchema,
  mistakeIdSchema,
  planIdSchema,
  strictBoundaryObject,
  vocabularyIdSchema,
  z,
} from "@open-deutsch/contracts";

import { aiProvenanceSchema } from "./exercise.js";

const text = (maximum: number) => z.string().min(1).max(maximum).regex(/\S/u);

export const weeklyPlanActivityKinds = [
  "writing",
  "grammar",
  "vocabulary-review",
  "reading",
  "codex-listening",
  "voice-speaking",
  "placement",
  "custom-lesson",
] as const;
export const weeklyPlanActivityKindSchema = z.enum(weeklyPlanActivityKinds);

export const weeklyPlanActivityContextSchema = z.strictObject({
  curriculumTopicIds: z.array(curriculumTopicIdSchema).max(12),
  mistakeIds: z.array(mistakeIdSchema).max(12),
  vocabularyIds: z.array(vocabularyIdSchema).max(24),
});

export const weeklyPlanSuggestedActivitySchema = z.strictObject({
  kind: weeklyPlanActivityKindSchema,
  title: text(160),
  rationale: text(800),
  naturalRequest: text(1_000),
  estimatedMinutes: z.int().min(5).max(180),
  context: weeklyPlanActivityContextSchema,
});

export const weeklyPlanGoalSchema = z.strictObject({
  title: text(160),
  outcome: text(500),
  suggestedActivities: z.array(weeklyPlanSuggestedActivitySchema).min(1).max(12),
});

export const weeklyPlanSchema = strictBoundaryObject({
  schemaVersion: z.literal(1),
  planId: planIdSchema,
  role: z.literal("advisory"),
  weekStartsOn: calendarDateSchema,
  requestedFrom: z.enum(["desktop", "codex"]),
  aiProvenance: aiProvenanceSchema,
  goals: z.array(weeklyPlanGoalSchema).min(1).max(10),
});

export const weeklyPlanRecommendationSchema = strictBoundaryObject({
  primary: weeklyPlanSuggestedActivitySchema,
  alternatives: z.array(weeklyPlanSuggestedActivitySchema).max(3),
});

export type WeeklyPlanActivityKind = z.infer<typeof weeklyPlanActivityKindSchema>;
export type WeeklyPlanSuggestedActivity = z.infer<typeof weeklyPlanSuggestedActivitySchema>;
export type WeeklyPlanGoal = z.infer<typeof weeklyPlanGoalSchema>;
export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>;
export type WeeklyPlanRecommendation = z.infer<typeof weeklyPlanRecommendationSchema>;

export function selectWeeklyPlanRecommendation(input: {
  plan: WeeklyPlan;
  dueVocabularyIds: readonly string[];
  relevantMistakeIds: readonly string[];
}): WeeklyPlanRecommendation {
  const dueVocabularyIds = new Set(input.dueVocabularyIds);
  const relevantMistakeIds = new Set(input.relevantMistakeIds);
  const activities = input.plan.goals.flatMap((goal, goalPosition) =>
    goal.suggestedActivities.map((activity, activityPosition) => ({
      activity,
      order: goalPosition * 100 + activityPosition,
      score:
        (activity.context.vocabularyIds.some((id) => dueVocabularyIds.has(id)) ? 2 : 0) +
        (activity.context.mistakeIds.some((id) => relevantMistakeIds.has(id)) ? 1 : 0),
    })),
  );
  const sorted = [...activities].sort(
    (left, right) => right.score - left.score || left.order - right.order,
  );
  const primary = sorted[0]?.activity;
  if (!primary) throw new Error("OD_WEEKLY_PLAN_RECOMMENDATION_EMPTY");
  return weeklyPlanRecommendationSchema.parse({
    primary,
    alternatives: sorted.slice(1, 4).map(({ activity }) => activity),
  });
}
