import type { ReactNode } from "react";
import { Component, useCallback, useEffect, useMemo, useState } from "react";
import {
  exerciseFeedbackCandidateSchema,
  learningOperationInputSchema,
  placementResultSchema,
  readingResultSchema,
  voiceActivityContextSchema,
  type DesktopIpcResponse,
  type OpenDeutschError,
} from "@open-deutsch/contracts";
import { materializeGeneratedExerciseSet } from "@open-deutsch/domain";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  CircleHelp,
  FilePenLine,
  Gauge,
  History,
  Languages,
  LayoutDashboard,
  LibraryBig,
  LoaderCircle,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { useTranslation } from "react-i18next";

import styles from "./App.module.css";
import {
  AppButton,
  DestructiveDialog,
  Disclosure,
  FormField,
  InlineDiff,
  ItemList,
  LoadingState,
  SideBySideDiff,
  StatusMessage,
  SurfaceCard,
} from "./components/Foundation.js";
import i18n from "./i18n.js";
import { Dashboard } from "./Dashboard.js";
import { ExerciseEngine } from "./ExerciseEngine.js";
import { ContextualHelper, type ContextualHelperSelection } from "./ContextualHelper.js";
import { HistoryPage, type HistoryPracticeSeed } from "./HistoryPage.js";
import {
  createDesktopSubmissionId,
  invokeDesktop,
  normalizeDesktopError,
  subscribeDesktop,
} from "./ipc.js";
import { ProfileOnboarding } from "./ProfileOnboarding.js";
import { ProgressPage } from "./ProgressPage.js";
import { SettingsPage } from "./SettingsPage.js";
import { VocabularyPage } from "./VocabularyPage.js";
import { WeeklyPlanPage } from "./WeeklyPlanPage.js";
import { WritingWorkspace } from "./WritingWorkspace.js";

type Readiness = Extract<DesktopIpcResponse, { status: "ok"; channel: "app/readiness" }>["result"];
type Selection = Extract<
  Extract<DesktopIpcResponse, { status: "ok"; channel: "data-root/choose" }>["result"],
  { status: "selected" }
>;
type PreparedActivityId = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "dashboard/read" }
>["result"]["preparedActivities"][number]["activityId"];
type Page =
  | "dashboard"
  | "practice"
  | "writing"
  | "vocabulary"
  | "history"
  | "progress"
  | "weeklyPlan"
  | "settings";

const navigation: ReadonlyArray<{
  page: Page;
  icon: typeof LayoutDashboard;
}> = [
  { page: "dashboard", icon: LayoutDashboard },
  { page: "practice", icon: Gauge },
  { page: "writing", icon: FilePenLine },
  { page: "vocabulary", icon: LibraryBig },
  { page: "history", icon: History },
  { page: "progress", icon: Sparkles },
  { page: "weeklyPlan", icon: CalendarDays },
  { page: "settings", icon: Settings },
];

const warningKeys = {
  "git-worktree": "folder.warningGit",
  "broad-permissions": "folder.warningBroad",
  "install-directory": "folder.warningInstall",
  "integration-restart-required": "folder.warningRestart",
} as const;

function LanguageButton() {
  const { t } = useTranslation();
  return (
    <Button
      className={styles.languageButton}
      onPress={() => void i18n.changeLanguage(i18n.language === "de" ? "en" : "de")}
    >
      <Languages aria-hidden="true" />
      {t("actions.switchLanguage")}
    </Button>
  );
}

function Diagnostic({ error }: { error: OpenDeutschError }) {
  const { t } = useTranslation();
  return (
    <code className={styles.diagnostic} data-testid="diagnostic-reference">
      {t("startup.diagnostic")}: {error.reference.code} · {error.reference.correlationId}
    </code>
  );
}

