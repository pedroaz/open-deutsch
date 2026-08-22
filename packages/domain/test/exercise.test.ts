import { toBoundaryJsonSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  aiProvenanceSchema,
  defaultFeedbackModeForExerciseKind,
  exerciseArtifactSchema,
  exerciseDefinitionSchema,
  exerciseKinds,
  generatedExerciseSchema,
  lessonArtifactSchema,
  lessonDefinitionSchema,
  lessonKinds,
  startedExerciseSnapshotSchema,
  startedLessonSnapshotSchema,
} from "../src/index.js";

function fixtureContext() {
  const factory = createDeterministicContractFactory();
  const provenance = {
    source: "ai",
    producer: "desktop-app-server",
    modelRequestId: factory.nextId("modelRequest"),
    generatedAt: factory.nextInstant(),
    modelSelection: {
      availability: "reported",
      modelId: "gpt-runtime-model",
      effortId: "medium",
    },
  } as const;
  const shared = {
    aiProvenance: provenance,
    cefrBand: "a2",
    objectives: [{ key: "daily-life", description: "Use the target form in daily life." }],
    instructions: "Complete the short activity.",
    hints: [{ text: "Look for the verb position." }],
    curriculumTopicIds: [factory.nextId("curriculumTopic")],
    vocabularySetLinks: [{ source: "curriculum", setKey: "shopping-basics" }],
  } as const;
  return { factory, provenance, shared };
}

function allExerciseFixtures() {
  const { factory, shared } = fixtureContext();
  return [
    {
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "free-writing",
      content: { prompt: "Write a short message to your neighbor." },
      answerContract: { kind: "free-text", maximumCharacters: 1_000, evaluation: "ai" },
      feedbackMode: "submit-at-end",
    },
    {
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "short-answer",
      content: { question: "Wann öffnet der Supermarkt?" },
      answerContract: {
        kind: "short-text",
        acceptedAnswers: ["Um acht Uhr."],
        evaluation: "accepted-answer-or-ai",
      },
      feedbackMode: "submit-at-end",
    },
    {
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "fill-in-the-blank",
      content: {
        leadingText: "Ich ",
        blanks: [{ acceptedAnswers: ["kaufe"], followingText: " Brot." }],
      },
      answerContract: { kind: "blank-values", addressing: "zero-based-index" },
      feedbackMode: "immediate",
    },
    {
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "sentence-correction",
      content: { sentence: "Ich gehen zum Markt." },
      answerContract: {
        kind: "corrected-sentence",
        acceptedAnswers: ["Ich gehe zum Markt."],
        evaluation: "accepted-answer-or-ai",
      },
      feedbackMode: "submit-at-end",
    },
    {
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "multiple-choice",
      content: {
        question: "Which article belongs to Markt?",
        options: [{ label: "die" }, { label: "der" }, { label: "das" }, { label: "den" }],
        correctOptionPosition: 1,
      },
      answerContract: {
        kind: "single-option",
        addressing: "zero-based-index",
      },
      feedbackMode: "immediate",
    },
    {
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "vocabulary-recall",
      content: { cue: "the receipt", direction: "production" },
      answerContract: { kind: "recalled-text", acceptedAnswers: ["der Kassenbon"] },
      feedbackMode: "immediate",
    },
  ] as const;
}

