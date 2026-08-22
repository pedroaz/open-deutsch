import {
  exerciseDefinitionSchema,
  type ExerciseDefinition,
  type ExerciseEvaluation,
} from "@open-deutsch/domain";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExerciseEngine } from "../src/renderer/ExerciseEngine.js";
import i18n from "../src/renderer/i18n.js";

const shared = {
  exerciseId: "exercise_0123456789abcdefgh",
  aiProvenance: {
    source: "ai" as const,
    producer: "desktop-app-server" as const,
    modelRequestId: "model-request_0123456789abcdefgh",
    generatedAt: "2026-08-20T10:00:00.000Z",
    modelSelection: {
      availability: "reported" as const,
      modelId: "gpt-fake",
      effortId: "medium",
    },
  },
  cefrBand: "a2" as const,
  objectives: [{ key: "article-choice", description: "Choose an article." }],
  instructions: "Choose the correct article.",
  hints: [{ text: "Think about the accusative case." }],
  feedbackMode: "immediate" as const,
  curriculumTopicIds: [],
  vocabularySetLinks: [],
};

const choice: ExerciseDefinition = exerciseDefinitionSchema.parse({
  ...shared,
  kind: "multiple-choice",
  content: {
    question: "Ich brauche ___ Termin.",
    options: [{ label: "der" }, { label: "die" }, { label: "das" }, { label: "einen" }],
    correctOptionPosition: 3,
  },
  answerContract: { kind: "single-option", addressing: "zero-based-index" },
});