function OperationError({ error }: { error: OpenDeutschError }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.status} ${styles.error}`} role="alert">
      <AlertCircle aria-hidden="true" />
      <div>
        <p>{t(error.messageKey)}</p>
        <Diagnostic error={error} />
      </div>
    </div>
  );
}

type BoundaryProps = Readonly<{
  children: ReactNode;
  title: string;
  body: string;
  close: string;
}>;
type BoundaryState = Readonly<{ failed: boolean }>;

class ViewBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className={`${styles.status} ${styles.error}`} role="alert">
        <AlertCircle aria-hidden="true" />
        <div>
          <strong>{this.props.title}</strong>
          <p>{this.props.body}</p>
          <Button
            className={styles.secondary}
            onPress={() => {
              this.setState({ failed: false });
            }}
          >
            {this.props.close}
          </Button>
        </div>
      </section>
    );
  }
}

function StartupFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.app}>
      <div className={styles.topActions}>
        <LanguageButton />
      </div>
      <main className={styles.startup}>{children}</main>
    </div>
  );
}

function FolderOnboarding({ onReady }: { onReady: () => Promise<void> }) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<Selection>();
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();

  const choose = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await invokeDesktop("data-root/choose", {});
      if (result.status === "cancelled") {
        setNotice(t("folder.cancelled"));
        setSelection(undefined);
      } else {
        setNotice(undefined);
        setSelection(result);
      }
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!selection || !confirmed) return;
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("data-root/confirm", { selectionId: selection.selectionId });
      await onReady();
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StartupFrame>
      <section className={styles.startupCard} aria-labelledby="folder-title">
        <p className={styles.eyebrow}>{t("app.name")}</p>
        <h1 id="folder-title">{t("startup.firstTitle")}</h1>
        <p className={styles.muted}>{t("startup.firstBody")}</p>
        {!selection ? (
          <>
            {notice && <p role="status">{notice}</p>}
            {error && <OperationError error={error} />}
            <div className={styles.buttonRow}>
              <Button className={styles.primary} isDisabled={busy} onPress={() => void choose()}>
                <ShieldCheck aria-hidden="true" />
                {t("actions.choose")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>
              <strong>{t("folder.selected")}:</strong> {selection.displayName}
            </p>
            {selection.warnings.length > 0 && (
              <ul className={styles.warningList}>
                {selection.warnings.map((warning) => (
                  <li key={warning}>{t(warningKeys[warning])}</li>
                ))}
              </ul>
            )}
            <div className={styles.privacyGrid}>
              <article className={styles.card}>
                <ShieldCheck aria-hidden="true" />
                <h2>{t("folder.privacyTitle")}</h2>
                <p>{t("folder.privacyBody")}</p>
              </article>
              <article className={styles.card}>
                <Sparkles aria-hidden="true" />
                <h2>{t("folder.cloudTitle")}</h2>
                <p>{t("folder.cloudBody")}</p>
              </article>
            </div>
            <label className={styles.checkboxRow}>
              <input
                checked={confirmed}
                onChange={(event) => {
                  setConfirmed(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              <span>{t("folder.confirmCheck")}</span>
            </label>
            {error && <OperationError error={error} />}
            <div className={styles.buttonRow}>
              <Button
                className={styles.primary}
                isDisabled={!confirmed || busy}
                onPress={() => void confirm()}
              >
                {t("actions.confirm")}
              </Button>
              <Button
                className={styles.secondary}
                isDisabled={busy}
                onPress={() => {
                  setSelection(undefined);
                  setConfirmed(false);
                }}
              >
                {t("actions.cancel")}
              </Button>
            </div>
          </>
        )}
      </section>
    </StartupFrame>
  );
}

function StartupError(props: {
  readiness: Readiness;
  retry: () => Promise<void>;
  recover: () => void;
}) {
  const { t } = useTranslation();
  const { readiness } = props;
  if (readiness.dataRoot.status !== "unavailable") return null;
  const copy = {
    "schema-newer": ["startup.schemaTitle", "startup.schemaBody"],
    "database-busy": ["startup.lockedTitle", "startup.lockedBody"],
    stale: ["startup.staleTitle", "startup.staleBody"],
    missing: ["startup.missingTitle", "startup.missingBody"],
    invalid: ["startup.unavailableTitle", "startup.unavailableBody"],
    "database-failed": ["startup.unavailableTitle", "startup.unavailableBody"],
  } as const;
  const [title, body] = copy[readiness.dataRoot.reason];
  return (
    <StartupFrame>
      <section className={styles.startupCard} aria-labelledby="startup-error-title">
        <TriangleAlert aria-hidden="true" />
        <h1 id="startup-error-title">{t(title)}</h1>
        <p>{t(body)}</p>
        <p className={styles.muted}>{t("startup.noBlank")}</p>
        <Diagnostic error={readiness.dataRoot.error} />
        <div className={styles.buttonRow}>
          <Button className={styles.primary} onPress={() => void props.retry()}>
            {t("actions.retry")}
          </Button>
          <Button className={styles.secondary} onPress={props.recover}>
            {t("actions.chooseAnother")}
          </Button>
        </div>
      </section>
    </StartupFrame>
  );
}

function CodexBanner({ readiness }: { readiness: Readiness }) {
  const { t } = useTranslation();
  if (readiness.codex.status === "available") return null;
  const message =
    readiness.codex.reason === "missing"
      ? "codex.missing"
      : readiness.codex.reason === "unsupported-version"
        ? "codex.unsupported"
        : "codex.unavailable";
  return (
    <div className={styles.banner} role="status">
      <TriangleAlert aria-hidden="true" />
      <div>
        {t(message)}
        <Diagnostic error={readiness.codex.error} />
      </div>
    </div>
  );
}

function PlacementDiagnostic() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();
  const [writingAnswer, setWritingAnswer] = useState("");
  const [answers, setAnswers] = useState({ grammar: "", vocabulary: "", reading: "" });
  const [completed, setCompleted] = useState<ReturnType<typeof placementResultSchema.parse>>();

  const complete = async () => {
    const writingCorrect = writingAnswer.trim().length >= 12;
    const correct = [
      answers.grammar === "zum",
      answers.vocabulary === "appointment",
      answers.reading === "10",
      writingCorrect,
    ];
    const result = placementResultSchema.parse({
      schemaVersion: 1,
      completedOn: new Date().toISOString().slice(0, 10),
      estimatedLevel: correct.filter(Boolean).length >= 3 ? "a2" : "a1",
      uncertainty: {
        level: "some",
        explanation: "Four short local samples provide orientation, not a certified assessment.",
      },
      sampleResults: [
        {
          kind: "grammar",
          topic: "Dative after zu",
          outcome: answers.grammar === "zum" ? "demonstrated" : "developing",
          evidence: "A short article-selection sample was completed.",
          uncertainty: { level: "some", explanation: "One item cannot establish a grammar level." },
        },
        {
          kind: "vocabulary",
          topic: "Appointments",
          outcome: answers.vocabulary === "appointment" ? "demonstrated" : "developing",
          evidence: "A practical everyday-word meaning sample was completed.",
          uncertainty: {
            level: "some",
            explanation: "One item cannot establish vocabulary breadth.",
          },
        },
        {
          kind: "reading",
          topic: "Finding a time in a notice",
          outcome: answers.reading === "10" ? "demonstrated" : "developing",
          evidence: "A short local notice comprehension sample was completed.",
          uncertainty: {
            level: "some",
            explanation: "One passage cannot establish reading proficiency.",
          },
        },
        {
          kind: "writing",
          topic: "A short appointment message",
          outcome: writingCorrect ? "demonstrated" : "developing",
          evidence: "A short free-writing sample was submitted locally.",
          uncertainty: {
            level: "substantial",
            explanation: "Writing quality is not model-reviewed in this local diagnostic.",
          },
        },
      ],
      voiceCalibration: {
        status: "unavailable",
        code: "OD_HANDOFF_VOICE_SESSION_UNSUPPORTED",
        explanation:
          "Optional listening and speaking calibration remains unavailable until exact Codex Voice handoff is supported.",
      },
    });
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("placement/complete", { result });
      setCompleted(result);
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  if (completed) {
    return (
      <SurfaceCard>
        <h2>{t("practice.diagnosticFlow.completedTitle")}</h2>
        <p>
          {t("practice.diagnosticFlow.completedBody", {
            level: completed.estimatedLevel.toUpperCase(),
          })}
        </p>
        <StatusMessage tone="warning">
          {completed.uncertainty.level === "none"
            ? t("practice.diagnosticFlow.noAdditionalUncertainty")
            : completed.uncertainty.explanation}
        </StatusMessage>
        <ul className={styles.compactList}>
          {completed.sampleResults.map((sample) => (
            <li key={sample.kind}>
              <strong>{sample.topic}</strong>:{" "}
              {t(`practice.diagnosticFlow.outcomes.${sample.outcome}`)} — {sample.evidence}
            </li>
          ))}
        </ul>
        <StatusMessage tone="warning">{completed.voiceCalibration.explanation}</StatusMessage>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard>
      <h2>{t("practice.diagnosticFlow.title")}</h2>
      <p>{t("practice.diagnosticFlow.body")}</p>
      {skipped && <StatusMessage>{t("practice.diagnosticFlow.skipped")}</StatusMessage>}
      {!started && !skipped ? (
        <div className={styles.buttonRow}>
          <Button
            className={styles.primary}
            onPress={() => {
              setStarted(true);
            }}
          >
            {t("practice.diagnosticFlow.start")}
          </Button>
          <Button
            className={styles.secondary}
            onPress={() => {
              setSkipped(true);
            }}
          >
            {t("practice.diagnosticFlow.skip")}
          </Button>
        </div>
      ) : null}
      {started && !skipped ? (
        <div className={styles.historyDetail}>
          <label className={styles.controlLabel}>
            {t("practice.diagnosticFlow.grammar")}
            <select
              aria-label={t("practice.diagnosticFlow.grammar")}
              value={answers.grammar}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, grammar: event.target.value }));
              }}
            >
              <option value="">{t("practice.diagnosticFlow.choose")}</option>
              <option value="zum">zum</option>
              <option value="zu den">zu den</option>
            </select>
          </label>
          <label className={styles.controlLabel}>
            {t("practice.diagnosticFlow.vocabulary")}
            <select
              aria-label={t("practice.diagnosticFlow.vocabulary")}
              value={answers.vocabulary}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, vocabulary: event.target.value }));
              }}
            >
              <option value="">{t("practice.diagnosticFlow.choose")}</option>
              <option value="appointment">appointment</option>
              <option value="neighborhood">neighborhood</option>
            </select>
          </label>
          <section>
            <h3>{t("practice.diagnosticFlow.reading")}</h3>
            <p>{t("practice.diagnosticFlow.readingText")}</p>
            <label className={styles.controlLabel}>
              {t("practice.diagnosticFlow.readingQuestion")}
              <select
                aria-label={t("practice.diagnosticFlow.readingQuestion")}
                value={answers.reading}
                onChange={(event) => {
                  setAnswers((current) => ({ ...current, reading: event.target.value }));
                }}
              >
                <option value="">{t("practice.diagnosticFlow.choose")}</option>
                <option value="10">10:00</option>
                <option value="12">12:00</option>
              </select>
            </label>
          </section>
          <label className={styles.controlLabel}>
            {t("practice.diagnosticFlow.writing")}
            <textarea
              aria-label={t("practice.diagnosticFlow.writing")}
              maxLength={500}
              rows={3}
              value={writingAnswer}
              onChange={(event) => {
                setWritingAnswer(event.target.value);
              }}
            />
          </label>
          {error && <StatusMessage tone="error">{t(error.messageKey)}</StatusMessage>}
          <Button className={styles.primary} isDisabled={busy} onPress={() => void complete()}>
            {busy ? t("practice.diagnosticFlow.saving") : t("practice.diagnosticFlow.finish")}
          </Button>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function ReadingPractice() {
  const { t } = useTranslation();
  const bundledPassage = t("practice.readingFlow.bundledPassage");
  const [started, setStarted] = useState(false);
  const [passage, setPassage] = useState(bundledPassage);
  const [sourceKind, setSourceKind] = useState<"bundled" | "generated" | "imported-local">(
    "bundled",
  );
  const [sourceLabel, setSourceLabel] = useState("Open Deutsch starter notice");
  const [importDraft, setImportDraft] = useState("");
  const [answers, setAnswers] = useState({ comprehension: "", vocabulary: "", inference: "" });
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();

  const useImportedText = () => {
    if (!importDraft.trim()) return;
    setPassage(importDraft.trim());
    setSourceKind("imported-local");
    setSourceLabel("Learner-provided local text");
  };

  const useGeneratedPassage = () => {
    setPassage(t("practice.readingFlow.generatedPassage"));
    setSourceKind("generated");
    setSourceLabel(t("practice.readingFlow.generatedSource"));
    setStarted(true);
  };

  const complete = async () => {
    const result = readingResultSchema.parse({
      schemaVersion: 1,
      title: "A notice about appointments",
      cefrBand: "a2",
      source: {
        kind: sourceKind,
        label: sourceLabel,
        ...(sourceKind === "bundled" ? { retrievedOn: "2026-08-20" } : {}),
      },
      passage,
      exerciseResults: [
        {
          kind: "comprehension",
          outcome: answers.comprehension === "10" ? "demonstrated" : "developing",
          evidence: "A gist question about the appointment time was answered.",
          uncertainty: {
            level: "some",
            explanation: "One question cannot establish reading ability.",
          },
        },
        {
          kind: "summary",
          outcome: summary.trim().length >= 12 ? "demonstrated" : "developing",
          evidence: "A short learner summary was recorded for later review.",
          uncertainty: {
            level: "substantial",
            explanation: "The summary is not model-scored in this local flow.",
          },
        },
        {
          kind: "vocabulary-in-context",
          outcome: answers.vocabulary === "appointment" ? "demonstrated" : "developing",
          evidence: "A word-in-context question was answered.",
          uncertainty: {
            level: "some",
            explanation: "One word cannot establish vocabulary breadth.",
          },
        },
        {
          kind: "inference",
          outcome: answers.inference === "appointment" ? "demonstrated" : "developing",
          evidence: "A simple inference about the notice was recorded.",
          uncertainty: {
            level: "some",
            explanation: "One inference cannot establish reading proficiency.",
          },
        },
      ],
      difficultWords:
        answers.vocabulary === "appointment" ? ["Termin"] : ["Termin", "Sprechstunde"],
      promptInjectionNotice: "OD_UNTRUSTED_READING_TEXT_TREATED_AS_DATA",
    });
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("reading/complete", { result });
      setSaved(true);
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard>
      <h2>{t("practice.readingFlow.title")}</h2>
      <p>{t("practice.readingFlow.body")}</p>
      {saved ? (
        <StatusMessage tone="success">{t("practice.readingFlow.saved")}</StatusMessage>
      ) : !started ? (
        <div className={styles.inlineActions}>
          <Button
            className={styles.secondary}
            onPress={() => {
              setStarted(true);
            }}
          >
            <MessageSquareText aria-hidden="true" /> {t("practice.readingFlow.start")}
          </Button>
          <Button className={styles.secondary} onPress={useGeneratedPassage}>
            <Sparkles aria-hidden="true" /> {t("practice.readingFlow.generate")}
          </Button>
        </div>
      ) : (
        <div className={styles.historyDetail}>
          <section>
            <h3>{t("practice.readingFlow.material")}</h3>
            <p className={styles.muted}>
              {t("practice.readingFlow.source")}: {sourceLabel}
              {sourceKind === "bundled" ? " · 2026-08-20" : ""}
            </p>
            <p>{passage}</p>
            <details>
              <summary>{t("practice.readingFlow.hint")}</summary>
              <p>{t("practice.readingFlow.hintBody")}</p>
            </details>
            <details>
              <summary>{t("practice.readingFlow.translation")}</summary>
              <p>
                {sourceKind === "bundled"
                  ? t("practice.readingFlow.bundledTranslation")
                  : sourceKind === "generated"
                    ? t("practice.readingFlow.generatedTranslation")
                    : t("practice.readingFlow.importedTranslation")}
              </p>
            </details>
          </section>
          <label className={styles.controlLabel}>
            {t("practice.readingFlow.importLabel")}
            <textarea
              aria-label={t("practice.readingFlow.importLabel")}
              maxLength={12_000}
              rows={3}
              value={importDraft}
              onChange={(event) => {
                setImportDraft(event.target.value);
              }}
            />
          </label>
          <Button
            className={styles.secondary}
            onPress={useImportedText}
            isDisabled={!importDraft.trim()}
          >
            {t("practice.readingFlow.useImport")}
          </Button>
          <label className={styles.controlLabel}>
            {t("practice.readingFlow.comprehension")}
            <select
              aria-label={t("practice.readingFlow.comprehension")}
              value={answers.comprehension}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, comprehension: event.target.value }));
              }}
            >
              <option value="">{t("practice.readingFlow.choose")}</option>
              <option value="10">10:00</option>
              <option value="12">12:00</option>
            </select>
          </label>
          <label className={styles.controlLabel}>
            {t("practice.readingFlow.vocabulary")}
            <select
              aria-label={t("practice.readingFlow.vocabulary")}
              value={answers.vocabulary}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, vocabulary: event.target.value }));
              }}
            >
              <option value="">{t("practice.readingFlow.choose")}</option>
              <option value="appointment">appointment</option>
              <option value="consultation">consultation</option>
            </select>
          </label>
          <label className={styles.controlLabel}>
            {t("practice.readingFlow.summary")}
            <textarea
              aria-label={t("practice.readingFlow.summary")}
              maxLength={1_000}
              rows={3}
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
              }}
            />
          </label>
          <label className={styles.controlLabel}>
            {t("practice.readingFlow.inference")}
            <select
              aria-label={t("practice.readingFlow.inference")}
              value={answers.inference}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, inference: event.target.value }));
              }}
            >
              <option value="">{t("practice.readingFlow.choose")}</option>
              <option value="appointment">The person has an appointment.</option>
              <option value="holiday">The person is on holiday.</option>
            </select>
          </label>
          {error && <StatusMessage tone="error">{t(error.messageKey)}</StatusMessage>}
          <Button className={styles.primary} isDisabled={busy} onPress={() => void complete()}>
            {busy ? t("practice.readingFlow.saving") : t("practice.readingFlow.finish")}
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
}

function CodexActivityPreparation({ kind }: { kind: "listening" | "speaking" }) {
  const { t } = useTranslation();
  const base = kind === "listening" ? "practice.listeningFlow" : "practice.speakingFlow";
  const context = useMemo(
    () =>
      voiceActivityContextSchema.parse({
        schemaVersion: 1,
        kind,
        targetLevel: "a2",
        scenario: t(`${base}.scenario`),
        difficulty: "intermediate",
        correctionTiming: "after-each",
        objectives: [t(`${base}.objectiveOne`), t(`${base}.objectiveTwo`)],
        ...(kind === "listening" ? { script: t(`${base}.script`) } : {}),
        questions: [t(`${base}.questionOne`), t(`${base}.questionTwo`)],
        answerGuidance: [t(`${base}.guidanceOne`), t(`${base}.guidanceTwo`)],
        handoff: {
          status: "unavailable",
          code: "OD_HANDOFF_VOICE_SESSION_UNSUPPORTED",
          explanation: t(`${base}.handoffUnavailable`),
        },
      }),
    [base, kind, t],
  );
  const [activityId, setActivityId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();

  const prepare = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await invokeDesktop("codex-activity/prepare", {
        title: t(`${base}.title`),
        context,
      });
      setActivityId(result.activityId);
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={`codex-${kind}-preparation`}>
      <SurfaceCard>
        <h2>{t(`${base}.title`)}</h2>
        <p>{t(`${base}.body`)}</p>
        <p className={styles.muted}>
          {t(`${base}.level`)} · {t(`${base}.difficulty`)} · {t(`${base}.correctionTiming`)}
        </p>
        {context.script && (
          <section>
            <h3>{t(`${base}.scriptLabel`)}</h3>
            <p>{context.script}</p>
          </section>
        )}
        <section>
          <h3>{t(`${base}.objectives`)}</h3>
          <ul className={styles.compactList}>
            {context.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>{t(`${base}.questions`)}</h3>
          <ul className={styles.compactList}>
            {context.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>{t(`${base}.guidance`)}</h3>
          <ul className={styles.compactList}>
            {context.answerGuidance.map((guidance) => (
              <li key={guidance}>{guidance}</li>
            ))}
          </ul>
        </section>
        {error && <StatusMessage tone="error">{t(error.messageKey)}</StatusMessage>}
        {activityId && (
          <StatusMessage tone="warning">
            {context.handoff.explanation} ({activityId})
          </StatusMessage>
        )}
        <Button
          className={styles.secondary}
          isDisabled={busy || Boolean(activityId)}
          onPress={() => void prepare()}
        >
          {busy
            ? t(`${base}.preparing`)
            : activityId
              ? t(`${base}.prepared`)
              : t(`${base}.prepare`)}
        </Button>
      </SurfaceCard>
    </div>
  );
}

function PracticePage({
  activityId,
  requestAiAccess,
  onGenerated,
}: {
  activityId?: PreparedActivityId;
  requestAiAccess: () => Promise<boolean>;
  onGenerated: () => void;
}) {
  const { t } = useTranslation();
  const [generated, setGenerated] =
    useState<
      Extract<DesktopIpcResponse, { status: "ok"; channel: "prepared-activity/read" }>["result"]
    >();
  const [error, setError] = useState<OpenDeutschError>();
  const [startedAttemptIds, setStartedAttemptIds] =
    useState<
      Extract<
        DesktopIpcResponse,
        { status: "ok"; channel: "exercise-set/start" }
      >["result"]["attemptIds"]
    >();
  const [customRequest, setCustomRequest] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  useEffect(() => {
    if (!activityId) return;
    void invokeDesktop("prepared-activity/read", { activityId })
      .then((result) => {
        setGenerated(result);
      })
      .catch((cause: unknown) => {
        setError(normalizeDesktopError(cause).detail);
      });
  }, [activityId]);
  const exercises = useMemo(
    () =>
      generated
        ? materializeGeneratedExerciseSet(generated.output, {
            exerciseIds: generated.output.exercises.map(
              (_, position) => `exercise_${String(position).padStart(16, "0")}`,
            ),
            aiProvenance: {
              source: "ai",
              producer: "desktop-app-server",
              modelRequestId: generated.provenance.modelRequestId,
              generatedAt: generated.provenance.generatedAt,
              modelSelection: {
                availability: "reported",
                modelId: generated.provenance.modelId,
                effortId: generated.provenance.effortId,
              },
            },
            curriculumTopicIds: generated.curriculumTopicIds,
          })
        : [],
    [generated],
  );
  if (activityId) {
    return (
      <section className={styles.page}>
        <h1>{generated?.title ?? t("exercises.loading")}</h1>
        {error && <OperationError error={error} />}
        {generated?.output.lesson && (
          <SurfaceCard>
            <h2>{generated.output.lesson.title}</h2>
            <p>{generated.output.lesson.explanation}</p>
            {generated.output.lesson.sections.map((section) => (
              <section key={section.heading}>
                <h3>{section.heading}</h3>
                <p>{section.content}</p>
              </section>
            ))}
            {generated.output.lesson.vocabularyFoundations.length > 0 && (
              <section>
                <h3>{t("exercises.custom.vocabulary")}</h3>
                <ul className={styles.compactList}>
                  {generated.output.lesson.vocabularyFoundations.map((item) => (
                    <li key={`${item.german}:${item.example}`}>
                      <strong>{item.german}</strong> — {item.explanation}
                      <span className={styles.muted}>{item.example}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </SurfaceCard>
        )}
        {generated?.activeSet && !startedAttemptIds && (
          <SurfaceCard>
            <h2>{t("exercises.interrupted")}</h2>
            <p>{t("exercises.interruptedBody")}</p>
            <Button
              className={styles.secondary}
              onPress={() => {
                void invokeDesktop("exercise-set/abandon", { activityId })
                  .then(() => {
                    setGenerated((current) =>
                      current ? { ...current, activeSet: null } : current,
                    );
                  })
                  .catch((cause: unknown) => {
                    setError(normalizeDesktopError(cause).detail);
                  });
              }}
            >
              {t("exercises.abandonInterrupted")}
            </Button>
          </SurfaceCard>
        )}
        {generated && !generated.activeSet && (
          <ExerciseEngine
            exercises={exercises}
            onStarted={async (feedbackModeOverride) => {
              const started = await invokeDesktop("exercise-set/start", {
                activityId,
                feedbackModeOverride,
              });
              setStartedAttemptIds(started.attemptIds);
            }}
            onAiEvaluationRequested={async (evaluation, exercisePosition) => {
              const attemptId = startedAttemptIds?.[exercisePosition];
              if (!attemptId) throw new Error("OD_EXERCISE_ATTEMPT_SET_INVALID");
              if (
                evaluation.answer.kind !== "free-writing" &&
                evaluation.answer.kind !== "short-answer" &&
                evaluation.answer.kind !== "sentence-correction"
              ) {
                throw new Error("OD_EXERCISE_AI_FEEDBACK_NOT_REQUIRED");
              }
              const submissionId = createDesktopSubmissionId();
              return new Promise((resolve, reject) => {
                const unsubscribe = subscribeDesktop((event) => {
                  if (
                    event.event !== "learning-operation-finished" ||
                    event.kind !== "exercise-feedback" ||
                    event.submissionId !== submissionId
                  ) {
                    return;
                  }
                  unsubscribe();
                  if (event.outcome.status === "validated") {
                    resolve(exerciseFeedbackCandidateSchema.parse(event.outcome.output));
                  } else reject(new Error(`OD_EXERCISE_AI_FEEDBACK_${event.outcome.status}`));
                });
                const input = learningOperationInputSchema.parse({
                  kind: "exercise-feedback",
                  activityId,
                  attemptId,
                  answer: evaluation.answer,
                });
                void invokeDesktop("learning-operation/start", {
                  submissionId,
                  input,
                }).catch((cause: unknown) => {
                  unsubscribe();
                  reject(
                    cause instanceof Error ? cause : new Error("OD_EXERCISE_AI_FEEDBACK_FAILED"),
                  );
                });
              });
            }}
            onAbandoned={async () => {
              await invokeDesktop("exercise-set/abandon", { activityId });
              setStartedAttemptIds(undefined);
            }}
            onCompleted={async (evaluations) => {
              if (!startedAttemptIds || startedAttemptIds.length !== evaluations.length) {
                throw new Error("OD_EXERCISE_ATTEMPT_SET_INVALID");
              }
              await invokeDesktop("exercise-set/complete", {
                activityId,
                answers: evaluations.map((evaluation, position) => {
                  const attemptId = startedAttemptIds[position];
                  if (!attemptId) throw new Error("OD_EXERCISE_ATTEMPT_SET_INVALID");
                  return { attemptId, answer: evaluation.answer };
                }),
              });
            }}
          />
        )}
      </section>
    );
  }
  const generateCustomLesson = async (requestedLesson = customRequest.trim()) => {
    if (!requestedLesson.trim() || !(await requestAiAccess())) return;
    setGenerating(true);
    setGenerationFailed(false);
    const submissionId = createDesktopSubmissionId();
    try {
      await new Promise<void>((resolve, reject) => {
        const unsubscribe = subscribeDesktop((event) => {
          if (
            event.event !== "learning-operation-finished" ||
            event.kind !== "exercise-generation" ||
            event.submissionId !== submissionId
          ) {
            return;
          }
          unsubscribe();
          if (event.outcome.status === "validated") resolve();
          else reject(new Error(`OD_EXERCISE_GENERATION_${event.outcome.status}`));
        });
        void invokeDesktop("learning-operation/start", {
          submissionId,
          input: {
            kind: "exercise-generation",
            request: { source: "natural-request", naturalRequest: requestedLesson.trim() },
          },
        }).catch((cause: unknown) => {
          unsubscribe();
          reject(cause instanceof Error ? cause : new Error("OD_EXERCISE_GENERATION_FAILED"));
        });
      });
      onGenerated();
    } catch {
      setGenerationFailed(true);
    } finally {
      setGenerating(false);
    }
  };
  return (
    <section className={styles.page}>
      <h1>{t("practice.title")}</h1>
      <SurfaceCard>
        <h2>{t("exercises.custom.title")}</h2>
        <p>{t("exercises.custom.body")}</p>
        <label className={styles.controlLabel}>
          {t("exercises.custom.request")}
          <textarea
            maxLength={2_000}
            value={customRequest}
            onChange={(event) => {
              setCustomRequest(event.target.value);
            }}
          />
        </label>
        {generationFailed && (
          <StatusMessage tone="error">{t("exercises.custom.failed")}</StatusMessage>
        )}
        <Button
          className={styles.primary}
          isDisabled={generating || !customRequest.trim()}
          onPress={() => void generateCustomLesson()}
        >
          {generating ? t("exercises.custom.generating") : t("exercises.custom.generate")}
        </Button>
      </SurfaceCard>
      <SurfaceCard>
        <h2>{t("practice.grammarLesson.title")}</h2>
        <p>{t("practice.grammarLesson.body")}</p>
        <p className={styles.muted}>{t("practice.grammarLesson.topic")}</p>
        <Button
          className={styles.secondary}
          onPress={() => void generateCustomLesson(t("practice.grammarLesson.request"))}
        >
          <BookOpen aria-hidden="true" /> {t("practice.grammarLesson.start")}
        </Button>
      </SurfaceCard>
      <ReadingPractice />
      <CodexActivityPreparation kind="listening" />
      <CodexActivityPreparation kind="speaking" />
      <PlacementDiagnostic />
      <ul className={styles.practiceList}>
        <li>
          <BookOpen aria-hidden="true" /> {t("practice.grammar")}
        </li>
        <li>
          <MessageSquareText aria-hidden="true" /> {t("practice.reading")}
        </li>
        <li>
          <Volume2 aria-hidden="true" /> {t("practice.listening")}
        </li>
        <li>
          <UserRound aria-hidden="true" /> {t("practice.speaking")}
        </li>
        <li>
          <Gauge aria-hidden="true" /> {t("practice.diagnostic")}
        </li>
      </ul>
    </section>
  );
}

function FirstAiReminder({ close }: { close: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();
  const acknowledge = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("privacy/ai-disclosure/acknowledge", {});
      close();
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalOverlay
      className={styles.modalOverlay}
      isDismissable
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal className={styles.modal}>
        <Dialog aria-labelledby="ai-reminder-title">
          <Heading id="ai-reminder-title" slot="title">
            {t("aiReminder.title")}
          </Heading>
          <p>{t("aiReminder.body")}</p>
          {error && <OperationError error={error} />}
          <div className={styles.buttonRow}>
            <Button className={styles.primary} isDisabled={busy} onPress={() => void acknowledge()}>
              {t("actions.acknowledge")}
            </Button>
            <Button className={styles.secondary} onPress={close}>
              {t("actions.cancel")}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function AppShell({ readiness, reload }: { readiness: Readiness; reload: () => Promise<void> }) {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>("dashboard");
  const [helperOpen, setHelperOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [accountSignedOut, setAccountSignedOut] = useState(false);
  const [operationError, setOperationError] = useState<OpenDeutschError>();
  const [writingDirty, setWritingDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<Page>();
  const [writingSeed, setWritingSeed] =
    useState<Extract<HistoryPracticeSeed, { kind: "writing" }>>();
  const [helperSelection, setHelperSelection] = useState<ContextualHelperSelection>();
  const [preparedActivityId, setPreparedActivityId] = useState<PreparedActivityId>();

  useEffect(() => {
    void invokeDesktop("codex/account/read", {})
      .then((state) => {
        setAccountSignedOut(state.status === "signed-out");
      })
      .catch((cause: unknown) => {
        setOperationError(normalizeDesktopError(cause).detail);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event === "prepared-activity-open") {
        setPreparedActivityId(event.activityId);
        if (writingDirty) setPendingPage("practice");
        else setPage("practice");
        return;
      }
      if (event.event === "data-root-changed") {
        void reload();
        return;
      }
      if (event.event === "state-invalidated") void reload();
    });
    return unsubscribe;
  }, [reload, writingDirty]);

  const openAi = async () => {
    setOperationError(undefined);
    try {
      const privacy = await invokeDesktop("privacy/ai-disclosure/read", {});
      if (!privacy.acknowledged) {
        setReminderOpen(true);
        return false;
      }
      return true;
    } catch (cause) {
      setOperationError(normalizeDesktopError(cause).detail);
      return false;
    }
  };

  const moveNavFocus = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(
      event.currentTarget.closest("nav")?.querySelectorAll<HTMLButtonElement>("[data-nav]") ?? [],
    );
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    buttons[(current + delta + buttons.length) % buttons.length]?.focus();
  };

  const navigate = (destination: Page) => {
    if (page === "writing" && writingDirty && destination !== "writing") {
      setPendingPage(destination);
      return;
    }
    if (destination === "writing" && page !== "writing") setWritingSeed(undefined);
    if (destination === "practice") setPreparedActivityId(undefined);
    setPage(destination);
  };

  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label={t("nav.label")}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            OD
          </span>
          <span className={styles.brandText}>{t("app.name")}</span>
        </div>
        <ul className={styles.navList}>
          {navigation.map(({ page: destination, icon: Icon }) => (
            <li key={destination}>
              <button
                aria-current={page === destination ? "page" : undefined}
                className={styles.navButton}
                data-nav
                onClick={() => {
                  navigate(destination);
                }}
                onKeyDown={moveNavFocus}
                type="button"
              >
                <Icon aria-hidden="true" />
                {t(`nav.${destination}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className={styles.workspace} id="main-content">
        <div className={styles.workspaceInner}>
          <header className={styles.workspaceHeader}>
            <LanguageButton />
            <Button
              className={`${styles.secondary} ${styles.helperToggle}`}
              onPress={() => {
                setHelperOpen(true);
              }}
            >
              <CircleHelp aria-hidden="true" /> {t("actions.showHelper")}
            </Button>
          </header>
          <CodexBanner readiness={readiness} />
          {operationError && <OperationError error={operationError} />}
          {accountSignedOut && readiness.codex.status === "available" && (
            <div className={styles.banner} role="status">
              <UserRound aria-hidden="true" /> {t("codex.signedOut")}
            </div>
          )}
          {page === "dashboard" ? (
            <Dashboard
              onAi={() => void openAi()}
              onNavigate={navigate}
              onOpenActivity={(activityId) => {
                setPreparedActivityId(activityId);
                setPage("practice");
              }}
            />
          ) : null}
          {page === "practice" ? (
            <PracticePage
              {...(preparedActivityId ? { activityId: preparedActivityId } : {})}
              requestAiAccess={openAi}
              onGenerated={() => {
                setPreparedActivityId(undefined);
                setPage("dashboard");
              }}
            />
          ) : null}
          {page === "writing" ? (
            <WritingWorkspace
              key={writingSeed?.historyEntryId ?? "new-writing"}
              {...(writingSeed
                ? { initialContext: writingSeed.context, initialDraft: writingSeed.draft }
                : {})}
              onDirtyChange={setWritingDirty}
              onHelperSelection={setHelperSelection}
              requestAiAccess={openAi}
            />
          ) : null}
          {page === "history" ? (
            <HistoryPage
              requestAiAccess={openAi}
              onPracticeAgain={(seed) => {
                if (seed.kind === "exercise") {
                  setPreparedActivityId(seed.activityId as PreparedActivityId);
                  setPage("practice");
                } else {
                  setWritingSeed(seed);
                  setWritingDirty(false);
                  setPage("writing");
                }
              }}
            />
          ) : null}
          {page === "progress" ? (
            <ProgressPage
              onOpenHistory={() => {
                setPage("history");
              }}
            />
          ) : null}
          {page === "vocabulary" ? (
            <VocabularyPage
              onNavigate={(destination) => {
                navigate(destination);
              }}
            />
          ) : null}
          {page === "weeklyPlan" ? <WeeklyPlanPage requestAiAccess={openAi} /> : null}
          {page === "settings" ? (
            <SettingsPage readiness={readiness} onDataRootChanged={reload} />
          ) : null}
        </div>
      </main>
      <aside
        className={styles.helper}
        data-hidden={!helperOpen}
        aria-label={t("dashboard.helperTitle")}
      >
        <Button
          className={`${styles.secondary} ${styles.helperToggle}`}
          onPress={() => {
            setHelperOpen(false);
          }}
        >
          <X aria-hidden="true" /> {t("actions.hideHelper")}
        </Button>
        <h2>{t("dashboard.helperTitle")}</h2>
        <p className={styles.muted}>{t("dashboard.helperBody")}</p>
        {helperSelection ? (
          <ContextualHelper
            key={helperSelection.sessionId}
            selection={helperSelection}
            requestAiAccess={openAi}
          />
        ) : (
          <StatusMessage>{t("helper.selectText")}</StatusMessage>
        )}
      </aside>
      {reminderOpen && (
        <FirstAiReminder
          close={() => {
            setReminderOpen(false);
          }}
        />
      )}
      {pendingPage && (
        <ModalOverlay
          className={styles.modalOverlay}
          isDismissable
          isOpen
          onOpenChange={(open) => {
            if (!open) setPendingPage(undefined);
          }}
        >
          <Modal className={styles.modal}>
            <Dialog aria-labelledby="unsaved-writing-title">
              <Heading id="unsaved-writing-title" slot="title">
                {t("writing.unsavedTitle")}
              </Heading>
              <p>{t("writing.unsavedBody")}</p>
              <div className={styles.buttonRow}>
                <Button
                  className={styles.danger}
                  onPress={() => {
                    setWritingDirty(false);
                    setPage(pendingPage);
                    setPendingPage(undefined);
                  }}
                >
                  {t("writing.leave")}
                </Button>
                <Button
                  className={styles.secondary}
                  onPress={() => {
                    setPendingPage(undefined);
                  }}
                >
                  {t("writing.keepEditing")}
                </Button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </div>
  );
}

