import { toBoundaryJsonSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";
import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  attemptFeedbackSchema,
  attemptSchema,
  completedAttemptSchema,
  exerciseAnswerSchema,
  feedbackUncertaintySchema,
  objectiveOutcomeSchema,
} from "../src/index.js";

function fixture() {
  const f = createDeterministicContractFactory();
  const provenance = {
    source: "ai",
    producer: "desktop-app-server",
    modelRequestId: f.nextId("modelRequest"),
    generatedAt: f.nextInstant(),
    modelSelection: { availability: "reported", modelId: "gpt-model", effortId: "medium" },
  } as const;
  const exercise = {
    exerciseId: f.nextId("exercise"),
    aiProvenance: provenance,
    cefrBand: "a2",
    objectives: [{ key: "appointment", description: "Answer an appointment question." }],
    instructions: "Answer briefly.",
    hints: [],
    feedbackMode: "submit-at-end",
    curriculumTopicIds: [],
    vocabularySetLinks: [],
    kind: "short-answer",
    content: { question: "Wann ist der Termin?" },
    answerContract: {
      kind: "short-text",
      acceptedAnswers: ["Am Montag."],
      evaluation: "accepted-answer-or-ai",
    },
  } as const;
  const interaction = {
    kind: "short-answer",
    exercise,
    answers: [
      {
        submittedAfterPreviousEventMilliseconds: 1_000,
        answer: { kind: "short-answer", text: "Am Montag." },
      },
    ],
  } as const;
  const feedback = {
    source: { kind: "ai", modelRequestId: f.nextId("modelRequest") },
    summary: "The answer is understandable.",
    strengths: ["Clear weekday."],
    improvements: ["Add context."],
    overallUncertainty: { level: "some", explanation: "Evidence is limited." },
    mistakeIds: [f.nextId("mistake")],
    vocabularyCandidateIds: [f.nextId("vocabulary")],
  } as const;
  const base = {
    schemaVersion: 1,
    attemptId: f.nextId("attempt"),
    startedAt: f.nextInstant(),
    interaction,
  } as const;
  const evaluation = {
    outcome: "developing",
    evidence: "One clear response.",
    uncertainty: { level: "some", explanation: "Only one response." },
  } as const;
  const completedBase = {
    ...base,
    interaction: {
      ...interaction,
      exercise: {
        ...exercise,
        objectives: exercise.objectives.map((objective) => ({ ...objective, evaluation })),
      },
    },
  } as const;
  return { f, base, completedBase, feedback };
}

describe("attempt and feedback contracts", () => {
  it("supports every bounded answer shape", () => {
    const answers = [
      { kind: "free-writing", text: "Hallo" },
      { kind: "short-answer", text: "Montag" },
      { kind: "fill-in-the-blank", valuesByBlankPosition: ["kaufe"] },
      { kind: "sentence-correction", text: "Ich gehe." },
      { kind: "multiple-choice", selectedOptionPosition: 1 },
      { kind: "vocabulary-recall", text: "der Bon" },
    ];
    expect(answers.map((a) => exerciseAnswerSchema.parse(a).kind)).toHaveLength(6);
    expect(
      exerciseAnswerSchema.safeParse({ kind: "free-writing", text: "x".repeat(10_001) }).success,
    ).toBe(false);
    expect(
      exerciseAnswerSchema.safeParse({ kind: "multiple-choice", selectedOptionPosition: 6 })
        .success,
    ).toBe(false);
  });

  it("embeds a kind-correlated exercise snapshot and causal timing chain", () => {
    const { completedBase, feedback } = fixture();
    const completed = completedAttemptSchema.parse({
      ...completedBase,
      status: "completed",
      completedAfterPreviousEventMilliseconds: 500,
      feedback,
    });
    if (completed.interaction.kind !== "short-answer") throw new Error("expected short answer");
    expect(completed.interaction.exercise.content.question).toContain("Termin");
    expect(
      completedAttemptSchema.safeParse({
        ...completedBase,
        interaction: { ...completedBase.interaction, kind: "free-writing" },
        status: "completed",
        completedAfterPreviousEventMilliseconds: 0,
        feedback,
      }).success,
    ).toBe(false);
    expect(
      completedAttemptSchema.safeParse({
        ...completedBase,
        interaction: {
          ...completedBase.interaction,
          exercise: { ...completedBase.interaction.exercise, objectives: [] },
        },
        status: "completed",
        completedAfterPreviousEventMilliseconds: 0,
        feedback,
      }).success,
    ).toBe(false);
    expect(
      completedAttemptSchema.safeParse({
        ...completedBase,
        status: "completed",
        completedAfterPreviousEventMilliseconds: -1,
        feedback,
      }).success,
    ).toBe(false);
  });

  it("keeps lifecycle states closed and completion feedback mandatory", () => {
    const { base, feedback } = fixture();
    expect(
      attemptSchema.safeParse({
        ...base,
        status: "in-progress",
        activeAfterPreviousEventMilliseconds: 0,
      }).success,
    ).toBe(true);
    expect(
      attemptSchema.safeParse({
        ...base,
        status: "abandoned",
        abandonedAfterPreviousEventMilliseconds: 0,
      }).success,
    ).toBe(true);
    expect(
      attemptSchema.safeParse({
        ...base,
        status: "completed",
        completedAfterPreviousEventMilliseconds: 0,
      }).success,
    ).toBe(false);
    expect(attemptSchema.safeParse({ ...base, status: "certified", feedback }).success).toBe(false);
  });

  it("uses unique positional objective evidence, uncertainty, and no score", () => {
    const { feedback } = fixture();
    expect(attemptFeedbackSchema.parse(feedback).summary).toContain("understandable");
    expect(objectiveOutcomeSchema.options).toContain("not-evaluated");
    expect(fixture().completedBase.interaction.exercise.objectives[0]?.evaluation.outcome).toBe(
      "developing",
    );
    expect(attemptFeedbackSchema.safeParse({ ...feedback, score: 90 }).success).toBe(false);
    expect(feedbackUncertaintySchema.safeParse({ level: "some", explanation: "   " }).success).toBe(
      false,
    );
  });

  it("rejects raw rationale and cross-entity links", () => {
    const { feedback } = fixture();
    expect(
      attemptFeedbackSchema.safeParse({ ...feedback, chainOfThought: "private" }).success,
    ).toBe(false);
    expect(
      attemptFeedbackSchema.safeParse({ ...feedback, mistakeIds: feedback.vocabularyCandidateIds })
        .success,
    ).toBe(false);
  });

  it("projects the structural lifecycle to Draft 2020-12", () => {
    const schema = toBoundaryJsonSchema(attemptSchema) as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema).toHaveProperty("anyOf");
  });
});
