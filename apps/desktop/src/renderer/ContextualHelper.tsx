import {
  contextualHelpCandidateSchema,
  type AppServerCandidateOutputMap,
  type OpenDeutschError,
} from "@open-deutsch/contracts";
import { MessageCircleQuestion, Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import { StatusMessage } from "./components/Foundation.js";
import {
  createDesktopSubmissionId,
  invokeDesktop,
  normalizeDesktopError,
  subscribeDesktop,
} from "./ipc.js";

type CorrelationId = ReturnType<typeof createDesktopSubmissionId>;
type HelpOutput = AppServerCandidateOutputMap["contextual-help"];

export type ContextualHelperSelection = Readonly<{
  sessionId: CorrelationId;
  selectedText: string;
  containingSentence: string;
  activeResultSummary?: string;
}>;

export function ContextualHelper({
  selection,
  requestAiAccess,
}: {
  selection: ContextualHelperSelection | undefined;
  requestAiAccess: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<readonly Readonly<{ question: string; output: HelpOutput }>[]>(
    [],
  );
  const [stage, setStage] = useState<"idle" | "queued" | "running" | "validating">("idle");
  const [error, setError] = useState<OpenDeutschError>();
  const submissionId = useRef<CorrelationId | undefined>(undefined);
  const [operationId, setOperationId] = useState<CorrelationId>();
  const submittedQuestions = useRef(new Map<CorrelationId, string>());

  useEffect(
    () =>
      subscribeDesktop((event) => {
        if (
          event.event === "learning-operation-progress" &&
          event.kind === "contextual-help" &&
          event.submissionId === submissionId.current
        ) {
          setOperationId(event.operationId);
          setStage(event.stage === "validating" ? "validating" : "running");
        }
        if (
          event.event === "learning-operation-finished" &&
          event.kind === "contextual-help" &&
          event.submissionId === submissionId.current
        ) {
          setOperationId(undefined);
          setStage("idle");
          if (event.outcome.status === "validated") {
            const output = contextualHelpCandidateSchema.parse(event.outcome.output);
            const submittedQuestion = submittedQuestions.current.get(event.submissionId);
            if (submittedQuestion) {
              setTurns((current) =>
                [...current, { question: submittedQuestion, output }].slice(-6),
              );
            }
            setQuestion("");
            setError(undefined);
          } else if (event.outcome.status === "failed") {
            setError(event.outcome.error);
          }
        }
      }),
    [],
  );

  const ask = async () => {
    if (!selection || !question.trim() || !(await requestAiAccess())) return;
    const nextSubmissionId = createDesktopSubmissionId();
    submissionId.current = nextSubmissionId;
    submittedQuestions.current.set(nextSubmissionId, question.trim());
    setStage("queued");
    setError(undefined);
    try {
      const result = await invokeDesktop("learning-operation/start", {
        submissionId: nextSubmissionId,
        input: {
          kind: "contextual-help",
          sessionId: selection.sessionId,
          selectedText: selection.selectedText,
          containingSentence: selection.containingSentence,
          question: question.trim(),
          ...(selection.activeResultSummary
            ? { activeResultSummary: selection.activeResultSummary }
            : {}),
        },
      });
      setOperationId(result.operationId);
    } catch (cause) {
      setStage("idle");
      setError(normalizeDesktopError(cause).detail);
    }
  };

  return (
    <div className={styles.helperConversation}>
      {!selection ? (
        <StatusMessage>{t("helper.selectText")}</StatusMessage>
      ) : (
        <>
          <figure className={styles.helperSelection}>
            <blockquote>{selection.selectedText}</blockquote>
            <figcaption>{t("helper.selectedContext")}</figcaption>
          </figure>
          <div className={styles.helperTurns} aria-live="polite">
            {turns.map((turn, index) => (
              <article key={`${turn.question}:${String(index)}`}>
                <p className={styles.eyebrow}>{t("helper.youAsked")}</p>
                <p>{turn.question}</p>
                <p className={styles.eyebrow}>{t("helper.answer")}</p>
                <p>{turn.output.answer}</p>
                {turn.output.examples.length > 0 ? (
                  <ul className={styles.compactList}>
                    {turn.output.examples.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                ) : null}
                {turn.output.alternatives.length > 0 ? (
                  <section>
                    <h3>{t("helper.alternatives")}</h3>
                    <ul className={styles.compactList}>
                      {turn.output.alternatives.map((alternative) => (
                        <li key={alternative}>{alternative}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {turn.output.translations.length > 0 ? (
                  <section>
                    <h3>{t("helper.translations")}</h3>
                    <ul className={styles.compactList}>
                      {turn.output.translations.map((translation) => (
                        <li key={`${translation.sourceText}:${translation.translatedText}`}>
                          <span lang="de">{translation.sourceText}</span> —{" "}
                          {translation.translatedText}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {turn.output.miniExercises.length > 0 ? (
                  <section>
                    <h3>{t("helper.miniExercises")}</h3>
                    {turn.output.miniExercises.map((exercise) => (
                      <details key={exercise.prompt}>
                        <summary>{exercise.prompt}</summary>
                        <p>{exercise.suggestedAnswer}</p>
                      </details>
                    ))}
                  </section>
                ) : null}
                {turn.output.followUpSuggestions.length > 0 ? (
                  <section>
                    <h3>{t("helper.followUps")}</h3>
                    <ul className={styles.compactList}>
                      {turn.output.followUpSuggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {turn.output.uncertainty.level !== "none" ? (
                  <StatusMessage tone="warning">
                    {turn.output.uncertainty.explanation}
                  </StatusMessage>
                ) : null}
              </article>
            ))}
          </div>
          <label className={styles.controlLabel}>
            <span>{t("helper.question")}</span>
            <textarea
              maxLength={1_000}
              rows={3}
              value={question}
              onChange={(event) => {
                setQuestion(event.currentTarget.value);
              }}
            />
          </label>
          <div className={styles.buttonRow}>
            <Button
              className={styles.primary}
              isDisabled={!question.trim() || stage !== "idle"}
              onPress={() => void ask()}
            >
              <Send aria-hidden="true" />
              {stage === "idle" ? t("helper.ask") : t(`helper.stages.${stage}`)}
            </Button>
            {operationId ? (
              <Button
                className={styles.secondary}
                onPress={() => {
                  if (operationId) {
                    void invokeDesktop("learning-operation/cancel", { operationId });
                  }
                }}
              >
                <Square aria-hidden="true" /> {t("actions.cancel")}
              </Button>
            ) : null}
          </div>
          {error ? (
            <StatusMessage tone="error">
              <MessageCircleQuestion aria-hidden="true" /> {t(error.messageKey)}
              <code className={styles.diagnostic}>
                {error.reference.code} · {error.reference.correlationId}
              </code>
            </StatusMessage>
          ) : null}
        </>
      )}
    </div>
  );
}
