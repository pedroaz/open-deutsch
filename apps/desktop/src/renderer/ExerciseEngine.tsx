import type { AppServerCandidateOutputMap } from "@open-deutsch/contracts";
import {
  evaluateExerciseAnswer,
  type ExerciseAnswer,
  type ExerciseDefinition,
  type ExerciseEvaluation,
} from "@open-deutsch/domain";
import { useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import { StatusMessage, SurfaceCard } from "./components/Foundation.js";

type FeedbackMode = "immediate" | "submit-at-end";

function answerFor(definition: ExerciseDefinition, values: readonly string[]): ExerciseAnswer {
  if (definition.kind === "free-writing") return { kind: definition.kind, text: values[0] ?? "" };
  if (definition.kind === "short-answer") return { kind: definition.kind, text: values[0] ?? "" };
  if (definition.kind === "fill-in-the-blank") {
    return { kind: definition.kind, valuesByBlankPosition: [...values] };
  }
  if (definition.kind === "sentence-correction") {
    return { kind: definition.kind, text: values[0] ?? "" };
  }
  if (definition.kind === "multiple-choice") {
    return { kind: definition.kind, selectedOptionPosition: Number(values[0] ?? "-1") };
  }
  return { kind: definition.kind, text: values[0] ?? "" };
}

function ExerciseContent({
  definition,
  values,
  setValue,
}: {
  definition: ExerciseDefinition;
  values: readonly string[];
  setValue: (position: number, value: string) => void;
}) {
  const { t } = useTranslation();
  if (definition.kind === "free-writing") {
    return (
      <label className={styles.controlLabel}>
        {definition.content.prompt}
        <textarea
          aria-label={t("exercises.answer")}
          maxLength={definition.answerContract.maximumCharacters}
          value={values[0] ?? ""}
          onChange={(event) => {
            setValue(0, event.target.value);
          }}
        />
      </label>
    );
  }
  if (definition.kind === "short-answer") {
    return (
      <label className={styles.controlLabel}>
        {definition.content.question}
        <textarea
          aria-label={t("exercises.answer")}
          value={values[0] ?? ""}
          onChange={(event) => {
            setValue(0, event.target.value);
          }}
        />
      </label>
    );
  }
  if (definition.kind === "fill-in-the-blank") {
    return (
      <div className={styles.exerciseBlanks}>
        <span>{definition.content.leadingText}</span>
        {definition.content.blanks.map((blank, position) => (
          <span key={position}>
            <label>
              <input
                aria-label={t("exercises.blank", { number: position + 1 })}
                value={values[position] ?? ""}
                onChange={(event) => {
                  setValue(position, event.target.value);
                }}
              />
            </label>
            {blank.followingText}
          </span>
        ))}
      </div>
    );
  }
  if (definition.kind === "sentence-correction") {
    return (
      <>
        <blockquote className={styles.exercisePrompt}>{definition.content.sentence}</blockquote>
        <label className={styles.controlLabel}>
          {t("exercises.correctedSentence")}
          <textarea
            aria-label={t("exercises.correctedSentence")}
            value={values[0] ?? ""}
            onChange={(event) => {
              setValue(0, event.target.value);
            }}
          />
        </label>
      </>
    );
  }
  if (definition.kind === "multiple-choice") {
    return (
      <fieldset>
        <legend>{definition.content.question}</legend>
        <div className={styles.optionGroup}>
          {definition.content.options.map((option, position) => (
            <label className={styles.optionCard} key={`${String(position)}:${option.label}`}>
              <input
                checked={values[0] === String(position)}
                name={definition.exerciseId}
                type="radio"
                value={position}
                onChange={() => {
                  setValue(0, String(position));
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className={styles.controlLabel}>
      {definition.content.cue}
      <small>{t(`exercises.direction.${definition.content.direction}`)}</small>
      <textarea
        aria-label={t("exercises.answer")}
        value={values[0] ?? ""}
        onChange={(event) => {
          setValue(0, event.target.value);
        }}
      />
    </label>
  );
}

function Evaluation({ evaluation }: { evaluation: ExerciseEvaluation }) {
  const { t } = useTranslation();
  const tone =
    evaluation.status === "correct"
      ? "success"
      : evaluation.status === "incorrect"
        ? "warning"
        : "neutral";
  return (
    <StatusMessage tone={tone}>
      <strong>{t(`exercises.results.${evaluation.status}`)}</strong>
      {evaluation.acceptedAnswerReveal.length > 0 && (
        <span>
          {" "}
          {t("exercises.acceptedAnswers")}: {evaluation.acceptedAnswerReveal.join(" / ")}
        </span>
      )}
    </StatusMessage>
  );
}

type ExerciseAiFeedback = AppServerCandidateOutputMap["exercise-feedback"];

function AiFeedback({ feedback }: { feedback: ExerciseAiFeedback }) {
  const { t } = useTranslation();
  return (
    <div className={styles.exerciseAiFeedback}>
      <p>{feedback.summary}</p>
      {feedback.strengths.length > 0 && (
        <section>
          <h3>{t("exercises.aiFeedback.strengths")}</h3>
          <ul>
            {feedback.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {feedback.improvements.length > 0 && (
        <section>
          <h3>{t("exercises.aiFeedback.improvements")}</h3>
          <ul>
            {feedback.improvements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {feedback.suggestedAnswer && (
        <p>
          <strong>{t("exercises.aiFeedback.suggestedAnswer")}</strong> {feedback.suggestedAnswer}
        </p>
      )}
    </div>
  );
}

export function ExerciseEngine({
  exercises,
  onStarted,
  onCompleted,
  onAbandoned,
  onAiEvaluationRequested,
}: {
  exercises: readonly ExerciseDefinition[];
  onStarted?: (feedbackMode: FeedbackMode) => void | Promise<void>;
  onCompleted?: (evaluations: readonly ExerciseEvaluation[]) => void | Promise<void>;
  onAbandoned?: () => void | Promise<void>;
  onAiEvaluationRequested?: (
    evaluation: ExerciseEvaluation,
    exercisePosition: number,
  ) => Promise<ExerciseAiFeedback>;
}) {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [position, setPosition] = useState(0);
  const [values, setValues] = useState<readonly string[]>([]);
  const [hintCount, setHintCount] = useState(0);
  const [evaluations, setEvaluations] = useState<readonly ExerciseEvaluation[]>([]);
  const [currentEvaluation, setCurrentEvaluation] = useState<ExerciseEvaluation>();
  const [modeOverride, setModeOverride] = useState<FeedbackMode>();
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completionFailed, setCompletionFailed] = useState(false);
  const [answerInvalid, setAnswerInvalid] = useState(false);
  const [evaluatingWithAi, setEvaluatingWithAi] = useState(false);
  const [aiEvaluationFailed, setAiEvaluationFailed] = useState(false);
  const [currentAiFeedback, setCurrentAiFeedback] = useState<ExerciseAiFeedback>();
  const [aiFeedbackByPosition, setAiFeedbackByPosition] = useState<
    Readonly<Record<number, ExerciseAiFeedback>>
  >({});
  const [abandoning, setAbandoning] = useState(false);
  const [abandonFailed, setAbandonFailed] = useState(false);
  const [abandoned, setAbandoned] = useState(false);
  const definition = exercises[position];

  if (abandoned) {
    return (
      <section aria-labelledby="exercise-abandoned-heading">
        <h2 id="exercise-abandoned-heading">{t("exercises.abandoned")}</h2>
        <p>{t("exercises.abandonedBody")}</p>
      </section>
    );
  }

  if (!definition) {
    return evaluations.length > 0 ? (
      <section aria-labelledby="exercise-complete-heading">
        <h2 id="exercise-complete-heading">{t("exercises.complete")}</h2>
        <ol className={styles.compactList}>
          {evaluations.map((evaluation, index) => (
            <li key={`${evaluation.exerciseKind}:${String(index)}`}>
              <Evaluation evaluation={evaluation} />
              {aiFeedbackByPosition[index] && <AiFeedback feedback={aiFeedbackByPosition[index]} />}
            </li>
          ))}
        </ol>
      </section>
    ) : null;
  }

  const mode = modeOverride ?? definition.feedbackMode;
  const setValue = (answerPosition: number, value: string) => {
    setValues((current) => {
      const next = [...current];
      next[answerPosition] = value;
      return next;
    });
  };
  const advance = async (nextEvaluations: readonly ExerciseEvaluation[]) => {
    const nextPosition = position + 1;
    if (nextPosition === exercises.length) {
      setCompleting(true);
      setCompletionFailed(false);
      try {
        await onCompleted?.(nextEvaluations);
      } catch {
        setCompletionFailed(true);
        return;
      } finally {
        setCompleting(false);
      }
    }
    setPosition(nextPosition);
    setValues([]);
    setHintCount(0);
    setCurrentEvaluation(undefined);
    setCurrentAiFeedback(undefined);
  };
  const submit = async () => {
    let evaluation: ExerciseEvaluation;
    try {
      evaluation = evaluateExerciseAnswer(definition, answerFor(definition, values));
      setAnswerInvalid(false);
    } catch {
      setAnswerInvalid(true);
      return;
    }
    if (evaluation.status === "requires-ai") {
      if (!onAiEvaluationRequested) {
        setAiEvaluationFailed(true);
        return;
      }
      setEvaluatingWithAi(true);
      setAiEvaluationFailed(false);
      try {
        const feedback = await onAiEvaluationRequested(evaluation, position);
        const nextEvaluations = [...evaluations, evaluation];
        setEvaluations(nextEvaluations);
        setAiFeedbackByPosition((current) => ({ ...current, [position]: feedback }));
        if (mode === "immediate") {
          setCurrentAiFeedback(feedback);
          setCurrentEvaluation(evaluation);
        } else {
          await advance(nextEvaluations);
        }
      } catch {
        setAiEvaluationFailed(true);
      } finally {
        setEvaluatingWithAi(false);
      }
      return;
    }
    const nextEvaluations = [...evaluations, evaluation];
    setEvaluations(nextEvaluations);
    if (mode === "immediate") setCurrentEvaluation(evaluation);
    else void advance(nextEvaluations);
  };

  if (!started) {
    const start = async () => {
      setStarting(true);
      setStartFailed(false);
      try {
        await onStarted?.(mode);
        setStarted(true);
      } catch {
        setStartFailed(true);
      } finally {
        setStarting(false);
      }
    };
    return (
      <SurfaceCard>
        <h2>{t("exercises.ready")}</h2>
        <p>{t("exercises.readyBody", { count: exercises.length })}</p>
        <label className={styles.controlLabel}>
          {t("exercises.feedbackMode")}
          <select
            value={modeOverride ?? "default"}
            onChange={(event) => {
              setModeOverride(
                event.target.value === "default" ? undefined : (event.target.value as FeedbackMode),
              );
            }}
          >
            <option value="default">{t("exercises.feedbackModes.default")}</option>
            <option value="immediate">{t("exercises.feedbackModes.immediate")}</option>
            <option value="submit-at-end">{t("exercises.feedbackModes.submit-at-end")}</option>
          </select>
        </label>
        {startFailed && <StatusMessage tone="error">{t("exercises.startFailed")}</StatusMessage>}
        <Button className={styles.primary} isDisabled={starting} onPress={() => void start()}>
          {starting ? t("exercises.starting") : t("exercises.start")}
        </Button>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard>
      <p className={styles.eyebrow}>
        {t("exercises.progress", { current: position + 1, total: exercises.length })}
      </p>
      <h2>{definition.instructions}</h2>
      {definition.explanation && <p>{definition.explanation}</p>}
      <ExerciseContent definition={definition} values={values} setValue={setValue} />
      {definition.hints.slice(0, hintCount).map((hint, index) => (
        <StatusMessage key={`${String(index)}:${hint.text}`}>{hint.text}</StatusMessage>
      ))}
      <div className={styles.buttonRow}>
        {onAbandoned && (
          <Button
            className={styles.secondary}
            isDisabled={abandoning || completing || evaluatingWithAi}
            onPress={() => {
              setAbandoning(true);
              setAbandonFailed(false);
              void Promise.resolve(onAbandoned())
                .then(() => {
                  setAbandoned(true);
                })
                .catch(() => {
                  setAbandonFailed(true);
                })
                .finally(() => {
                  setAbandoning(false);
                });
            }}
          >
            {abandoning ? t("exercises.abandoning") : t("exercises.abandon")}
          </Button>
        )}
        {hintCount < definition.hints.length && !currentEvaluation && (
          <Button
            className={styles.secondary}
            onPress={() => {
              setHintCount((count) => count + 1);
            }}
          >
            {t("exercises.showHint")}
          </Button>
        )}
        {!currentEvaluation && (
          <Button
            className={styles.primary}
            isDisabled={evaluatingWithAi}
            onPress={() => void submit()}
          >
            {evaluatingWithAi ? t("exercises.aiFeedback.evaluating") : t("exercises.submit")}
          </Button>
        )}
        {currentEvaluation &&
          (currentEvaluation.status !== "requires-ai" || currentAiFeedback) &&
          position + 1 < exercises.length && (
            <Button className={styles.primary} onPress={() => void advance(evaluations)}>
              {t("exercises.next")}
            </Button>
          )}
        {currentEvaluation &&
          (currentEvaluation.status !== "requires-ai" || currentAiFeedback) &&
          position + 1 === exercises.length && (
            <Button
              className={styles.primary}
              isDisabled={completing}
              onPress={() => void advance(evaluations)}
            >
              {completing ? t("exercises.completing") : t("exercises.finish")}
            </Button>
          )}
      </div>
      {answerInvalid && <StatusMessage tone="error">{t("exercises.answerRequired")}</StatusMessage>}
      {completionFailed && (
        <StatusMessage tone="error">{t("exercises.completionFailed")}</StatusMessage>
      )}
      {abandonFailed && <StatusMessage tone="error">{t("exercises.abandonFailed")}</StatusMessage>}
      {aiEvaluationFailed && (
        <StatusMessage tone="error">{t("exercises.aiFeedback.failed")}</StatusMessage>
      )}
      {currentEvaluation && <Evaluation evaluation={currentEvaluation} />}
      {currentAiFeedback && <AiFeedback feedback={currentAiFeedback} />}
    </SurfaceCard>
  );
}