function ComponentGallery() {
  const { t } = useTranslation();
  return (
    <main className={styles.gallery}>
      <header className={styles.galleryHeader}>
        <div>
          <p className={styles.eyebrow}>{t("app.name")}</p>
          <h1>{t("gallery.title")}</h1>
          <p className={styles.muted}>{t("gallery.intro")}</p>
        </div>
        <LanguageButton />
      </header>
      <section className={styles.gallerySection}>
        <h2>{t("gallery.forms")}</h2>
        <FormField
          defaultValue={t("gallery.fieldValue")}
          hint={t("gallery.fieldHint")}
          key={t("gallery.fieldValue")}
          label={t("gallery.label")}
        />
        <FormField
          error={t("gallery.fieldError")}
          hint={t("gallery.fieldHint")}
          label={t("gallery.errorLabel")}
        />
        <div className={styles.buttonRow}>
          <AppButton variant="primary">{t("actions.continue")}</AppButton>
          <AppButton>{t("actions.cancel")}</AppButton>
          <AppButton isDisabled>{t("actions.continue")}</AppButton>
        </div>
      </section>
      <section className={styles.gallerySection}>
        <h2>{t("gallery.states")}</h2>
        <div className={styles.galleryGrid}>
          <StatusMessage tone="success">{t("gallery.success")}</StatusMessage>
          <StatusMessage tone="warning">
            <TriangleAlert aria-hidden="true" /> {t("gallery.warning")}
          </StatusMessage>
          <StatusMessage tone="error">
            <AlertCircle aria-hidden="true" /> {t("gallery.error")}
          </StatusMessage>
          <LoadingState>{t("gallery.loading")}</LoadingState>
          <StatusMessage tone="success">{t("gallery.toast")}</StatusMessage>
          <StatusMessage>{t("gallery.empty")}</StatusMessage>
        </div>
        <SurfaceCard>
          <h3>{t("gallery.listTitle")}</h3>
          <ItemList items={[t("gallery.listOne"), t("gallery.listTwo")]} />
        </SurfaceCard>
      </section>
      <section className={styles.gallerySection}>
        <h2>{t("gallery.diffs")}</h2>
        <InlineDiff
          corrected={t("gallery.corrected")}
          description={t("gallery.change")}
          original={t("gallery.original")}
        />
        <SideBySideDiff
          corrected={t("gallery.corrected")}
          correctedLabel={t("gallery.correctedLabel")}
          original={t("gallery.original")}
          originalLabel={t("gallery.originalLabel")}
        />
        <Disclosure label={t("gallery.disclosure")}>
          <p>{t("gallery.disclosureBody")}</p>
        </Disclosure>
      </section>
      <section className={styles.gallerySection}>
        <h2>{t("gallery.dialog")}</h2>
        <DestructiveDialog
          body={t("gallery.dangerBody")}
          cancel={t("actions.cancel")}
          confirm={t("actions.delete")}
          title={t("gallery.dangerTitle")}
          trigger={t("actions.delete")}
        />
      </section>
    </main>
  );
}

