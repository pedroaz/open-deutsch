import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import { evaluateExerciseAnswer, exerciseDefinitionSchema } from "../src/index.js";

const factory = createDeterministicContractFactory(90);
const shared = {
  exerciseId: factory.nextId("exercise"),
  aiProvenance: {
    source: "ai" as const,
    producer: "desktop-app-server" as const,
    modelRequestId: factory.nextId("modelRequest"),
    generatedAt: "2026-08-20T10:00:00.000Z",
    modelSelection: {
      availability: "reported" as const,
      modelId: "gpt-fake",
      effortId: "medium",
    },
  },
  cefrBand: "a2" as const,
  objectives: [{ key: "everyday-german", description: "Use German accurately." }],
  instructions: "Complete the exercise.",
  hints: [{ text: "Read the whole sentence first." }],
  feedbackMode: "immediate" as const,
  curriculumTopicIds: [],
  vocabularySetLinks: [],
};

describe("generic exercise evaluation", () => {
  it("evaluates deterministic formats by position without leaking answers into input", () => {
    const fill = exerciseDefinitionSchema.parse({
      ...shared,
      kind: "fill-in-the-blank",
      content: {
        leadingText: "Ich fahre mit ",
        blanks: [{ acceptedAnswers: ["dem"], followingText: " Bus." }],
      },
      answerContract: { kind: "blank-values", addressing: "zero-based-index" },
    });
    expect(
      evaluateExerciseAnswer(fill, {
        kind: "fill-in-the-blank",
        valuesByBlankPosition: ["DEM"],
      }),
    ).toMatchObject({ status: "correct", acceptedAnswerReveal: ["dem"] });
    expect(() =>
      evaluateExerciseAnswer(fill, { kind: "fill-in-the-blank", valuesByBlankPosition: [] }),
    ).toThrow();

    const choice = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "multiple-choice",
      content: {
        question: "Which article is correct?",
        options: [{ label: "der" }, { label: "die" }, { label: "das" }, { label: "den" }],
        correctOptionPosition: 3,
      },
      answerContract: { kind: "single-option", addressing: "zero-based-index" },
    });
    expect(
      evaluateExerciseAnswer(choice, { kind: "multiple-choice", selectedOptionPosition: 0 }),
    ).toMatchObject({ status: "incorrect", acceptedAnswerReveal: ["den"] });
  });

  it("preserves open responses and routes only open evaluation to AI", () => {
    const short = exerciseDefinitionSchema.parse({
      ...shared,
      kind: "short-answer",
      content: { question: "How do you say appointment?" },
      answerContract: {
        kind: "short-text",
        acceptedAnswers: ["Termin", "der Termin"],
        evaluation: "accepted-answer-or-ai",
      },
    });
    expect(evaluateExerciseAnswer(short, { kind: "short-answer", text: "Termin" }).status).toBe(
      "correct",
    );
    expect(
      evaluateExerciseAnswer(short, { kind: "short-answer", text: "DER   TERMIN" }).status,
    ).toBe("correct");
    expect(
      evaluateExerciseAnswer(short, { kind: "short-answer", text: "Verabredung" }),
    ).toMatchObject({ status: "requires-ai", answer: { text: "Verabredung" } });

    const free = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "free-writing",
      content: { prompt: "Write a short request." },
      answerContract: { kind: "free-text", maximumCharacters: 80, evaluation: "ai" },
    });
    expect(
      evaluateExerciseAnswer(free, { kind: "free-writing", text: "Ich brauche einen Termin." }),
    ).toMatchObject({ status: "requires-ai", answer: { text: "Ich brauche einen Termin." } });
  });

  it("accepts alternate blank and correction answers and reveals evidence only in evaluation", () => {
    const fill = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: factory.nextId("exercise"),
      explanation: "The preposition mit takes the dative case.",
      kind: "fill-in-the-blank",
      content: {
        leadingText: "Ich fahre mit ",
        blanks: [
          { acceptedAnswers: ["der", "meiner"], followingText: " Bahn und mit " },
          { acceptedAnswers: ["dem", "einem"], followingText: " Bus." },
        ],
      },
      answerContract: { kind: "blank-values", addressing: "zero-based-index" },
    });
    expect(JSON.stringify(fill.content)).not.toContain('"correct"');
    expect(
      evaluateExerciseAnswer(fill, {
        kind: "fill-in-the-blank",
        valuesByBlankPosition: ["MEINER", " einem "],
      }),
    ).toMatchObject({ status: "correct", acceptedAnswerReveal: ["der", "dem"] });
    expect(
      evaluateExerciseAnswer(fill, {
        kind: "fill-in-the-blank",
        valuesByBlankPosition: ["die", "ein"],
      }),
    ).toMatchObject({ status: "incorrect", acceptedAnswerReveal: ["der", "dem"] });

    const correction = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "sentence-correction",
      content: { sentence: "Ich brauche ein Termin." },
      answerContract: {
        kind: "corrected-sentence",
        acceptedAnswers: ["Ich brauche einen Termin.", "Einen Termin brauche ich."],
        evaluation: "accepted-answer-or-ai",
      },
    });
    expect(
      evaluateExerciseAnswer(correction, {
        kind: "sentence-correction",
        text: "EINEN TERMIN BRAUCHE ICH.",
      }),
    ).toMatchObject({ status: "correct" });
    expect(
      evaluateExerciseAnswer(correction, {
        kind: "sentence-correction",
        text: "Ich hätte gern einen Termin.",
      }),
    ).toMatchObject({
      status: "requires-ai",
      answer: { text: "Ich hätte gern einen Termin." },
    });
  });

  it("keeps multiple-choice and both vocabulary directions as response evidence, not scores", () => {
    const choice = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: factory.nextId("exercise"),
      kind: "multiple-choice",
      content: {
        question: "Which phrase means by bus?",
        options: [
          { label: "mit dem Bus" },
          { label: "für den Bus" },
          { label: "ohne Bus" },
          { label: "gegen den Bus" },
        ],
        correctOptionPosition: 0,
      },
      answerContract: { kind: "single-option", addressing: "zero-based-index" },
    });
    expect(
      evaluateExerciseAnswer(choice, { kind: "multiple-choice", selectedOptionPosition: 2 }),
    ).toEqual({
      exerciseKind: "multiple-choice",
      answer: { kind: "multiple-choice", selectedOptionPosition: 2 },
      status: "incorrect",
      acceptedAnswerReveal: ["mit dem Bus"],
    });

    for (const [direction, cue, answer, expected] of [
      ["recognition", "der Termin", "appointment", "correct"],
      ["production", "appointment", "Treffen", "incorrect"],
    ] as const) {
      const recall = exerciseDefinitionSchema.parse({
        ...shared,
        exerciseId: factory.nextId("exercise"),
        kind: "vocabulary-recall",
        content: { cue, direction },
        answerContract: { kind: "recalled-text", acceptedAnswers: ["Termin", "appointment"] },
      });
      expect(evaluateExerciseAnswer(recall, { kind: "vocabulary-recall", text: answer })).toEqual({
        exerciseKind: "vocabulary-recall",
        answer: { kind: "vocabulary-recall", text: answer },
        status: expected,
        acceptedAnswerReveal: ["Termin", "appointment"],
      });
    }
  });
});
