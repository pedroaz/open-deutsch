import type { AppServerCandidateOutputMap } from "@open-deutsch/contracts";
import {
  evaluateExerciseAnswer,
  type ExerciseAnswer,
  type ExerciseDefinition,
  type ExerciseEvaluation,
} from "@open-deutsch/domain";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  Feedback,
  FieldGroup,
  IconButton,
  OptionCard,
  ItemList,
} from "./components/ui/index.js";
import { ActionGroup } from "./components/layout/index.js";

import styles from "./ExerciseEngine.module.css";

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

function incompleteSentenceFrame(answer: string): string {
  const answerWords = answer.match(/[\p{L}\p{N}]+/gu) ?? [];
  const fallbackMaskPosition = Math.max(0, answerWords.length - 1);
  let wordPosition = 0;
  return answer.replaceAll(/[\p{L}\p{N}]+/gu, (word) => {
    const currentPosition = wordPosition;
    wordPosition += 1;
    const mask = word.length > 3 || currentPosition === fallbackMaskPosition;
    if (!mask) return word;
    const [first = ""] = [...word];
    return `${first}${"_".repeat(Math.min(8, Math.max(1, [...word].length - 1)))}`;
  });
}

function ExerciseContent({
  definition,
  evaluated,
  values,
  setValue,
}: {
  definition: ExerciseDefinition;
  evaluated: boolean;
  values: readonly string[];
  setValue: (position: number, value: string) => void;
}) {
  const { t } = useTranslation();
  if (definition.kind === "free-writing") {
    return (
      <FieldGroup>
        {definition.content.prompt}
        <textarea
          aria-label={t("exercises.answer")}
          maxLength={definition.answerContract.maximumCharacters}
          readOnly={evaluated}
          value={values[0] ?? ""}
          onChange={(event) => {
            setValue(0, event.target.value);
          }}
        />
      </FieldGroup>
    );
  }
  if (definition.kind === "short-answer") {
    return (
      <FieldGroup>
        {definition.content.question}
        <textarea
          aria-label={t("exercises.answer")}
          readOnly={evaluated}
          value={values[0] ?? ""}
          onChange={(event) => {
            setValue(0, event.target.value);
          }}
        />
      </FieldGroup>
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
                readOnly={evaluated}
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
        <FieldGroup>
          {t("exercises.correctedSentence")}
          <textarea
            aria-label={t("exercises.correctedSentence")}
            readOnly={evaluated}
            value={values[0] ?? ""}
            onChange={(event) => {
              setValue(0, event.target.value);
            }}
          />
        </FieldGroup>
      </>
    );
  }
  if (definition.kind === "multiple-choice") {
    return (
      <fieldset>
        <legend>{definition.content.question}</legend>
        <div className={styles.optionGroup} data-evaluated={evaluated || undefined}>
          {definition.content.options.map((option, position) => (
            <OptionCard key={`${String(position)}:${option.label}`}>
              <input
                checked={values[0] === String(position)}
                disabled={evaluated}
                name={definition.exerciseId}
                type="radio"
                value={position}
                onChange={() => {
                  setValue(0, String(position));
                }}
              />
              <span>{option.label}</span>
            </OptionCard>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <FieldGroup>
      {definition.content.cue}
      <small>{t(`exercises.direction.${definition.content.direction}`)}</small>
      <textarea
        aria-label={t("exercises.answer")}
        readOnly={evaluated}
        value={values[0] ?? ""}
        onChange={(event) => {
          setValue(0, event.target.value);
        }}
      />
    </FieldGroup>
  );
}

type ExerciseAiFeedback = AppServerCandidateOutputMap["exercise-feedback"];

function Evaluation({
  evaluation,
  aiFeedback,
}: {
  evaluation: ExerciseEvaluation;
  aiFeedback?: ExerciseAiFeedback | undefined;
}) {
  const { t } = useTranslation();
  const displayedStatus =
    evaluation.status === "requires-ai" && aiFeedback
      ? aiFeedback.outcome === "demonstrated"
        ? "correct"
        : aiFeedback.outcome === "developing"
          ? "almost-correct"
          : "incorrect"
      : evaluation.status;
  const tone =
    displayedStatus === "correct"
      ? "success"
      : displayedStatus === "almost-correct"
        ? "info"
        : displayedStatus === "incorrect"
          ? "warning"
          : "info";
  return (
    <Feedback live="polite" tone={tone}>
      <strong>{t(`exercises.results.${displayedStatus}`)}</strong>
      {evaluation.acceptedAnswerReveal.length > 0 && (
        <span className={styles.acceptedAnswers}>
          {t("exercises.acceptedAnswers")}: {evaluation.acceptedAnswerReveal.join(" / ")}
        </span>
      )}
    </Feedback>
  );
}

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
  restart = false,
  onStarted,
  onCompleted,
  onAbandoned,
  onAiEvaluationRequested,
  onCancelAiEvaluation,
}: {
  exercises: readonly ExerciseDefinition[];
  restart?: boolean;
  onStarted?: () => void | Promise<void>;
  onCompleted?: (evaluations: readonly ExerciseEvaluation[]) => void | Promise<void>;
  onAbandoned?: () => void | Promise<void>;
  onCancelAiEvaluation?: () => void;
  onAiEvaluationRequested?: (
    evaluation: ExerciseEvaluation,
    exercisePosition: number,
  ) => Promise<ExerciseAiFeedback>;
}) {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [position, setPosition] = useState(0);
  const [furthestPosition, setFurthestPosition] = useState(0);
  const [values, setValues] = useState<readonly string[]>([]);
  const [valuesByPosition, setValuesByPosition] = useState<
    Readonly<Record<number, readonly string[]>>
  >({});
  const [hintCount, setHintCount] = useState(0);
  const [hintCountByPosition, setHintCountByPosition] = useState<Readonly<Record<number, number>>>(
    {},
  );
  const [evaluations, setEvaluations] = useState<readonly ExerciseEvaluation[]>([]);
  const [currentEvaluation, setCurrentEvaluation] = useState<ExerciseEvaluation>();
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
        <ItemList>
          {evaluations.map((evaluation, index) => (
            <li key={`${evaluation.exerciseKind}:${String(index)}`}>
              <Evaluation evaluation={evaluation} aiFeedback={aiFeedbackByPosition[index]} />
              {aiFeedbackByPosition[index] && <AiFeedback feedback={aiFeedbackByPosition[index]} />}
            </li>
          ))}
        </ItemList>
      </section>
    ) : null;
  }

  const displayedHints =
    definition.kind === "short-answer"
      ? [
          ...definition.hints,
          {
            text: t("exercises.answerFrameHint", {
              frame: incompleteSentenceFrame(definition.answerContract.acceptedAnswers[0] ?? ""),
            }),
          },
        ]
      : definition.hints;
  const setValue = (answerPosition: number, value: string) => {
    const next = [...values];
    next[answerPosition] = value;
    setValues(next);
    setValuesByPosition((byPosition) => ({ ...byPosition, [position]: next }));
  };
  const navigateTo = (nextPosition: number) => {
    if (nextPosition < 0 || nextPosition > furthestPosition) return;
    setPosition(nextPosition);
    setValues(valuesByPosition[nextPosition] ?? []);
    setHintCount(hintCountByPosition[nextPosition] ?? 0);
    setCurrentEvaluation(evaluations[nextPosition]);
    setCurrentAiFeedback(aiFeedbackByPosition[nextPosition]);
    setAnswerInvalid(false);
    setAiEvaluationFailed(false);
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
    setFurthestPosition((current) => Math.max(current, nextPosition));
    setValues(valuesByPosition[nextPosition] ?? []);
    setHintCount(hintCountByPosition[nextPosition] ?? 0);
    setCurrentEvaluation(nextEvaluations[nextPosition]);
    setCurrentAiFeedback(aiFeedbackByPosition[nextPosition]);
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
        setCurrentAiFeedback(feedback);
        setCurrentEvaluation(evaluation);
      } catch {
        setAiEvaluationFailed(true);
      } finally {
        setEvaluatingWithAi(false);
      }
      return;
    }
    const nextEvaluations = [...evaluations, evaluation];
    setEvaluations(nextEvaluations);
    setCurrentEvaluation(evaluation);
  };

  if (!started) {
    const start = async () => {
      setStarting(true);
      setStartFailed(false);
      try {
        await onStarted?.();
        setStarted(true);
      } catch {
        setStartFailed(true);
      } finally {
        setStarting(false);
      }
    };
    return (
      <Card as="article">
        <h2>{t("exercises.ready")}</h2>
        <p>{t("exercises.readyBody", { count: exercises.length })}</p>
        {startFailed && (
          <Feedback live="assertive" tone="error">
            {t("exercises.startFailed")}
          </Feedback>
        )}
        <Button variant="primary" isDisabled={starting} onPress={() => void start()}>
          {starting
            ? t("exercises.starting")
            : t(restart ? "exercises.startAgain" : "exercises.start")}
        </Button>
      </Card>
    );
  }

  return (
    <Card as="article" className={styles.activeExercise}>
      <div className={styles.exerciseCardHeader}>
        <p className={styles.eyebrow}>
          {t("exercises.progress", { current: position + 1, total: exercises.length })}
        </p>
        <div
          className={styles.exerciseNavigation}
          aria-label={t("exercises.navigationLabel")}
          role="group"
        >
          <IconButton
            className={styles.exerciseNavButton}
            isDisabled={position === 0 || evaluatingWithAi || completing}
            label={t("exercises.previous")}
            leadingIcon={<ChevronLeft aria-hidden="true" />}
            onPress={() => navigateTo(position - 1)}
          />
          <IconButton
            className={styles.exerciseNavButton}
            isDisabled={position >= furthestPosition || evaluatingWithAi || completing}
            label={t("exercises.forward")}
            leadingIcon={<ChevronRight aria-hidden="true" />}
            onPress={() => navigateTo(position + 1)}
          />
        </div>
      </div>
      <h2>{definition.instructions}</h2>
      {definition.explanation && <p>{definition.explanation}</p>}
      <ExerciseContent
        definition={definition}
        evaluated={currentEvaluation !== undefined}
        values={values}
        setValue={setValue}
      />
      {displayedHints.slice(0, hintCount).map((hint, index) => (
        <Feedback live="off" key={`${String(index)}:${hint.text}`}>
          {hint.text}
        </Feedback>
      ))}
      {answerInvalid && (
        <Feedback live="assertive" tone="error">
          {t("exercises.answerRequired")}
        </Feedback>
      )}
      {completionFailed && (
        <Feedback live="assertive" tone="error">
          {t("exercises.completionFailed")}
        </Feedback>
      )}
      {abandonFailed && (
        <Feedback live="assertive" tone="error">
          {t("exercises.abandonFailed")}
        </Feedback>
      )}
      {aiEvaluationFailed && (
        <Feedback live="assertive" tone="error">
          {t("exercises.aiFeedback.failed")}
        </Feedback>
      )}
      {currentEvaluation && (
        <Evaluation evaluation={currentEvaluation} aiFeedback={currentAiFeedback} />
      )}
      {currentAiFeedback && <AiFeedback feedback={currentAiFeedback} />}
      <ActionGroup className={styles.exerciseActions}>
        {onAbandoned && (
          <Button
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
        {hintCount < displayedHints.length && !currentEvaluation && (
          <Button
            onPress={() => {
              const next = hintCount + 1;
              setHintCount(next);
              setHintCountByPosition((byPosition) => ({
                ...byPosition,
                [position]: next,
              }));
            }}
          >
            {t("exercises.showHint")}
          </Button>
        )}
        {!currentEvaluation && (
          <Button variant="primary" isDisabled={evaluatingWithAi} onPress={() => void submit()}>
            {evaluatingWithAi ? t("exercises.aiFeedback.evaluating") : t("exercises.submit")}
          </Button>
        )}
        {evaluatingWithAi && onCancelAiEvaluation && (
          <Button variant="secondary" onPress={onCancelAiEvaluation}>
            {t("actions.cancel")}
          </Button>
        )}
        {currentEvaluation &&
          (currentEvaluation.status !== "requires-ai" || currentAiFeedback) &&
          position === furthestPosition &&
          position + 1 < exercises.length && (
            <Button variant="primary" onPress={() => void advance(evaluations)}>
              {t("exercises.next")}
            </Button>
          )}
        {currentEvaluation &&
          (currentEvaluation.status !== "requires-ai" || currentAiFeedback) &&
          position === furthestPosition &&
          position + 1 === exercises.length && (
            <Button
              variant="primary"
              isDisabled={completing}
              onPress={() => void advance(evaluations)}
            >
              {completing ? t("exercises.completing") : t("exercises.finish")}
            </Button>
          )}
      </ActionGroup>
    </Card>
  );
}
