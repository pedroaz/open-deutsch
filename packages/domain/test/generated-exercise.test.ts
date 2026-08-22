import { describe, expect, it } from "vitest";

import { exerciseGenerationCandidateSchema, utcInstantSchema } from "@open-deutsch/contracts";
import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import { materializeGeneratedExerciseSet, materializeGeneratedLesson } from "../src/index.js";

const factory = createDeterministicContractFactory(94);
const provenance = {
  source: "ai" as const,
  producer: "desktop-app-server" as const,
  modelRequestId: factory.nextId("modelRequest"),
  generatedAt: utcInstantSchema.parse("2026-08-20T10:00:00.000Z"),
  modelSelection: { availability: "reported" as const, modelId: "gpt-fake", effortId: "medium" },
};
const base = {
  title: "Article choice",
  instructions: "Choose the correct article.",
  explanation: null,
  cefrBand: "A2" as const,
  objectives: ["Use the accusative article."],
  hints: ["Think about grammatical gender."],
};

describe("generated exercise materialization", () => {
  it("creates a closed domain exercise with format defaults and an override", () => {
    const output = exerciseGenerationCandidateSchema.parse({
      lesson: null,
      exercises: [
        {
          ...base,
          kind: "multiple-choice" as const,
          question: "Ich brauche ___ einen Termin.",
          options: ["heute", "morgen", "gestern", "nie"],
          correctOptionPosition: 1,
        },
      ],
      uncertainty: { level: "none" as const },
      caveats: [],
    });
    expect(
      materializeGeneratedExerciseSet(output, {
        exerciseIds: [factory.nextId("exercise")],
        aiProvenance: provenance,
      })[0],
    ).toMatchObject({ kind: "multiple-choice", feedbackMode: "immediate", cefrBand: "a2" });
    expect(
      materializeGeneratedExerciseSet(output, {
        exerciseIds: [factory.nextId("exercise")],
        aiProvenance: provenance,
        feedbackModeOverride: "submit-at-end",
      })[0],
    ).toMatchObject({ feedbackMode: "submit-at-end" });
  });

  it("rejects duplicate options, content, and answer-leaking hints", () => {
    const valid = {
      ...base,
      kind: "multiple-choice" as const,
      question: "Ich brauche ___ Termin.",
      options: ["der", "die", "das", "einen"],
      correctOptionPosition: 3,
    };
    for (const exercises of [
      [{ ...valid, options: ["der", "der", "das", "einen"] as const }],
      [valid, valid],
      [{ ...valid, hints: ["The answer is einen."] }],
    ]) {
      expect(() =>
        materializeGeneratedExerciseSet(
          exerciseGenerationCandidateSchema.parse({
            lesson: null,
            exercises,
            uncertainty: { level: "none" },
            caveats: [],
          }),
          {
            exerciseIds: exercises.map(() => factory.nextId("exercise")),
            aiProvenance: provenance,
          },
        ),
      ).toThrow();
    }
  });

  it("materializes a custom lesson foundation and linked practice set", () => {
    const output = exerciseGenerationCandidateSchema.parse({
      lesson: {
        title: "Appointments in everyday German",
        explanation: "Use a concise request and the accusative article.",
        sections: [
          {
            heading: "Useful pattern",
            content: "Ich brauche einen Termin is a practical appointment request.",
          },
        ],
        vocabularyFoundations: [
          {
            german: "der Termin",
            explanation: "appointment",
            example: "Ich brauche einen Termin.",
          },
        ],
      },
      exercises: [
        {
          ...base,
          kind: "multiple-choice" as const,
          question: "Ich brauche ___ einen Termin.",
          options: ["heute", "morgen", "gestern", "nie"],
          correctOptionPosition: 1,
        },
      ],
      uncertainty: { level: "none" as const },
      caveats: [],
    });
    expect(
      materializeGeneratedLesson(output, {
        activityId: factory.nextId("activity"),
        naturalRequest: "Create an appointment lesson.",
        exerciseIds: [factory.nextId("exercise")],
        aiProvenance: provenance,
      }),
    ).toMatchObject({
      title: "Appointments in everyday German",
      intent: { kind: "custom", naturalRequest: "Create an appointment lesson." },
      content: [
        { heading: "Useful pattern" },
        { heading: "der Termin", content: "appointment — Ich brauche einen Termin." },
      ],
      exercises: [{ kind: "multiple-choice" }],
    });
  });
});
