import type {
  DesktopIpcRequest,
  DesktopIpcResponse,
  OpenDeutschError,
} from "@open-deutsch/contracts";
import { calendarDateSchema, curriculumTopicIdSchema } from "@open-deutsch/contracts";
import { History, RefreshCw, Repeat2, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import { DestructiveDialog, StatusMessage, SurfaceCard } from "./components/Foundation.js";
import {
  createDesktopSubmissionId,
  invokeDesktop,
  normalizeDesktopError,
  subscribeDesktop,
} from "./ipc.js";

type Snapshot = Extract<DesktopIpcResponse, { status: "ok"; channel: "history/read" }>["result"];
type Entry = Snapshot["entries"][number];
type HistoryPayload = Extract<DesktopIpcRequest, { channel: "history/read" }>["payload"];
type Skill = NonNullable<HistoryPayload["skill"]>;
type ActivityType = NonNullable<HistoryPayload["activityType"]>;

const skills: readonly Skill[] = ["writing", "reading", "listening", "speaking"];
const activityTypes: readonly ActivityType[] = [
  "writing",
  "grammar",
  "vocabulary-review",
  "reading",
  "codex-listening",
  "voice-speaking",
  "placement",
  "custom-lesson",
  "plan-generation",
];

export type HistoryPracticeSeed =
  | Readonly<{
      kind: "writing";
      historyEntryId: string;
      draft: string;
      context: string;
    }>
  | Readonly<{ kind: "exercise"; activityId: string }>;

function practiceSeed(entry: Entry): HistoryPracticeSeed {
  if (entry.detail.kind !== "writing-correction") throw new Error("OD_HISTORY_DETAIL_INVALID");
  return {
    kind: "writing",
    historyEntryId: entry.historyEntryId,
    draft: entry.detail.learnerText,
    context: entry.title,
  };
}

function exerciseAnswerText(detail: Extract<Entry["detail"], { kind: "exercise-attempt" }>) {
  const answer = detail.answer;
  if (answer.kind === "multiple-choice") {
    return `#${String(answer.selectedOptionPosition + 1)}`;
  }
  if (answer.kind === "fill-in-the-blank") return answer.valuesByBlankPosition.join(" · ");
  return answer.text;
}

export function HistoryPage({
  onPracticeAgain,
  requestAiAccess,
}: {
  onPracticeAgain: (seed: HistoryPracticeSeed) => void;
  requestAiAccess: () => Promise<boolean>;
}) {
  const { i18n, t } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [skill, setSkill] = useState<Skill | "">("");
  const [activityType, setActivityType] = useState<ActivityType | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [curriculumTopicId, setCurriculumTopicId] = useState("");
  const [mistakeCategory, setMistakeCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();
  const [practiceState, setPracticeState] = useState<
    Readonly<{
      patternKey: string;
      status: "queued" | "running" | "created" | "cancelled" | "failed";
    }>
  >();
  const practiceSubmissionId = useRef<ReturnType<typeof createDesktopSubmissionId> | undefined>(
    undefined,
  );
  const practiceOperationId = useRef<ReturnType<typeof createDesktopSubmissionId> | undefined>(
    undefined,
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setSnapshot(
        await invokeDesktop("history/read", {
          ...(skill ? { skill } : {}),
          ...(activityType ? { activityType } : {}),
          ...(fromDate ? { fromDate: calendarDateSchema.parse(fromDate) } : {}),
          ...(toDate ? { toDate: calendarDateSchema.parse(toDate) } : {}),
          ...(curriculumTopicId.trim()
            ? { curriculumTopicId: curriculumTopicIdSchema.parse(curriculumTopicId.trim()) }
            : {}),
          ...(mistakeCategory.trim() ? { mistakeCategory: mistakeCategory.trim() } : {}),
          maximum: 100,
        }),
      );
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  }, [activityType, curriculumTopicId, fromDate, mistakeCategory, skill, toDate]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event === "state-invalidated" && event.scope === "history") void refresh();
      if (
        event.event === "learning-operation-progress" &&
        event.kind === "exercise-generation" &&
        event.submissionId === practiceSubmissionId.current
      ) {
        setPracticeState((current) =>
          current
            ? { ...current, status: event.stage === "queued" ? "queued" : "running" }
            : current,
        );
      }
      if (
        event.event === "learning-operation-finished" &&
        event.kind === "exercise-generation" &&
        event.submissionId === practiceSubmissionId.current
      ) {
        setPracticeState((current) =>
          current
            ? {
                ...current,
                status:
                  event.outcome.status === "validated"
                    ? "created"
                    : event.outcome.status === "cancelled"
                      ? "cancelled"
                      : "failed",
              }
            : current,
        );
        practiceOperationId.current = undefined;
      }
    });
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [refresh]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language],
  );

  const deleteEntry = async (entry: Entry) => {
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("history/delete", { historyEntryId: entry.historyEntryId });
      setSnapshot((current) =>
        current
          ? {
              ...current,
              entries: current.entries.filter(
                ({ historyEntryId }) => historyEntryId !== entry.historyEntryId,
              ),
            }
          : current,
      );
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const createTargetedPractice = async (pattern: Snapshot["mistakePatterns"][number]) => {
    if (!(await requestAiAccess())) return;
    const patternKey = `${pattern.category.kind}:${pattern.category.categoryKey}`;
    const submissionId = createDesktopSubmissionId();
    practiceSubmissionId.current = submissionId;
    setPracticeState({ patternKey, status: "queued" });
    setError(undefined);
    try {
      const result = await invokeDesktop("learning-operation/start", {
        submissionId,
        input: {
          kind: "exercise-generation",
          request: { source: "mistake-pattern", category: pattern.category },
        },
      });
      practiceOperationId.current = result.operationId;
    } catch (cause) {
      setPracticeState({ patternKey, status: "failed" });
      setError(normalizeDesktopError(cause).detail);
    }
  };

  const createVoiceFollowUp = async (entry: Entry) => {
    if (entry.detail.kind !== "voice-summary") return;
    const nextStep = entry.detail.nextSteps[0];
    if (!nextStep) return;
    if (!(await requestAiAccess())) return;
    const patternKey = `voice:${entry.historyEntryId}`;
    const submissionId = createDesktopSubmissionId();
    practiceSubmissionId.current = submissionId;
    setPracticeState({ patternKey, status: "queued" });
    setError(undefined);
    try {
      const result = await invokeDesktop("learning-operation/start", {
        submissionId,
        input: {
          kind: "exercise-generation",
          request: {
            source: "natural-request",
            naturalRequest: nextStep.naturalRequest,
          },
        },
      });
      practiceOperationId.current = result.operationId;
    } catch (cause) {
      setPracticeState({ patternKey, status: "failed" });
      setError(normalizeDesktopError(cause).detail);
    }
  };

  const cancelTargetedPractice = async () => {
    const operationId = practiceOperationId.current;
    if (!operationId) return;
    try {
      await invokeDesktop("learning-operation/cancel", { operationId });
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    }
  };

  return (
    <section className={styles.page} aria-busy={busy}>
      <div className={styles.dashboardHeading}>
        <div>
          <p className={styles.eyebrow}>{t("history.eyebrow")}</p>
          <h1>{t("history.title")}</h1>
          <p className={styles.lead}>{t("history.intro")}</p>
        </div>
        <Button className={styles.secondary} isDisabled={busy} onPress={() => void refresh()}>
          <RefreshCw aria-hidden="true" />
          {busy ? t("history.refreshing") : t("history.refresh")}
        </Button>
      </div>

      <form
        className={styles.historyFilters}
        onSubmit={(event) => {
          event.preventDefault();
          void refresh();
        }}
      >
        <label className={styles.controlLabel}>
          {t("history.filters.skill")}
          <select
            value={skill}
            onChange={(event) => {
              setSkill(event.target.value as Skill | "");
            }}
          >
            <option value="">{t("history.filters.all")}</option>
            {skills.map((value) => (
              <option key={value} value={value}>
                {t(`history.skills.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.controlLabel}>
          {t("history.filters.activityType")}
          <select
            value={activityType}
            onChange={(event) => {
              setActivityType(event.target.value as ActivityType | "");
            }}
          >
            <option value="">{t("history.filters.all")}</option>
            {activityTypes.map((value) => (
              <option key={value} value={value}>
                {t(`history.activityTypes.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.controlLabel}>
          {t("history.filters.from")}
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
            }}
          />
        </label>
        <label className={styles.controlLabel}>
          {t("history.filters.to")}
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
            }}
          />
        </label>
        <label className={styles.controlLabel}>
          {t("history.filters.topic")}
          <input
            maxLength={96}
            value={curriculumTopicId}
            onChange={(event) => {
              setCurriculumTopicId(event.target.value);
            }}
          />
        </label>
        <label className={styles.controlLabel}>
          {t("history.filters.mistake")}
          <input
            maxLength={120}
            value={mistakeCategory}
            onChange={(event) => {
              setMistakeCategory(event.target.value);
            }}
          />
        </label>
        <Button className={styles.primary} isDisabled={busy} type="submit">
          {t("history.filters.apply")}
        </Button>
      </form>

      {error && (
        <StatusMessage tone="error">
          <span>{t(error.messageKey)}</span>
          <code className={styles.diagnostic}>
            {error.reference.code} · {error.reference.correlationId}
          </code>
        </StatusMessage>
      )}

      {snapshot && snapshot.mistakePatterns.length > 0 ? (
        <section aria-labelledby="mistake-patterns-heading">
          <h2 id="mistake-patterns-heading">{t("history.patterns.title")}</h2>
          <p className={styles.muted}>{t("history.patterns.intro")}</p>
          <div className={styles.historyMistakeGrid}>
            {snapshot.mistakePatterns.map((pattern) => {
              const categoryLabel =
                pattern.category.kind === "vocabulary"
                  ? `${pattern.category.lemma} · ${pattern.category.categoryKey}`
                  : pattern.category.categoryKey;
              return (
                <SurfaceCard key={`${pattern.category.kind}:${pattern.category.categoryKey}`}>
                  <p className={styles.eyebrow}>
                    {t(`history.patterns.category.${pattern.category.kind}`)}
                  </p>
                  <h3>{categoryLabel}</h3>
                  <StatusMessage tone={pattern.status === "recurring" ? "warning" : "neutral"}>
                    {pattern.status === "recurring"
                      ? t("history.patterns.recurring", { count: pattern.occurrenceCount })
                      : t("history.patterns.single")}
                  </StatusMessage>
                  <p className={styles.muted}>
                    {t(`history.patterns.source.${pattern.classificationSource}`)}
                  </p>
                  {pattern.targetedPractice.status === "created" ||
                  (practiceState?.patternKey ===
                    `${pattern.category.kind}:${pattern.category.categoryKey}` &&
                    practiceState.status === "created") ? (
                    <StatusMessage tone="success">
                      {t("history.patterns.practice.created")}
                    </StatusMessage>
                  ) : practiceState?.patternKey ===
                      `${pattern.category.kind}:${pattern.category.categoryKey}` &&
                    (practiceState.status === "queued" || practiceState.status === "running") ? (
                    <div className={styles.buttonRow}>
                      <StatusMessage>
                        {t(`history.patterns.practice.${practiceState.status}`)}
                      </StatusMessage>
                      <Button
                        className={styles.secondary}
                        onPress={() => void cancelTargetedPractice()}
                      >
                        <Square aria-hidden="true" /> {t("history.patterns.practice.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.buttonRow}>
                      <Button
                        className={styles.secondary}
                        onPress={() => void createTargetedPractice(pattern)}
                      >
                        <Sparkles aria-hidden="true" /> {t("history.patterns.practice.create")}
                      </Button>
                      {practiceState?.patternKey ===
                        `${pattern.category.kind}:${pattern.category.categoryKey}` &&
                      (practiceState.status === "cancelled" ||
                        practiceState.status === "failed") ? (
                        <span className={styles.muted}>
                          {t(`history.patterns.practice.${practiceState.status}`)}
                        </span>
                      ) : null}
                    </div>
                  )}
                  <ol className={styles.historyEvidenceList}>
                    {pattern.occurrences.map((occurrence, position) => (
                      <li
                        key={`${occurrence.mistakeId}:${occurrence.observedOn}:${String(position)}`}
                      >
                        <time dateTime={occurrence.observedOn}>{occurrence.observedOn}</time>
                        <blockquote>
                          {occurrence.evidence.beforeContext}
                          <mark>{occurrence.evidence.evidenceText}</mark>
                          {occurrence.evidence.afterContext}
                        </blockquote>
                        <p>{occurrence.explanation}</p>
                        {occurrence.classificationSource === "learner-amended" ? (
                          <span className={styles.muted}>
                            {t("history.patterns.amendedEvidence")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </SurfaceCard>
              );
            })}
          </div>
        </section>
      ) : null}

      {snapshot && snapshot.entries.length === 0 ? (
        <StatusMessage>
          <History aria-hidden="true" /> {t("history.empty")}
        </StatusMessage>
      ) : null}

      <div className={styles.historyList}>
        {snapshot?.entries.map((entry) => (
          <SurfaceCard key={entry.historyEntryId}>
            <header className={styles.historyEntryHeader}>
              <div>
                <p className={styles.eyebrow}>
                  {t(`history.skills.${entry.skill}`)} ·{" "}
                  {t(`history.activityTypes.${entry.activityType}`)}
                </p>
                <h2>{entry.title}</h2>
              </div>
              <time dateTime={entry.occurredAt}>
                {dateFormatter.format(new Date(entry.occurredAt))}
              </time>
            </header>
            {entry.curriculumTopicIds.length > 0 && (
              <p className={styles.muted}>
                {t("history.topics")}: {entry.curriculumTopicIds.join(", ")}
              </p>
            )}
            {entry.mistakeCategories.length > 0 && (
              <p className={styles.muted}>
                {t("history.mistakes")}: {entry.mistakeCategories.join(", ")}
              </p>
            )}
            {entry.detail.kind === "writing-correction" ? (
              <div className={styles.historyDetail}>
                <div className={styles.correctionGrid}>
                  <section className={styles.correctionPane}>
                    <h3>{t("history.learnerOriginal")}</h3>
                    <p className={styles.correctionText}>{entry.detail.learnerText}</p>
                  </section>
                  <section className={styles.correctionPane}>
                    <h3>{t("history.modelCorrection")}</h3>
                    <p className={styles.correctionText}>{entry.detail.correctedText}</p>
                  </section>
                </div>
                <section>
                  <h3>{t("history.feedback")}</h3>
                  <p>{entry.detail.feedback.summary}</p>
                  <h4>{t("history.strengths")}</h4>
                  <ul className={styles.compactList}>
                    {entry.detail.feedback.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <h4>{t("history.improvements")}</h4>
                  <ul className={styles.compactList}>
                    {entry.detail.feedback.improvements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                {entry.detail.vocabularyCandidates.length > 0 && (
                  <section>
                    <h3>{t("history.vocabularyCandidates")}</h3>
                    <ul className={styles.compactList}>
                      {entry.detail.vocabularyCandidates.map((candidate) => (
                        <li key={`${candidate.lemma}:${candidate.meaning}`}>
                          <strong>{candidate.lemma}</strong> — {candidate.meaning}.{" "}
                          {candidate.rationale}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <p className={styles.muted}>
                  {entry.detail.provenance.availability === "reported"
                    ? t("history.modelProvenance", {
                        model: entry.detail.provenance.modelId,
                        effort: entry.detail.provenance.effortId,
                      })
                    : t("history.modelNotReported")}
                </p>
                <div className={styles.buttonRow}>
                  <Button
                    className={styles.secondary}
                    onPress={() => {
                      onPracticeAgain(practiceSeed(entry));
                    }}
                  >
                    <Repeat2 aria-hidden="true" /> {t("history.practiceAgain")}
                  </Button>
                  <DestructiveDialog
                    body={t("history.deleteBody")}
                    cancel={t("actions.cancel")}
                    confirm={t("actions.delete")}
                    onConfirm={() => void deleteEntry(entry)}
                    title={t("history.deleteTitle")}
                    trigger={t("history.delete")}
                  />
                </div>
              </div>
            ) : entry.detail.kind === "reading" ? (
              <div className={styles.historyDetail} data-testid="reading-detail">
                <section>
                  <h3>{t("history.readingMaterial")}</h3>
                  <p>{entry.detail.passage}</p>
                  <p className={styles.muted}>
                    {t("history.readingSource", {
                      source: entry.detail.source.label,
                      kind: entry.detail.source.kind,
                    })}
                  </p>
                </section>
                <section>
                  <h3>{t("history.readingEvidence")}</h3>
                  <ul className={styles.compactList}>
                    {entry.detail.exerciseResults.map((exercise) => (
                      <li key={exercise.kind}>
                        <strong>{exercise.kind}</strong>: {exercise.evidence}
                      </li>
                    ))}
                  </ul>
                  {entry.detail.difficultWords.length > 0 && (
                    <p>
                      {t("history.readingWords", { words: entry.detail.difficultWords.join(", ") })}
                    </p>
                  )}
                </section>
                <StatusMessage>{t("history.readingUntrusted")}</StatusMessage>
                <DestructiveDialog
                  body={t("history.deleteBody")}
                  cancel={t("actions.cancel")}
                  confirm={t("actions.delete")}
                  onConfirm={() => void deleteEntry(entry)}
                  title={t("history.deleteTitle")}
                  trigger={t("history.delete")}
                />
              </div>
            ) : entry.detail.kind === "listening" ? (
              <div className={styles.historyDetail} data-testid="listening-detail">
                <section>
                  <h3>{t("history.listeningSummary")}</h3>
                  <ul className={styles.compactList}>
                    {entry.detail.exerciseResults.map((exercise) => (
                      <li key={exercise.kind}>
                        <strong>{exercise.kind}</strong>: {exercise.outcome} — {exercise.evidence}
                      </li>
                    ))}
                  </ul>
                  {entry.detail.difficultVocabulary.length > 0 && (
                    <p>
                      {t("history.listeningWords", {
                        words: entry.detail.difficultVocabulary.join(", "),
                      })}
                    </p>
                  )}
                </section>
                <section>
                  <h3>{t("history.listeningNextSteps")}</h3>
                  <ul className={styles.compactList}>
                    {entry.detail.nextSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </section>
                <StatusMessage>{t("history.listeningNoAudio")}</StatusMessage>
                <DestructiveDialog
                  body={t("history.deleteBody")}
                  cancel={t("actions.cancel")}
                  confirm={t("actions.delete")}
                  onConfirm={() => void deleteEntry(entry)}
                  title={t("history.deleteTitle")}
                  trigger={t("history.delete")}
                />
              </div>
            ) : entry.detail.kind === "placement" ? (
              <div className={styles.historyDetail} data-testid="placement-detail">
                <section>
                  <h3>{t("history.placementSummary")}</h3>
                  <p>
                    {t("history.placementLevel", {
                      level: entry.detail.estimatedLevel.toUpperCase(),
                    })}
                  </p>
                  <StatusMessage tone="warning">
                    {entry.detail.uncertainty.level === "none"
                      ? t("history.placementUncertaintyNone")
                      : entry.detail.uncertainty.explanation}
                  </StatusMessage>
                </section>
                <section>
                  <h3>{t("history.placementEvidence")}</h3>
                  <ul className={styles.compactList}>
                    {entry.detail.sampleResults.map((sample) => (
                      <li key={sample.kind}>
                        <strong>{sample.topic}</strong>:{" "}
                        {t(`history.placementOutcomes.${sample.outcome}`)} — {sample.evidence}
                      </li>
                    ))}
                  </ul>
                </section>
                <StatusMessage tone="warning">
                  {entry.detail.voiceCalibration.explanation}
                </StatusMessage>
                <DestructiveDialog
                  body={t("history.deleteBody")}
                  cancel={t("actions.cancel")}
                  confirm={t("actions.delete")}
                  onConfirm={() => void deleteEntry(entry)}
                  title={t("history.deleteTitle")}
                  trigger={t("history.delete")}
                />
              </div>
            ) : entry.detail.kind === "voice-summary" ? (
              <div className={styles.historyDetail} data-testid="voice-summary-detail">
                <section>
                  <h3>{t("history.voiceSummary.scenario")}</h3>
                  <p>
                    <strong>{entry.detail.scenario.title}</strong> — {entry.detail.scenario.topic}
                  </p>
                  <p className={styles.muted}>
                    {t("history.voiceSummary.level", {
                      level: entry.detail.scenario.targetLevel.toUpperCase(),
                    })}
                    {" · "}
                    {entry.detail.duration.status === "known"
                      ? t("history.voiceSummary.duration", {
                          minutes: Math.max(
                            1,
                            Math.round(entry.detail.duration.milliseconds / 60_000),
                          ),
                        })
                      : t("history.voiceSummary.durationUnknown")}
                  </p>
                </section>
                <section>
                  <h3>{t("history.feedback")}</h3>
                  <p>{entry.detail.feedback.summary}</p>
                  {entry.detail.feedback.strengths.length > 0 && (
                    <ul className={styles.compactList}>
                      {entry.detail.feedback.strengths.map((item) => (
                        <li key={`strength:${item}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {entry.detail.feedback.priorities.length > 0 && (
                    <ul className={styles.compactList}>
                      {entry.detail.feedback.priorities.map((item) => (
                        <li key={`priority:${item}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                </section>
                {entry.detail.observedIssues.length > 0 && (
                  <section>
                    <h3>{t("history.voiceSummary.issues")}</h3>
                    <ul className={styles.compactList}>
                      {entry.detail.observedIssues.map((issue) => (
                        <li key={`${issue.category}:${issue.observation}`}>
                          <strong>{issue.category}</strong>: {issue.observation} — {issue.feedback}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {entry.detail.vocabulary.length > 0 && (
                  <section>
                    <h3>{t("history.voiceSummary.vocabulary")}</h3>
                    <ul className={styles.compactList}>
                      {entry.detail.vocabulary.map((item) => (
                        <li key={`${item.lemma}:${item.meaning}`}>
                          <strong>{item.lemma}</strong> — {item.meaning}. {item.contextSummary}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section>
                  <h3>{t("history.voiceSummary.nextSteps")}</h3>
                  <ul className={styles.compactList}>
                    {entry.detail.nextSteps.map((step) => (
                      <li key={`${step.title}:${step.naturalRequest}`}>
                        <strong>{step.title}</strong> — {step.rationale}
                      </li>
                    ))}
                  </ul>
                  <div className={styles.buttonRow}>
                    {practiceState?.patternKey === `voice:${entry.historyEntryId}` &&
                    practiceState.status === "created" ? (
                      <StatusMessage tone="success">
                        {t("history.voiceSummary.practiceCreated")}
                      </StatusMessage>
                    ) : practiceState?.patternKey === `voice:${entry.historyEntryId}` &&
                      (practiceState.status === "queued" || practiceState.status === "running") ? (
                      <StatusMessage>
                        {practiceState.status === "queued"
                          ? t("history.voiceSummary.practiceQueued")
                          : t("history.voiceSummary.practiceRunning")}
                      </StatusMessage>
                    ) : (
                      <Button
                        className={styles.secondary}
                        onPress={() => void createVoiceFollowUp(entry)}
                      >
                        <Sparkles aria-hidden="true" /> {t("history.voiceSummary.practice")}
                      </Button>
                    )}
                  </div>
                </section>
                <p className={styles.muted}>{t("history.voiceSummary.noAudio")}</p>
                <DestructiveDialog
                  body={t("history.deleteBody")}
                  cancel={t("actions.cancel")}
                  confirm={t("actions.delete")}
                  onConfirm={() => void deleteEntry(entry)}
                  title={t("history.deleteTitle")}
                  trigger={t("history.delete")}
                />
              </div>
            ) : entry.detail.kind === "exercise-attempt" ? (
              <div className={styles.historyDetail}>
                <section>
                  <h3>{t("history.exercisePrompt")}</h3>
                  <p>{entry.detail.instructions}</p>
                  <blockquote>{entry.detail.prompt}</blockquote>
                </section>
                <section>
                  <h3>{t("history.exerciseAnswer")}</h3>
                  <p className={styles.correctionText}>{exerciseAnswerText(entry.detail)}</p>
                </section>
                <section>
                  <h3>{t("history.feedback")}</h3>
                  <p>{entry.detail.feedback.summary}</p>
                  <ul className={styles.compactList}>
                    {entry.detail.objectiveEvaluations.map((evaluation, position) => (
                      <li key={`${evaluation.outcome}:${String(position)}`}>
                        <strong>{t(`history.objectiveOutcomes.${evaluation.outcome}`)}</strong>{" "}
                        {evaluation.evidence}
                      </li>
                    ))}
                  </ul>
                </section>
                {(entry.detail.suggestedAnswer || entry.detail.acceptedAnswerReveal.length > 0) && (
                  <section>
                    <h3>{t("history.acceptedEvidence")}</h3>
                    <p>
                      {entry.detail.suggestedAnswer ??
                        entry.detail.acceptedAnswerReveal.join(" / ")}
                    </p>
                  </section>
                )}
                <div className={styles.buttonRow}>
                  <Button
                    className={styles.secondary}
                    onPress={() => {
                      if (entry.detail.kind === "exercise-attempt") {
                        onPracticeAgain({ kind: "exercise", activityId: entry.detail.activityId });
                      }
                    }}
                  >
                    <Repeat2 aria-hidden="true" /> {t("history.practiceAgain")}
                  </Button>
                  <DestructiveDialog
                    body={t("history.deleteBody")}
                    cancel={t("actions.cancel")}
                    confirm={t("actions.delete")}
                    onConfirm={() => void deleteEntry(entry)}
                    title={t("history.deleteTitle")}
                    trigger={t("history.delete")}
                  />
                </div>
              </div>
            ) : (
              <p className={styles.muted}>{t("history.referenceOnly")}</p>
            )}
          </SurfaceCard>
        ))}
      </div>
    </section>
  );
}
