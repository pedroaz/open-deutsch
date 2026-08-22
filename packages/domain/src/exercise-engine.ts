import { strictBoundaryObject, z } from "@open-deutsch/contracts";

import { exerciseAnswerSchema, type ExerciseAnswer } from "./attempt.js";
import {
  exerciseDefinitionSchema,
  exerciseKindSchema,
  type ExerciseDefinition,
} from "./exercise.js";

export const exerciseEvaluationSchema = strictBoundaryObject({
  exerciseKind: exerciseKindSchema,
  answer: exerciseAnswerSchema,
  status: z.enum(["correct", "incorrect", "requires-ai"]),
  acceptedAnswerReveal: z.array(z.string().min(1).max(500)).max(20),
});

export type ExerciseEvaluation = z.infer<typeof exerciseEvaluationSchema>;

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replaceAll(/\s+/gu, " ").toLocaleLowerCase("de-DE");
}

function isAccepted(value: string, accepted: readonly string[]): boolean {
  const candidate = normalized(value);
  return accepted.some((answer) => normalized(answer) === candidate);
}

export function evaluateExerciseAnswer(
  definitionValue: ExerciseDefinition,
  answerValue: ExerciseAnswer,
): ExerciseEvaluation {
  const definition = exerciseDefinitionSchema.parse(definitionValue);
  const answer = exerciseAnswerSchema.parse(answerValue);
  if (definition.kind !== answer.kind) throw new Error("OD_EXERCISE_ANSWER_KIND_INVALID");

  if (definition.kind === "free-writing" && answer.kind === "free-writing") {
    if (answer.text.length > definition.answerContract.maximumCharacters) {
      throw new Error("OD_EXERCISE_ANSWER_TOO_LONG");
    }
    return exerciseEvaluationSchema.parse({
      exerciseKind: definition.kind,
      answer,
      status: "requires-ai",
      acceptedAnswerReveal: [],
    });
  }
  if (definition.kind === "short-answer" && answer.kind === "short-answer") {
    return exerciseEvaluationSchema.parse({
      exerciseKind: definition.kind,
      answer,
      status: isAccepted(answer.text, definition.answerContract.acceptedAnswers)
        ? "correct"
        : "requires-ai",
      acceptedAnswerReveal: definition.answerContract.acceptedAnswers,
    });
  }
  if (definition.kind === "fill-in-the-blank" && answer.kind === "fill-in-the-blank") {
    if (answer.valuesByBlankPosition.length !== definition.content.blanks.length) {
      throw new Error("OD_EXERCISE_BLANK_COUNT_INVALID");
    }
    const correct = definition.content.blanks.every((blank, position) =>
      isAccepted(answer.valuesByBlankPosition[position] ?? "", blank.acceptedAnswers),
    );
    return exerciseEvaluationSchema.parse({
      exerciseKind: definition.kind,
      answer,
      status: correct ? "correct" : "incorrect",
      acceptedAnswerReveal: definition.content.blanks.flatMap(({ acceptedAnswers }) =>
        acceptedAnswers.slice(0, 1),
      ),
    });
  }
  if (definition.kind === "sentence-correction" && answer.kind === "sentence-correction") {
    return exerciseEvaluationSchema.parse({
      exerciseKind: definition.kind,
      answer,
      status: isAccepted(answer.text, definition.answerContract.acceptedAnswers)
        ? "correct"
        : "requires-ai",
      acceptedAnswerReveal: definition.answerContract.acceptedAnswers,
    });
  }
  if (definition.kind === "multiple-choice" && answer.kind === "multiple-choice") {
    return exerciseEvaluationSchema.parse({
      exerciseKind: definition.kind,
      answer,
      status:
        answer.selectedOptionPosition === definition.content.correctOptionPosition
          ? "correct"
          : "incorrect",
      acceptedAnswerReveal: [
        definition.content.options[definition.content.correctOptionPosition].label,
      ],
    });
  }
  if (definition.kind === "vocabulary-recall" && answer.kind === "vocabulary-recall") {
    return exerciseEvaluationSchema.parse({
      exerciseKind: definition.kind,
      answer,
      status: isAccepted(answer.text, definition.answerContract.acceptedAnswers)
        ? "correct"
        : "incorrect",
      acceptedAnswerReveal: definition.answerContract.acceptedAnswers,
    });
  }
  throw new Error("OD_EXERCISE_ANSWER_KIND_INVALID");
}
