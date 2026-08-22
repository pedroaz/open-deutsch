import { toBoundaryJsonSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  selectWeeklyPlanRecommendation,
  weeklyPlanActivityKinds,
  weeklyPlanSchema,
} from "../src/index.js";

function weeklyPlanFixture() {
  const f = createDeterministicContractFactory();
  return {
    schemaVersion: 1,
    planId: f.nextId("plan"),
    role: "advisory",
    weekStartsOn: "2026-08-10",
    requestedFrom: "desktop",
    aiProvenance: {
      source: "ai",
      producer: "desktop-app-server",
      modelRequestId: f.nextId("modelRequest"),
      generatedAt: "2026-08-15T10:00:00.000Z",
      modelSelection: {
        availability: "reported",
        modelId: "gpt-runtime-model",
        effortId: "medium",
      },
    },
    goals: [
      {
        title: "Use present-tense verbs confidently",
        outcome: "Write short everyday sentences with correct first-person endings.",
        suggestedActivities: [
          {
            kind: "grammar",
            title: "First-person verb endings",
            rationale: "Recent corrections show this pattern more than once.",
            naturalRequest: "Give me a short A2 exercise on first-person present-tense verbs.",
            estimatedMinutes: 15,
            context: {
              curriculumTopicIds: [f.nextId("curriculumTopic")],
              mistakeIds: [f.nextId("mistake")],
              vocabularyIds: [],
            },
          },
        ],
      },
      {
        title: "Review useful shopping vocabulary",
        outcome: "Recall the due shopping words in short sentences.",
        suggestedActivities: [
          {
            kind: "vocabulary-review",
            title: "Shopping review",
            rationale: "These cards are due this week.",
            naturalRequest: "Start a review with these shopping words.",
            estimatedMinutes: 10,
            context: {
              curriculumTopicIds: [],
              mistakeIds: [],
              vocabularyIds: [f.nextId("vocabulary")],
            },
          },
        ],
      },
    ],
  } as const;
}

describe("weekly-plan contracts", () => {
  it("stores advisory goals with their own suggested activities", () => {
    const plan = weeklyPlanSchema.parse(weeklyPlanFixture());
    expect(plan.role).toBe("advisory");
    expect(plan.goals).toHaveLength(2);
    expect(plan.goals[0]?.suggestedActivities[0]?.kind).toBe("grammar");
  });

  it("supports the accepted activity surface without creating activities", () => {
    expect(weeklyPlanActivityKinds).toEqual([
      "writing",
      "grammar",
      "vocabulary-review",
      "reading",
      "codex-listening",
      "voice-speaking",
      "placement",
      "custom-lesson",
    ]);
    const suggestion = weeklyPlanSchema.parse(weeklyPlanFixture()).goals[0]?.suggestedActivities[0];
    expect(suggestion).not.toHaveProperty("activityId");
    expect(suggestion).not.toHaveProperty("attemptId");
  });

  it("records whether the plan was requested from desktop or Codex", () => {
    const fixture = weeklyPlanFixture();
    expect(weeklyPlanSchema.parse(fixture).requestedFrom).toBe("desktop");
    expect(weeklyPlanSchema.parse({ ...fixture, requestedFrom: "codex" }).requestedFrom).toBe(
      "codex",
    );
  });

  it("rejects completion ledgers and attempt reconciliation fields", () => {
    const fixture = weeklyPlanFixture();
    const suggestion = fixture.goals[0].suggestedActivities[0];
    for (const candidate of [
      { ...fixture, completedGoalKeys: [] },
      { ...fixture, automaticallyReconciledAt: "2026-08-15T12:00:00.000Z" },
      { ...fixture, goals: [{ ...fixture.goals[0], completed: false }] },
      {
        ...fixture,
        goals: [
          {
            ...fixture.goals[0],
            suggestedActivities: [{ ...suggestion, attemptId: fixture.planId }],
          },
        ],
      },
    ]) {
      expect(weeklyPlanSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("rejects empty plans, malformed dates, cross-entity IDs, and unbounded activity text", () => {
    const fixture = weeklyPlanFixture();
    const suggestion = fixture.goals[0].suggestedActivities[0];
    for (const candidate of [
      { ...fixture, goals: [] },
      { ...fixture, weekStartsOn: "10-08-2026" },
      { ...fixture, planId: fixture.goals[0].suggestedActivities[0].context.mistakeIds[0] },
      {
        ...fixture,
        goals: [
          {
            ...fixture.goals[0],
            suggestedActivities: [{ ...suggestion, rationale: "x".repeat(801) }],
          },
        ],
      },
    ]) {
      expect(weeklyPlanSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("selects the highest-evidence activity with stable plan order as the tie-breaker", () => {
    const plan = weeklyPlanSchema.parse(weeklyPlanFixture());
    const mistakeId = plan.goals[0]?.suggestedActivities[0]?.context.mistakeIds[0];
    const vocabularyId = plan.goals[1]?.suggestedActivities[0]?.context.vocabularyIds[0];
    if (!mistakeId || !vocabularyId) throw new Error("fixture context is incomplete");

    expect(
      selectWeeklyPlanRecommendation({
        plan,
        dueVocabularyIds: [vocabularyId],
        relevantMistakeIds: [mistakeId],
      }).primary.title,
    ).toBe("Shopping review");

    const stable = selectWeeklyPlanRecommendation({
      plan,
      dueVocabularyIds: [],
      relevantMistakeIds: [],
    });
    expect(stable.primary.title).toBe("First-person verb endings");
    expect(stable.alternatives[0]?.title).toBe("Shopping review");
  });

  it("projects a closed Draft 2020-12 boundary", () => {
    const schema = toBoundaryJsonSchema(weeklyPlanSchema) as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["additionalProperties"]).toBe(false);
  });
});