describe("exercise contracts", () => {
  it("covers exactly the accepted first structured formats and feedback defaults", () => {
    expect(exerciseKinds).toEqual([
      "free-writing",
      "short-answer",
      "fill-in-the-blank",
      "sentence-correction",
      "multiple-choice",
      "vocabulary-recall",
    ]);
    expect(
      Object.fromEntries(
        exerciseKinds.map((kind) => [kind, defaultFeedbackModeForExerciseKind(kind)]),
      ),
    ).toEqual({
      "free-writing": "submit-at-end",
      "short-answer": "submit-at-end",
      "fill-in-the-blank": "immediate",
      "sentence-correction": "submit-at-end",
      "multiple-choice": "immediate",
      "vocabulary-recall": "immediate",
    });
  });

  it("keeps every exercise kind correlated with its content and answer contract", () => {
    const parsed = allExerciseFixtures().map((exercise) =>
      exerciseDefinitionSchema.parse(exercise),
    );
    expect(parsed.map(({ kind }) => kind)).toEqual(exerciseKinds);
    const multipleChoice = parsed[4];
    if (multipleChoice?.kind !== "multiple-choice") {
      throw new Error("expected multiple-choice fixture");
    }
    expect(multipleChoice.content.correctOptionPosition).toBe(1);
    expect(multipleChoice.content.options[1].label).toBe("der");

    expect(
      exerciseDefinitionSchema.safeParse({
        ...allExerciseFixtures()[0],
        answerContract: { kind: "single-option" },
      }).success,
    ).toBe(false);
    expect(
      exerciseDefinitionSchema.safeParse({
        ...allExerciseFixtures()[2],
        content: { leadingText: "No answer", blanks: [] },
      }).success,
    ).toBe(false);
    expect(
      exerciseDefinitionSchema.safeParse({
        ...allExerciseFixtures()[2],
        content: {
          leadingText: "Ambiguous",
          blanks: [
            { blankKey: "same", acceptedAnswers: ["a"], followingText: " / " },
            { blankKey: "same", acceptedAnswers: ["b"], followingText: "." },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      exerciseDefinitionSchema.safeParse({
        ...allExerciseFixtures()[4],
        content: {
          question: "Ambiguous",
          options: [
            { optionKey: "same", label: "der", isCorrect: true },
            { optionKey: "same", label: "die", isCorrect: false },
          ],
        },
      }).success,
    ).toBe(false);
    for (const options of [
      [
        { label: "der", isCorrect: false },
        { label: "die", isCorrect: false },
      ],
      [
        { label: "der", isCorrect: true },
        { label: "die", isCorrect: true },
      ],
    ]) {
      expect(
        exerciseDefinitionSchema.safeParse({
          ...allExerciseFixtures()[4],
          content: { question: "Invalid correctness", options },
        }).success,
      ).toBe(false);
    }
  });

  it("records model selection when known without guessing Codex-host metadata", () => {
    const { factory, provenance } = fixtureContext();
    expect(aiProvenanceSchema.parse(provenance).modelSelection.availability).toBe("reported");
    expect(
      aiProvenanceSchema.parse({
        source: "ai",
        producer: "codex-host",
        modelRequestId: factory.nextId("modelRequest"),
        generatedAt: factory.nextInstant(),
        modelSelection: { availability: "not-reported" },
      }).modelSelection,
    ).toEqual({ availability: "not-reported" });
    expect(
      aiProvenanceSchema.safeParse({
        ...provenance,
        modelSelection: { availability: "not-reported" },
      }).success,
    ).toBe(false);
  });

  it("distinguishes disposable generations from persistable started snapshots", () => {
    const { factory } = fixtureContext();
    const exercise = allExerciseFixtures()[0];
    expect(
      generatedExerciseSchema.parse({ schemaVersion: 1, lifecycle: "generated", exercise })
        .lifecycle,
    ).toBe("generated");
    const snapshot = startedExerciseSnapshotSchema.parse({
      schemaVersion: 1,
      lifecycle: "started",
      startedAt: factory.nextInstant(),
      exercise,
    });
    expect(snapshot.exercise.answerContract).toMatchObject({ kind: "free-text" });
    expect(exerciseArtifactSchema.parse(snapshot).lifecycle).toBe("started");
    expect(exerciseArtifactSchema.safeParse({ ...snapshot, lifecycle: "completed" }).success).toBe(
      false,
    );
  });
});

describe("custom lesson contracts", () => {
  function customLessonFixture() {
    const { factory, provenance } = fixtureContext();
    return {
      activityId: factory.nextId("activity"),
      intent: {
        kind: "custom",
        naturalRequest: "Help me practice asking for an appointment at the Bürgeramt.",
        curriculumTopicIds: [factory.nextId("curriculumTopic")],
        vocabularySetLinks: [
          { source: "generated-activity", activityId: factory.nextId("activity") },
        ],
      },
      aiProvenance: provenance,
      cefrBand: "a2",
      title: "Asking for an appointment",
      objectives: [{ key: "appointment-request", description: "Ask for an appointment politely." }],
      explanation: "Use a polite modal verb and a clear reason for the request.",
      content: [
        { heading: "Useful pattern", content: "Ich möchte gern einen Termin vereinbaren." },
      ],
      exercises: allExerciseFixtures().slice(0, 2),
    } as const;
  }

  it("supports custom, curriculum-topic, and vocabulary-set lesson intents", () => {
    expect(lessonKinds).toEqual(["custom", "curriculum-topic", "vocabulary-set"]);
    expect(lessonDefinitionSchema.parse(customLessonFixture()).intent.kind).toBe("custom");

    const base = customLessonFixture();
    expect(
      lessonDefinitionSchema.safeParse({
        ...base,
        intent: {
          kind: "curriculum-topic",
          curriculumTopicIds: [],
          vocabularySetLinks: [],
        },
      }).success,
    ).toBe(false);
    expect(
      lessonDefinitionSchema.safeParse({
        ...base,
        intent: {
          kind: "vocabulary-set",
          curriculumTopicIds: [],
          vocabularySetLinks: [],
        },
      }).success,
    ).toBe(false);
  });

  it("requires a bounded natural request only for a custom lesson", () => {
    const lesson = customLessonFixture();
    expect(
      lessonDefinitionSchema.safeParse({
        ...lesson,
        intent: {
          kind: "custom",
          curriculumTopicIds: [],
          vocabularySetLinks: [],
        },
      }).success,
    ).toBe(false);
    expect(
      lessonDefinitionSchema.safeParse({
        ...lesson,
        intent: { ...lesson.intent, naturalRequest: "x".repeat(2_001) },
      }).success,
    ).toBe(false);
  });

  it("makes a started lesson snapshot sufficient without Codex task history", () => {
    const { factory } = fixtureContext();
    const input = {
      schemaVersion: 1,
      lifecycle: "started",
      startedAt: factory.nextInstant(),
      lesson: customLessonFixture(),
    } as const;
    const snapshot = startedLessonSnapshotSchema.parse(structuredClone(input));
    expect(snapshot.lesson.intent.kind).toBe("custom");
    if (snapshot.lesson.intent.kind !== "custom") throw new Error("expected custom lesson");
    expect(snapshot.lesson.intent.naturalRequest).toContain("Bürgeramt");
    expect(snapshot.lesson.content[0]?.content).toContain("Termin");
    expect(snapshot.lesson.exercises[0]?.answerContract.kind).toBe("free-text");
    expect(lessonArtifactSchema.parse(snapshot).lifecycle).toBe("started");
  });

  it("projects closed lifecycle snapshots to Draft 2020-12 JSON Schema", () => {
    const schema = toBoundaryJsonSchema(lessonArtifactSchema) as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema).toHaveProperty("anyOf");
  });

  it("rejects unknown fields, unsupported CEFR bands, and terminal attempt lifecycle", () => {
    const { factory } = fixtureContext();
    const lesson = customLessonFixture();
    for (const candidate of [
      { ...lesson, hiddenPrompt: "private raw prompt" },
      { ...lesson, cefrBand: "c1" },
      {
        schemaVersion: 1,
        lifecycle: "abandoned",
        startedAt: factory.nextInstant(),
        lesson,
      },
    ]) {
      const schema = "lifecycle" in candidate ? lessonArtifactSchema : lessonDefinitionSchema;
      expect(schema.safeParse(candidate).success).toBe(false);
    }
  });
});
