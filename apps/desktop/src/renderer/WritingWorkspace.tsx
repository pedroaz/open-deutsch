import type { AppServerCandidateOutputMap, OpenDeutschError } from "@open-deutsch/contracts";
import {
  writingCorrectionCandidateSchema,
  writingPromptCandidateSchema,
} from "@open-deutsch/contracts";
import { useEffect, useRef, useState } from "react";
import { FilePenLine, MousePointer2, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DiagnosticCode, Button, Feedback, FieldGroup, LoadingState, Muted } from "./components/ui/index.js";
import { ActionGroup, Page } from "./components/layout/index.js";

import styles from "./WritingWorkspace.module.css";
import { CorrectionComparison } from "./CorrectionComparison.js";
import type { ContextualHelperSelection } from "./ContextualHelper.js";
import {
  createDesktopSubmissionId,
  invokeDesktop,
  normalizeDesktopError,
  subscribeDesktop,
} from "./ipc.js";

type TeachingProfileChoice = "profile-default" | "conversation-partner" | "strict-corrector";
type FeedbackChoice = "all-meaningful" | "priority-only";

type PromptOutput = AppServerCandidateOutputMap["writing-prompt"];
type CorrectionOutput = AppServerCandidateOutputMap["writing-correction"];
type CorrelationId = ReturnType<typeof createDesktopSubmissionId>;
type OperationStage = "idle" | "queued" | "running" | "validating" | "cancelling";