describe("generic exercise renderer", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("reveals hints and correctness only after submission", async () => {
    const user = userEvent.setup();
    const completed = vi.fn<(evaluations: readonly ExerciseEvaluation[]) => void>();
    render(<ExerciseEngine exercises={[choice]} onCompleted={completed} />);
    expect(screen.queryByText(/Accepted answer/u)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter a valid answer");
    await user.click(screen.getByRole("button", { name: "Show a hint" }));
    expect(screen.getByText("Think about the accusative case.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "der" }));
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByText("Review this answer")).toBeTruthy();
    expect(screen.getByText(/Accepted answer: einen/u)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Finish set" }));
    expect(screen.getByRole("heading", { name: "Practice complete" })).toBeTruthy();
    expect(completed).toHaveBeenCalledOnce();
    expect(completed.mock.calls[0]?.[0]?.[0]).toMatchObject({
      status: "incorrect",
      answer: { selectedOptionPosition: 0 },
    });
  });

  it("defers results until the end when the session override requests it", async () => {
    const user = userEvent.setup();
    render(<ExerciseEngine exercises={[choice]} />);
    await user.selectOptions(screen.getByLabelText("Feedback timing"), "submit-at-end");
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    await user.click(screen.getByRole("radio", { name: "einen" }));
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByRole("heading", { name: "Practice complete" })).toBeTruthy();
    expect(screen.getByText("Correct")).toBeTruthy();
  });

  it("renders positional blanks, sentence correction, and vocabulary recall through one engine", async () => {
    const user = userEvent.setup();
    const fill = exerciseDefinitionSchema.parse({
      ...shared,
      kind: "fill-in-the-blank",
      content: {
        leadingText: "Ich fahre mit ",
        blanks: [{ acceptedAnswers: ["dem"], followingText: " Bus." }],
      },
      answerContract: { kind: "blank-values", addressing: "zero-based-index" },
    });
    const first = render(<ExerciseEngine exercises={[fill]} />);
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    await user.type(screen.getByRole("textbox", { name: "Blank 1" }), "dem");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByText("Correct")).toBeTruthy();
    first.unmount();

    const correction = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: "exercise_1123456789abcdefgh",
      feedbackMode: "submit-at-end",
      kind: "sentence-correction",
      content: { sentence: "Ich brauche ein Termin." },
      answerContract: {
        kind: "corrected-sentence",
        acceptedAnswers: ["Ich brauche einen Termin."],
        evaluation: "accepted-answer-or-ai",
      },
    });
    const second = render(<ExerciseEngine exercises={[correction]} />);
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your corrected sentence" }),
      "Ich brauche einen Termin.",
    );
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByRole("heading", { name: "Practice complete" })).toBeTruthy();
    second.unmount();

    const recall = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: "exercise_2123456789abcdefgh",
      kind: "vocabulary-recall",
      content: { cue: "appointment", direction: "production" },
      answerContract: { kind: "recalled-text", acceptedAnswers: ["Termin"] },
    });
    render(<ExerciseEngine exercises={[recall]} />);
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Treffen");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByText(/Accepted answer: Termin/u)).toBeTruthy();
  });

  it("preserves a free-writing answer until bounded AI feedback is validated and revealed", async () => {
    const user = userEvent.setup();
    const free = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: "exercise_3123456789abcdefgh",
      kind: "free-writing",
      content: { prompt: "Write a short request." },
      answerContract: { kind: "free-text", maximumCharacters: 100, evaluation: "ai" },
    });
    const feedback = vi.fn().mockResolvedValue({
      outcome: "developing",
      summary: "Your request is understandable and needs one small correction.",
      strengths: ["The purpose is clear."],
      improvements: ["Use the accusative article."],
      objectiveEvaluations: [
        {
          outcome: "developing",
          evidence: "The request is understandable.",
          uncertainty: { level: "none" },
        },
      ],
      suggestedAnswer: "Ich brauche einen Termin.",
      nextStep: null,
      overallUncertainty: { level: "none" },
      caveats: [],
    });
    render(<ExerciseEngine exercises={[free]} onAiEvaluationRequested={feedback} />);
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    const answer = screen.getByRole("textbox", { name: "Your answer" });
    await user.type(answer, "Ich brauche einen Termin.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByText(/Your request is understandable/u)).toBeTruthy();
    expect(screen.getByText("Suggested answer:")).toBeTruthy();
    expect(
      screen.getByText((_, element: Element | null) => {
        if (!element) return false;
        return element.tagName === "P" && element.textContent.includes("Ich brauche einen Termin.");
      }),
    ).toBeTruthy();
    expect((answer as HTMLTextAreaElement).value).toBe("Ich brauche einen Termin.");
    expect(screen.queryByRole("heading", { name: "Practice complete" })).toBeNull();
    expect(feedback).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Finish set" }));
    expect(screen.getByRole("heading", { name: "Practice complete" })).toBeTruthy();
  });

  it("withholds validated AI feedback until every submit-at-end answer is complete", async () => {
    const user = userEvent.setup();
    const openExercise = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: "exercise_5123456789abcdefgh",
      feedbackMode: "submit-at-end",
      kind: "short-answer",
      content: { question: "Write one appointment sentence." },
      answerContract: {
        kind: "short-text",
        acceptedAnswers: ["Ich brauche einen Termin."],
        evaluation: "accepted-answer-or-ai",
      },
    });
    const secondExercise = exerciseDefinitionSchema.parse({
      ...openExercise,
      exerciseId: "exercise_6123456789abcdefgh",
      content: { question: "Write another appointment sentence." },
    });
    const feedback = vi.fn().mockResolvedValue({
      outcome: "developing",
      summary: "Private deferred feedback.",
      strengths: ["The purpose is clear."],
      improvements: ["Review the article."],
      objectiveEvaluations: [
        {
          outcome: "developing",
          evidence: "The intended meaning is clear.",
          uncertainty: { level: "none" },
        },
      ],
      suggestedAnswer: "Ich brauche einen Termin.",
      nextStep: null,
      overallUncertainty: { level: "none" },
      caveats: [],
    });
    render(
      <ExerciseEngine
        exercises={[openExercise, secondExercise]}
        onAiEvaluationRequested={feedback}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "Ich brauche ein Termin.",
    );
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByText("Exercise 2 of 2")).toBeTruthy();
    expect(screen.queryByText("Private deferred feedback.")).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Ich suche ein Termin.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByRole("heading", { name: "Practice complete" })).toBeTruthy();
    expect(screen.getAllByText("Private deferred feedback.")).toHaveLength(2);
  });

  it("keeps the full open response visible when bounded feedback fails", async () => {
    const user = userEvent.setup();
    const free = exerciseDefinitionSchema.parse({
      ...shared,
      exerciseId: "exercise_4123456789abcdefgh",
      kind: "free-writing",
      content: { prompt: "Write a short request." },
      answerContract: { kind: "free-text", maximumCharacters: 100, evaluation: "ai" },
    });
    render(
      <ExerciseEngine
        exercises={[free]}
        onAiEvaluationRequested={vi.fn().mockRejectedValue(new Error("unavailable"))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    const answer = screen.getByRole("textbox", { name: "Your answer" });
    await user.type(answer, "Ich brauche ein Termin.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByText(/answer was saved, but feedback is unavailable/u)).toBeTruthy();
    expect((answer as HTMLTextAreaElement).value).toBe("Ich brauche ein Termin.");
    expect(screen.queryByText(/Suggested answer/u)).toBeNull();
  });

  it("abandons an active set explicitly without reporting completion", async () => {
    const user = userEvent.setup();
    const abandoned = vi.fn().mockResolvedValue(undefined);
    const completed = vi.fn();
    render(<ExerciseEngine exercises={[choice]} onAbandoned={abandoned} onCompleted={completed} />);
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    await user.click(screen.getByRole("button", { name: "Abandon set" }));
    expect(await screen.findByRole("heading", { name: "Practice set abandoned" })).toBeTruthy();
    expect(screen.getByText(/not added to History/u)).toBeTruthy();
    expect(abandoned).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
  });
});
