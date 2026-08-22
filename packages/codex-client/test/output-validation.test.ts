import { describe, expect, it } from "vitest";

import {
  AppServerOutputValidationError,
  parseAppServerCandidateOutput,
  repairIssueCodes,
} from "../src/output-validation.js";

const validHelp = {
  answer: "Der Dativ folgt hier auf der Präposition.",
  examples: ["Ich fahre mit dem Bus."],
  alternatives: [],
  translations: [],
  miniExercises: [],
  followUpSuggestions: [],
  uncertainty: { level: "none" },
  caveats: [],
};
const generationInput = {
  kind: "exercise-generation" as const,
  naturalRequest: "Practise appointment vocabulary.",
  calibration: {
    approximateLevel: "A2" as const,
    explanationLanguage: "en" as const,
    teachingProfile: "strict-corrector" as const,
  },
  curriculumTopicIds: [],
  relevantMistakeIds: [],
  relevantVocabularyIds: [],
};
const generatedExercise = {
  kind: "multiple-choice" as const,
  title: "Appointment article",
  instructions: "Choose the correct answer.",
  explanation: null,
  cefrBand: "A2" as const,
  objectives: ["Use the accusative article."],
  hints: ["Think about grammatical gender."],
  question: "Ich brauche ___ Termin.",
  options: ["der", "die", "das", "einen"] as const,
  correctOptionPosition: 3,
};

describe("structured App Server output validation", () => {
  it("returns only a strict workload candidate", () => {
    expect(parseAppServerCandidateOutput("contextual-help", JSON.stringify(validHelp))).toEqual(
      validHelp,
    );
  });

  it("rejects mutation and direct-apply capabilities from contextual help", () => {
    for (const forbidden of [
      { correctedText: "Mutated learner text" },
      { replacement: { from: "x", to: "y" } },
      { applyAction: "replace-selection" },
      { patch: "@@ learner text" },
    ]) {
      expect(() =>
        parseAppServerCandidateOutput(
          "contextual-help",
          JSON.stringify({ ...validHelp, ...forbidden }),
        ),
      ).toThrow("OD_APP_SERVER_OUTPUT_SCHEMA_INVALID");
    }
  });

  it.each([
    ["OD_APP_SERVER_OUTPUT_NOT_TEXT", {}],
    ["OD_APP_SERVER_OUTPUT_SIZE_INVALID", ""],
    ["OD_APP_SERVER_OUTPUT_JSON_INVALID", "{"],
    ["OD_APP_SERVER_OUTPUT_SCHEMA_INVALID", JSON.stringify({ ...validHelp, accessToken: "x" })],
  ])("rejects malformed authority as %s", (code, value) => {
    expect(() => parseAppServerCandidateOutput("contextual-help", value)).toThrow(code);
  });

  it("exposes only bounded issue codes and redacted paths for repair", () => {
    try {
      parseAppServerCandidateOutput(
        "contextual-help",
        JSON.stringify({ ...validHelp, examples: [{ PRIVATE_LEARNER_TEXT: 1 }] }),
      );
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppServerOutputValidationError);
      const validation = error as AppServerOutputValidationError;
      expect(JSON.stringify(validation.issues)).not.toContain("PRIVATE_LEARNER_TEXT");
      expect(validation.issues[0]?.path).toContain("<field>");
      expect(repairIssueCodes(validation)).toContain("OD_APP_SERVER_OUTPUT_SCHEMA_INVALID");
    }
  });

  it("rejects oversized model output without retaining it", () => {
    const oversized = "x".repeat(512 * 1024 + 1);
    expect(() => parseAppServerCandidateOutput("contextual-help", oversized)).toThrow(
      "OD_APP_SERVER_OUTPUT_SIZE_INVALID",
    );
  });

  it("rejects semantically unsafe generated exercises for one bounded repair", () => {
    const base = {
      exercises: [generatedExercise],
      uncertainty: { level: "none" as const },
      caveats: [],
    };
    expect(
      parseAppServerCandidateOutput("exercise-generation", JSON.stringify(base), generationInput),
    ).toMatchObject({ exercises: [{ cefrBand: "A2" }] });
    for (const [candidate, code] of [
      [{ ...generatedExercise, cefrBand: "B2" }, "OD_EXERCISE_LEVEL_MISMATCH"],
      [{ ...generatedExercise, hints: ["The answer is einen."] }, "OD_EXERCISE_ANSWER_LEAK"],
      [{ ...generatedExercise, instructions: "Choose einen." }, "OD_EXERCISE_ANSWER_LEAK"],
      [
        { ...generatedExercise, options: ["der", "der", "das", "einen"] },
        "OD_EXERCISE_DUPLICATE_OPTION",
      ],
    ] as const) {
      expect(() =>
        parseAppServerCandidateOutput(
          "exercise-generation",
          JSON.stringify({ ...base, exercises: [candidate] }),
          generationInput,
        ),
      ).toThrow(code);
    }
    expect(() =>
      parseAppServerCandidateOutput(
        "exercise-generation",
        JSON.stringify({ ...base, exercises: [generatedExercise, generatedExercise] }),
        generationInput,
      ),
    ).toThrow("OD_EXERCISE_DUPLICATE_TITLE");
    const shortAnswer = {
      kind: "short-answer" as const,
      title: generatedExercise.title,
      instructions: generatedExercise.instructions,
      explanation: generatedExercise.explanation,
      cefrBand: generatedExercise.cefrBand,
      objectives: generatedExercise.objectives,
      hints: generatedExercise.hints,
      question: "Which article completes the sentence?",
      acceptedAnswers: ["einen"],
    };
    expect(() =>
      parseAppServerCandidateOutput(
        "exercise-generation",
        JSON.stringify({
          ...base,
          exercises: [shortAnswer],
          lesson: {
            title: "Appointment lesson",
            explanation: "For this exercise, type einen.",
            sections: [{ heading: "Context", content: "A lesson about appointments." }],
            vocabularyFoundations: [],
          },
        }),
        generationInput,
      ),
    ).toThrow("OD_EXERCISE_ANSWER_LEAK");
    expect(() =>
      parseAppServerCandidateOutput(
        "exercise-generation",
        JSON.stringify({
          ...base,
          exercises: [shortAnswer],
          lesson: {
            title: "Appointment lesson",
            explanation: "Die richtige Lösung ist einen.",
            sections: [{ heading: "Context", content: "A lesson about appointments." }],
            vocabularyFoundations: [],
          },
        }),
        generationInput,
      ),
    ).toThrow("OD_EXERCISE_ANSWER_LEAK");
  });
});