export default function App() {
  const { t } = useTranslation();
  const [readiness, setReadiness] = useState<Readiness>();
  const [fatal, setFatal] = useState<OpenDeutschError>();
  const [recoveringRoot, setRecoveringRoot] = useState(false);
  const [profileOnboarding, setProfileOnboarding] = useState(false);
  const gallery = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get("gallery") === "1";
    return requested && (import.meta.env.DEV || navigator.webdriver);
  }, []);

  const load = useCallback(async () => {
    setFatal(undefined);
    try {
      const nextReadiness = await invokeDesktop("app/readiness", {});
      setReadiness(nextReadiness);
      if (nextReadiness.dataRoot.status === "ready") {
        const profile = await invokeDesktop("learner-profile/read", {});
        setProfileOnboarding(profile.status === "not-created");
      }
      setRecoveringRoot(false);
    } catch (cause) {
      setFatal(normalizeDesktopError(cause).detail);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      if (!gallery) void load();
    }, 0);
    window.openDeutsch.ready();
    return () => {
      window.clearTimeout(initialLoad);
    };
  }, [gallery, load]);

  if (gallery) return <ComponentGallery />;
  if (fatal) {
    return (
      <StartupFrame>
        <section className={styles.startupCard} role="alert">
          <h1>{t("startup.unavailableTitle")}</h1>
          <p>{t("startup.unavailableBody")}</p>
          <OperationError error={fatal} />
          <Button className={styles.primary} onPress={() => void load()}>
            {t("actions.retry")}
          </Button>
        </section>
      </StartupFrame>
    );
  }
  if (!readiness) {
    return (
      <StartupFrame>
        <section className={styles.startupCard} role="status">
          <LoaderCircle aria-hidden="true" /> {t("startup.loading")}
        </section>
      </StartupFrame>
    );
  }
  if (readiness.dataRoot.status === "unconfigured" || recoveringRoot)
    return (
      <FolderOnboarding
        onReady={async () => {
          await load();
        }}
      />
    );
  if (readiness.dataRoot.status === "unavailable")
    return (
      <StartupError
        readiness={readiness}
        retry={load}
        recover={() => {
          setRecoveringRoot(true);
        }}
      />
    );
  if (profileOnboarding)
    return (
      <ProfileOnboarding
        readiness={readiness}
        onComplete={() => {
          setProfileOnboarding(false);
        }}
      />
    );
  return (
    <ViewBoundary
      title={t("errors.boundaryTitle")}
      body={t("errors.boundaryBody")}
      close={t("actions.close")}
    >
      <AppShell readiness={readiness} reload={load} />
    </ViewBoundary>
  );
}