export function WritingWorkspace({
  onDirtyChange,
  requestAiAccess,
  initialContext = "",
  initialDraft = "",
  onHelperSelection,
}: {
  onDirtyChange: (dirty: boolean) => void;
  requestAiAccess: () => Promise<boolean>;
  initialContext?: string;
  initialDraft?: string;
  onHelperSelection: (selection: ContextualHelperSelection | undefined) => void;
}) {
  const { t } = useTranslation();
  const [context, setContext] = useState(initialContext);
  const [draft, setDraft] = useState(initialDraft);
  const [teachingProfile, setTeachingProfile] = useState<TeachingProfileChoice>("strict-corrector");
  const [feedback, setFeedback] = useState<FeedbackChoice>("all-meaningful");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [prompt, setPrompt] = useState<PromptOutput>();
  const submissionId = useRef<CorrelationId | undefined>(undefined);
  const settledPromptSubmissions = useRef(new Set<CorrelationId>());
  const [operationId, setOperationId] = useState<CorrelationId>();
  const [promptStage, setPromptStage] = useState<"idle" | "queued" | "running" | "validating">(
    "idle",
  );
  const [promptError, setPromptError] = useState<OpenDeutschError>();
  const correctionSubmissionId = useRef<CorrelationId | undefined>(undefined);
  const settledCorrectionSubmissions = useRef(new Set<CorrelationId>());
  const correctionOriginals = useRef(new Map<CorrelationId, string>());
  const [correctionOperationId, setCorrectionOperationId] = useState<CorrelationId>();
  const [previousCorrectionOperationId, setPreviousCorrectionOperationId] =
    useState<CorrelationId>();
  const [correctionStage, setCorrectionStage] = useState<OperationStage>("idle");
  const [correctionError, setCorrectionError] = useState<OpenDeutschError>();
  const [correctionOutcome, setCorrectionOutcome] = useState<"cancelled" | "rate-limited">();
  const [correction, setCorrection] = useState<CorrectionOutput>();
  const [correctionOriginal, setCorrectionOriginal] = useState("");
  const [helperSessionId] = useState(createDesktopSubmissionId);
  const dirty = context.length > 0 || draft.length > 0;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(
    () => () => {
      onHelperSelection(undefined);
    },
    [onHelperSelection],
  );

  useEffect(() => {
    if (selection.end <= selection.start) {
      onHelperSelection(undefined);
      return;
    }
    const selectedText = draft.slice(selection.start, selection.end).trim();
    if (!selectedText) {
      onHelperSelection(undefined);
      return;
    }
    const sentenceStart = Math.max(
      draft.lastIndexOf(".", selection.start - 1),
      draft.lastIndexOf("!", selection.start - 1),
      draft.lastIndexOf("?", selection.start - 1),
      draft.lastIndexOf("\n", selection.start - 1),
    );
    const endings = [".", "!", "?", "\n"]
      .map((delimiter) => draft.indexOf(delimiter, selection.end))
      .filter((position) => position >= 0);
    const sentenceEnd = endings.length > 0 ? Math.min(...endings) + 1 : draft.length;
    onHelperSelection({
      sessionId: helperSessionId,
      selectedText,
      containingSentence: draft.slice(sentenceStart + 1, sentenceEnd).trim() || selectedText,
      ...(correction ? { activeResultSummary: correction.summary } : {}),
    });
  }, [correction, draft, helperSessionId, onHelperSelection, selection]);

  useEffect(
    () =>
      subscribeDesktop((event) => {
        if (
          event.event !== "learning-operation-progress" &&
          event.event !== "learning-operation-finished"
        )
          return;
        if (
          submissionId.current &&
          event.submissionId === submissionId.current &&
          event.event === "learning-operation-progress" &&
          event.kind === "writing-prompt"
        ) {
          setOperationId(event.operationId);
          setPromptStage(
            event.stage === "persisting" || event.stage === "cancelling" ? "running" : event.stage,
          );
        }
        if (
          submissionId.current &&
          event.submissionId === submissionId.current &&
          event.event === "learning-operation-finished" &&
          event.kind === "writing-prompt"
        ) {
          settledPromptSubmissions.current.add(event.submissionId);
          setOperationId(undefined);
          setPromptStage("idle");
          if (event.outcome.status === "validated") {
            const output = writingPromptCandidateSchema.parse(event.outcome.output);
            setPrompt(output);
            setContext(`${output.situation}\n\n${output.task}`);
            setPromptError(undefined);
          } else if (event.outcome.status === "failed") {
            setPromptError(event.outcome.error);
          }
          return;
        }
        if (
          !correctionSubmissionId.current ||
          event.submissionId !== correctionSubmissionId.current ||
          event.kind !== "writing-correction"
        )
          return;
        if (event.event === "learning-operation-progress") {
          setCorrectionOperationId(event.operationId);
          setCorrectionStage(event.stage === "persisting" ? "validating" : event.stage);
          return;
        }
        settledCorrectionSubmissions.current.add(event.submissionId);
        setCorrectionOperationId(undefined);
        setCorrectionStage("idle");
        if (event.outcome.status === "validated") {
          setPreviousCorrectionOperationId(undefined);
          setCorrection(writingCorrectionCandidateSchema.parse(event.outcome.output));
          setCorrectionOriginal(correctionOriginals.current.get(event.submissionId) ?? "");
          setCorrectionError(undefined);
          setCorrectionOutcome(undefined);
        } else if (event.outcome.status === "failed") {
          setPreviousCorrectionOperationId(event.operationId);
          setCorrectionError(event.outcome.error);
          setCorrectionOutcome(undefined);
        } else if (event.outcome.status === "cancelled") {
          setPreviousCorrectionOperationId(undefined);
          setCorrectionOutcome("cancelled");
        } else {
          setPreviousCorrectionOperationId(event.operationId);
          setCorrectionOutcome("rate-limited");
        }
      }),
    [],
  );

  const generatePrompt = async () => {
    setPromptError(undefined);
    if (!(await requestAiAccess())) return;
    const nextSubmissionId = createDesktopSubmissionId();
    submissionId.current = nextSubmissionId;
    setPromptStage("queued");
    try {
      const result = await invokeDesktop("learning-operation/start", {
        submissionId: nextSubmissionId,
        input: {
          kind: "writing-prompt",
          ...(context.trim() ? { naturalRequest: context.trim() } : {}),
        },
      });
      if (!settledPromptSubmissions.current.has(nextSubmissionId)) {
        setOperationId(result.operationId);
      }
    } catch (cause) {
      setPromptStage("idle");
      setPromptError(normalizeDesktopError(cause).detail);
    }
  };

  const cancelPrompt = async () => {
    if (!operationId) return;
    try {
      await invokeDesktop("learning-operation/cancel", { operationId });
    } catch (cause) {
      setPromptError(normalizeDesktopError(cause).detail);
    }
  };

  const useFreeWriting = () => {
    setPrompt(undefined);
    setContext("");
    setPromptError(undefined);
  };

  const startCorrection = async () => {
    if (!draft.trim() || !(await requestAiAccess())) return;
    const nextSubmissionId = createDesktopSubmissionId();
    correctionSubmissionId.current = nextSubmissionId;
    correctionOriginals.current.set(nextSubmissionId, draft);
    setCorrectionStage("queued");
    setCorrectionError(undefined);
    setCorrectionOutcome(undefined);
    setCorrection(undefined);
    try {
      const result = await invokeDesktop("learning-operation/start", {
        submissionId: nextSubmissionId,
        input: {
          kind: "writing-correction",
          learnerText: draft,
          ...(context.trim() ? { activityGoal: context.trim() } : {}),
          teachingProfile,
          feedbackCoverage: feedback,
        },
      });
      if (!settledCorrectionSubmissions.current.has(nextSubmissionId)) {
        setCorrectionOperationId(result.operationId);
      }
    } catch (cause) {
      setCorrectionStage("idle");
      setCorrectionError(normalizeDesktopError(cause).detail);
    }
  };

  const cancelCorrection = async () => {
    if (!correctionOperationId) return;
    setCorrectionStage("cancelling");
    try {
      await invokeDesktop("learning-operation/cancel", { operationId: correctionOperationId });
    } catch (cause) {
      setCorrectionStage("idle");
      setCorrectionError(normalizeDesktopError(cause).detail);
    }
  };

  const retryCorrection = async () => {
    if (!previousCorrectionOperationId || !(await requestAiAccess())) return;
    const nextSubmissionId = createDesktopSubmissionId();
    correctionSubmissionId.current = nextSubmissionId;
    correctionOriginals.current.set(nextSubmissionId, correctionOriginal);
    setCorrectionStage("queued");
    setCorrectionError(undefined);
    setCorrectionOutcome(undefined);
    try {
      const result = await invokeDesktop("learning-operation/retry", {
        previousOperationId: previousCorrectionOperationId,
        submissionId: nextSubmissionId,
      });
      if (!settledCorrectionSubmissions.current.has(nextSubmissionId)) {
        setCorrectionOperationId(result.operationId);
      }
    } catch (cause) {
      setCorrectionStage("idle");
      setCorrectionError(normalizeDesktopError(cause).detail);
    }
  };

  const updateSelection = (target: HTMLTextAreaElement) => {
    setSelection({ start: target.selectionStart, end: target.selectionEnd });
  };

  return (
    <Page
      description={t("writing.intro")}
      eyebrow={t("writing.eyebrow")}
      title={t("writing.title")}
      width="wide"
    >
      <section className={styles.promptActions} aria-labelledby="writing-prompt-heading">
        <div>
          <h2 id="writing-prompt-heading">{t("writing.promptTitle")}</h2>
          <Muted as="p">{t("writing.promptBody")}</Muted>
        </div>
        <ActionGroup className={styles.promptActionButtons}>
          <Button
            variant="primary"
            isDisabled={promptStage !== "idle"}
            onPress={() => void generatePrompt()}
          >
            <Sparkles aria-hidden="true" />
            {promptStage === "idle"
              ? t("writing.generatePrompt")
              : t(`writing.promptStages.${promptStage}`)}
          </Button>
          {operationId ? (
            <Button onPress={() => void cancelPrompt()}>
              <X aria-hidden="true" /> {t("actions.cancel")}
            </Button>
          ) : null}
          <Button onPress={useFreeWriting}>
            {t("writing.freeWriting")}
          </Button>
        </ActionGroup>
        {promptError ? (
          <Feedback live="assertive" tone="error">
            <p>{t(promptError.messageKey)}</p>
            <DiagnosticCode>
              {promptError.reference.code} · {promptError.reference.correlationId}
            </DiagnosticCode>
          </Feedback>
        ) : null}
        {prompt ? (
          <article className={styles.generatedPrompt} aria-label={t("writing.generatedPrompt")}>
            <p className={styles.eyebrow}>{t(`writing.promptFormats.${prompt.format}`)}</p>
            <h3>{prompt.title}</h3>
            <p>{prompt.situation}</p>
            <p>{prompt.task}</p>
            <Muted as="p">
              {t("writing.suggestedWords", { count: prompt.suggestedWordCount })}
            </Muted>
            {prompt.helpfulVocabulary.length > 0 ? (
              <ul>
                {prompt.helpfulVocabulary.map((item) => (
                  <li key={item.german}>
                    <strong>{item.german}</strong> — {item.explanation}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : null}
      </section>

      <div className={styles.writingLayout}>
        <aside className={styles.writingOptions} aria-label={t("writing.optionsTitle")}>
          <div className={styles.writingOptionsHeading}>
            <FilePenLine aria-hidden="true" />
            <h2>{t("writing.optionsTitle")}</h2>
          </div>
          <FieldGroup>
            <span>{t("writing.profileLabel")}</span>
            <select
              value={teachingProfile}
              onChange={(event) => {
                setTeachingProfile(event.currentTarget.value as TeachingProfileChoice);
              }}
            >
              <option value="profile-default">{t("writing.profileDefault")}</option>
              <option value="conversation-partner">{t("writing.profileConversation")}</option>
              <option value="strict-corrector">{t("writing.profileStrict")}</option>
            </select>
          </FieldGroup>
          <FieldGroup>
            <span>{t("writing.feedbackLabel")}</span>
            <select
              value={feedback}
              onChange={(event) => {
                setFeedback(event.currentTarget.value as FeedbackChoice);
              }}
            >
              <option value="all-meaningful">{t("writing.feedbackAll")}</option>
              <option value="priority-only">{t("writing.feedbackPriority")}</option>
            </select>
          </FieldGroup>
          <Muted as="p">{t("writing.localDraftNotice")}</Muted>
        </aside>

        <div className={styles.writingEditor}>
          <FieldGroup>
            <span>{t("writing.contextLabel")}</span>
            <textarea
              aria-label={t("writing.contextLabel")}
              maxLength={1_000}
              placeholder={t("writing.contextPlaceholder")}
              rows={3}
              value={context}
              onChange={(event) => {
                setContext(event.currentTarget.value);
              }}
            />
            <small>{t("writing.contextHint")}</small>
          </FieldGroup>
          <FieldGroup>
            <span>{t("writing.editorLabel")}</span>
            <textarea
              className={styles.writingTextarea}
              maxLength={10_000}
              placeholder={t("writing.editorPlaceholder")}
              rows={16}
              value={draft}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                updateSelection(event.currentTarget);
              }}
              onClick={(event) => {
                updateSelection(event.currentTarget);
              }}
              onKeyUp={(event) => {
                updateSelection(event.currentTarget);
              }}
              onSelect={(event) => {
                updateSelection(event.currentTarget);
              }}
            />
          </FieldGroup>
          <p className={styles.selectionStatus} role="status">
            <MousePointer2 aria-hidden="true" />
            {selection.end > selection.start
              ? t("writing.selection", { count: selection.end - selection.start })
              : t("writing.noSelection")}
          </p>
          <ActionGroup>
            <Button
              variant="primary"
              isDisabled={!draft.trim() || correctionStage !== "idle" || promptStage !== "idle"}
              onPress={() => void startCorrection()}
            >
              <Sparkles aria-hidden="true" /> {t("writing.correctNow")}
            </Button>
            {correctionOperationId ? (
              <Button onPress={() => void cancelCorrection()}>
                <X aria-hidden="true" /> {t("writing.cancelCorrection")}
              </Button>
            ) : null}
            {(correctionError || correctionOutcome === "rate-limited") &&
            previousCorrectionOperationId ? (
              <Button onPress={() => void retryCorrection()}>
                {t("writing.retryCorrection")}
              </Button>
            ) : null}
          </ActionGroup>
          {correctionStage !== "idle" ? (
            <LoadingState live>{t(`writing.correctionStages.${correctionStage}`)}</LoadingState>
          ) : null}
          {correctionError ? (
            <Feedback live="assertive" tone="error">
              <p>{t(correctionError.messageKey)}</p>
              <DiagnosticCode>
                {correctionError.reference.code} · {correctionError.reference.correlationId}
              </DiagnosticCode>
            </Feedback>
          ) : null}
          {correctionOutcome ? (
            <Feedback live="polite" tone="warning">
              {t(`writing.correctionOutcomes.${correctionOutcome}`)}
            </Feedback>
          ) : null}
        </div>
      </div>
      {correction ? (
        <CorrectionComparison
          correction={correction}
          originalText={correctionOriginal}
          onHelperSelection={(selectedText) => {
            onHelperSelection({
              sessionId: helperSessionId,
              selectedText,
              containingSentence: correction.correctedText,
              activeResultSummary: correction.summary,
            });
          }}
        />
      ) : null}
    </Page>
  );
}
