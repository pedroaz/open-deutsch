import type { ReactNode } from "react";
import { Component, useCallback, useEffect, useMemo, useState } from "react";
import {
  exerciseFeedbackCandidateSchema,
  learningOperationInputSchema,
  placementResultSchema,
  readingResultSchema,
  type DesktopIpcResponse,
  type OpenDeutschError,
  type VoiceActivityContext,
} from "@open-deutsch/contracts";
import { materializeGeneratedExerciseSet, type ModelWorkload } from "@open-deutsch/domain";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronRight,
  FilePenLine,
  Gauge,
  History,
  Languages,
  LayoutDashboard,
  LibraryBig,
  LoaderCircle,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserRound,
  Volume2,
} from "lucide-react";
import { Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";
import { useTranslation } from "react-i18next";

import openDeutschLogo from "../../assets/open-deutsch.svg";
import styles from "./App.module.css";
import { DestructiveDialog, StatusMessage, SurfaceCard } from "./components/Foundation.js";
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
import { SidebarModelControl } from "./SidebarModelControl.js";
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
type PreparedActivity = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "dashboard/read" }
>["result"]["preparedActivities"][number];
type PracticeKind = "custom" | "grammar" | "reading" | "listening" | "speaking" | "diagnostic";
type PracticeLibraryFilter = "all" | "custom-lesson" | "grammar";
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

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function CodexActivityPreparation({ kind }: { kind: "listening" | "speaking" }) {
  const { t } = useTranslation();
  const base = kind === "listening" ? "practice.listeningFlow" : "practice.speakingFlow";
  const [scenario, setScenario] = useState(t(`${base}.scenario`));
  const [targetLevel, setTargetLevel] = useState<VoiceActivityContext["targetLevel"]>("a2");
  const [difficulty, setDifficulty] = useState<VoiceActivityContext["difficulty"]>("intermediate");
  const [correctionTiming, setCorrectionTiming] =
    useState<VoiceActivityContext["correctionTiming"]>("after-each");
  const [objectives, setObjectives] = useState(
    `${t(`${base}.objectiveOne`)}\n${t(`${base}.objectiveTwo`)}`,
  );
  const [questions, setQuestions] = useState(
    `${t(`${base}.questionOne`)}\n${t(`${base}.questionTwo`)}`,
  );
  const context = useMemo(
    () =>
      ({
        schemaVersion: 1,
        kind,
        targetLevel,
        scenario,
        difficulty,
        correctionTiming,
        objectives: lines(objectives),
        ...(kind === "listening" ? { script: t(`${base}.script`) } : {}),
        questions: lines(questions),
        answerGuidance: [t(`${base}.guidanceOne`), t(`${base}.guidanceTwo`)],
        handoff: {
          status: "unavailable",
          code: "OD_HANDOFF_VOICE_SESSION_UNSUPPORTED",
          explanation: t(`${base}.handoffUnavailable`),
        },
      }) satisfies VoiceActivityContext,
    [base, correctionTiming, difficulty, kind, objectives, questions, scenario, t, targetLevel],
  );
  const [savedActivities, setSavedActivities] = useState<readonly PreparedActivity[]>([]);
  const [selectedActivity, setSelectedActivity] =
    useState<
      Extract<DesktopIpcResponse, { status: "ok"; channel: "voice-activity/read" }>["result"]
    >();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();

  const refreshSaved = useCallback(async () => {
    const result = await invokeDesktop("dashboard/read", {});
    const activityType = kind === "speaking" ? "voice-speaking" : "codex-listening";
    setSavedActivities(
      result.preparedActivities.filter((item) => item.activityType === activityType),
    );
  }, [kind]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshSaved(), 0);
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event === "state-invalidated" && event.scope === "dashboard") {
        void refreshSaved();
      }
    });
    return () => {
      window.clearTimeout(initial);
      unsubscribe();
    };
  }, [refreshSaved]);

  const openActivity = async (activityId: PreparedActivityId) => {
    setBusy(true);
    setError(undefined);
    try {
      setSelectedActivity(await invokeDesktop("voice-activity/read", { activityId }));
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  const prepare = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await invokeDesktop("codex-activity/prepare", {
        title: scenario.trim().slice(0, 160),
        context,
      });
      await refreshSaved();
      await openActivity(result.activityId);
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.voicePreparation} data-testid={`codex-${kind}-preparation`}>
      <SurfaceCard>
        <h2>{t(`${base}.title`)}</h2>
        <p>{t(`${base}.body`)}</p>
        <div className={styles.voiceSetupGrid}>
          <label className={`${styles.controlLabel} ${styles.voiceScenarioField}`}>
            {t(`${base}.scenarioLabel`)}
            <input
              maxLength={240}
              value={scenario}
              onChange={(event) => {
                setScenario(event.target.value);
              }}
            />
          </label>
          <label className={styles.controlLabel}>
            {t(`${base}.levelLabel`)}
            <select
              value={targetLevel}
              onChange={(event) => {
                setTargetLevel(event.target.value as VoiceActivityContext["targetLevel"]);
              }}
            >
              {(["a1", "a2", "b1", "b2"] as const).map((level) => (
                <option key={level} value={level}>
                  {level.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.controlLabel}>
            {t(`${base}.difficultyLabel`)}
            <select
              value={difficulty}
              onChange={(event) => {
                setDifficulty(event.target.value as VoiceActivityContext["difficulty"]);
              }}
            >
              {(["beginner", "intermediate", "advanced"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`${base}.difficultyOptions.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.controlLabel}>
            {t(`${base}.correctionTimingLabel`)}
            <select
              value={correctionTiming}
              onChange={(event) => {
                setCorrectionTiming(event.target.value as VoiceActivityContext["correctionTiming"]);
              }}
            >
              {(["during", "after-each", "end"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`${base}.correctionOptions.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.controlLabel}>
            {t(`${base}.objectives`)}
            <textarea
              maxLength={4_000}
              value={objectives}
              onChange={(event) => {
                setObjectives(event.target.value);
              }}
            />
            <small>{t(`${base}.onePerLine`)}</small>
          </label>
          <label className={styles.controlLabel}>
            {t(`${base}.questions`)}
            <textarea
              maxLength={4_000}
              value={questions}
              onChange={(event) => {
                setQuestions(event.target.value);
              }}
            />
            <small>{t(`${base}.onePerLine`)}</small>
          </label>
        </div>
        {context.script && (
          <section>
            <h3>{t(`${base}.scriptLabel`)}</h3>
            <p>{context.script}</p>
          </section>
        )}
        <section>
          <h3>{t(`${base}.guidance`)}</h3>
          <ul className={styles.compactList}>
            {context.answerGuidance.map((guidance) => (
              <li key={guidance}>{guidance}</li>
            ))}
          </ul>
        </section>
        {error && <StatusMessage tone="error">{t(error.messageKey)}</StatusMessage>}
        {selectedActivity && (
          <section className={styles.voicePreparedPreview}>
            <h3>{selectedActivity.context.scenario}</h3>
            <p className={styles.muted}>
              {selectedActivity.context.targetLevel.toUpperCase()} ·{" "}
              {t(`${base}.difficultyOptions.${selectedActivity.context.difficulty}`)} ·{" "}
              {t(`${base}.correctionOptions.${selectedActivity.context.correctionTiming}`)}
            </p>
            <h4>{t(`${base}.objectives`)}</h4>
            <ul className={styles.compactList}>
              {selectedActivity.context.objectives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h4>{t(`${base}.questions`)}</h4>
            <ul className={styles.compactList}>
              {selectedActivity.context.questions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <StatusMessage tone="success">
              <strong>{t(`${base}.saved`)}</strong>
              <span>{t(`${base}.voiceStart`)}</span>
              <ol className={styles.compactList}>
                <li>{t(`${base}.voiceStepOne`)}</li>
                <li>{t(`${base}.voiceStepTwo`)}</li>
                <li>{t(`${base}.voiceStepThree`)}</li>
              </ol>
            </StatusMessage>
          </section>
        )}
        <Button
          className={styles.primary}
          isDisabled={
            busy ||
            !scenario.trim() ||
            lines(objectives).length === 0 ||
            lines(questions).length === 0
          }
          onPress={() => void prepare()}
        >
          {busy ? t(`${base}.preparing`) : t(`${base}.prepare`)}
        </Button>
      </SurfaceCard>
      <SurfaceCard>
        <h2>{t(`${base}.savedTitle`)}</h2>
        <p>{t(`${base}.savedBody`)}</p>
        {savedActivities.length === 0 ? (
          <p className={styles.muted}>{t(`${base}.savedEmpty`)}</p>
        ) : (
          <div className={styles.generatedActivityList}>
            {savedActivities.map((activity) => (
              <div className={styles.generatedActivity} key={activity.activityId}>
                <Button
                  className={styles.generatedActivityOpen}
                  onPress={() => void openActivity(activity.activityId)}
                >
                  <span className={styles.generatedActivityCopy}>
                    <strong>{activity.title}</strong>
                    <span>{activity.preparedAt.slice(0, 10)}</span>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Button>
                <DestructiveDialog
                  body={t(`${base}.deleteBody`)}
                  cancel={t("actions.cancel")}
                  confirm={t(`${base}.deleteConfirm`)}
                  onConfirm={() => {
                    void invokeDesktop("prepared-activity/delete", {
                      activityId: activity.activityId,
                    })
                      .then(() => {
                        if (selectedActivity?.activityId === activity.activityId)
                          setSelectedActivity(undefined);
                        return refreshSaved();
                      })
                      .catch((cause: unknown) => {
                        setError(normalizeDesktopError(cause).detail);
                      });
                  }}
                  title={t(`${base}.deleteTitle`)}
                  trigger={t(`${base}.deleteAction`)}
                  triggerVariant="secondary"
                />
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}

function PracticePage({
  activityId,
  requestAiAccess,
  onOpenActivity,
  onCloseActivity,
}: {
  activityId?: PreparedActivityId;
  requestAiAccess: () => Promise<boolean>;
  onOpenActivity: (activityId: PreparedActivityId) => void;
  onCloseActivity: () => void;
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
  const [exerciseCount, setExerciseCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedKind, setSelectedKind] = useState<PracticeKind>("custom");
  const [libraryFilter, setLibraryFilter] = useState<PracticeLibraryFilter>("all");
  const [preparedActivities, setPreparedActivities] = useState<readonly PreparedActivity[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<OpenDeutschError>();

  const refreshPreparedActivities = useCallback(async () => {
    setLibraryBusy(true);
    setLibraryError(undefined);
    try {
      const snapshot = await invokeDesktop("dashboard/read", {});
      const generatedActivities = snapshot.preparedActivities.filter(
        (activity) =>
          activity.activityType === "grammar" || activity.activityType === "custom-lesson",
      );
      setPreparedActivities(generatedActivities);
      return generatedActivities;
    } catch (cause) {
      setLibraryError(normalizeDesktopError(cause).detail);
      return [];
    } finally {
      setLibraryBusy(false);
    }
  }, []);

  useEffect(() => {
    if (activityId) return;
    const initial = window.setTimeout(() => void refreshPreparedActivities(), 0);
    const onFocus = () => void refreshPreparedActivities();
    const unsubscribe = subscribeDesktop((event) => {
      if (event.event === "state-invalidated" && event.scope === "dashboard") {
        void refreshPreparedActivities();
      }
    });
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [activityId, refreshPreparedActivities]);

  useEffect(() => {
    if (!activityId) return;
    setGenerated(undefined);
    setError(undefined);
    setStartedAttemptIds(undefined);
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
  const filteredActivities =
    libraryFilter === "all"
      ? preparedActivities
      : preparedActivities.filter(({ activityType }) => activityType === libraryFilter);
  const deletePreparedActivity = async (activityToDelete: PreparedActivity) => {
    setLibraryError(undefined);
    try {
      await invokeDesktop("prepared-activity/delete", {
        activityId: activityToDelete.activityId,
      });
      setPreparedActivities((current) =>
        current.filter(({ activityId: currentId }) => currentId !== activityToDelete.activityId),
      );
    } catch (cause: unknown) {
      setLibraryError(normalizeDesktopError(cause).detail);
    }
  };
  if (activityId) {
    const deleteGeneratedLesson = async () => {
      setDeleting(true);
      setError(undefined);
      try {
        await invokeDesktop("prepared-activity/delete", { activityId });
        onCloseActivity();
      } catch (cause: unknown) {
        setError(normalizeDesktopError(cause).detail);
      } finally {
        setDeleting(false);
      }
    };
    return (
      <section className={`${styles.page} ${styles.practiceSession}`}>
        <header className={styles.practiceSessionHeader}>
          <Button className={styles.backButton} onPress={onCloseActivity}>
            <ArrowLeft aria-hidden="true" /> {t("practice.back")}
          </Button>
          <div className={styles.practiceSessionTitleRow}>
            <div>
              <p className={styles.eyebrow}>{t("practice.session.eyebrow")}</p>
              <h1>{generated?.title ?? t("exercises.loading")}</h1>
              {generated && (
                <div className={styles.practiceSessionMeta}>
                  <span>{t("practice.session.exerciseCount", { count: exercises.length })}</span>
                  {generated.output.lesson && <span>{t("practice.session.lessonIncluded")}</span>}
                </div>
              )}
            </div>
            {generated && generated.deletionStatus !== "retained-data" && (
              <DestructiveDialog
                body={t(
                  generated.deletionStatus === "cascade"
                    ? "exercises.delete.cascadeBody"
                    : "exercises.delete.body",
                )}
                cancel={t("actions.cancel")}
                confirm={t("exercises.delete.confirm")}
                onConfirm={() => void deleteGeneratedLesson()}
                title={t("exercises.delete.title")}
                trigger={deleting ? t("exercises.delete.deleting") : t("practice.session.delete")}
                triggerVariant="secondary"
              />
            )}
          </div>
        </header>
        {error && <OperationError error={error} />}
        {generated?.output.lesson && (
          <details className={styles.practiceLessonDisclosure}>
            <summary>
              <span>
                <BookOpen aria-hidden="true" />
                <span>
                  <strong>{generated.output.lesson.title}</strong>
                  <small>{t("practice.session.lessonHint")}</small>
                </span>
              </span>
            </summary>
            <div className={styles.practiceLessonBody}>
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
            </div>
          </details>
        )}
        {generated && (
          <div className={styles.practiceRunner}>
            <ExerciseEngine
              exercises={exercises}
              restart={Boolean(generated.activeSet)}
              onStarted={async () => {
                if (generated.activeSet) {
                  await invokeDesktop("exercise-set/abandon", { activityId });
                  setGenerated((current) => (current ? { ...current, activeSet: null } : current));
                }
                const started = await invokeDesktop("exercise-set/start", {
                  activityId,
                  feedbackModeOverride: "immediate",
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
          </div>
        )}
      </section>
    );
  }
  const generateCustomLesson = async (requestedLesson = customRequest.trim()) => {
    if (!requestedLesson.trim() || !(await requestAiAccess())) return;
    const knownActivityIds = new Set(preparedActivities.map(({ activityId }) => activityId));
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
            request: {
              source: "natural-request",
              naturalRequest: requestedLesson.trim(),
              exerciseCount,
            },
          },
        }).catch((cause: unknown) => {
          unsubscribe();
          reject(cause instanceof Error ? cause : new Error("OD_EXERCISE_GENERATION_FAILED"));
        });
      });
      setCustomRequest("");
      const refreshedActivities = await refreshPreparedActivities();
      const generatedActivity = refreshedActivities.find(
        ({ activityId: refreshedActivityId }) => !knownActivityIds.has(refreshedActivityId),
      );
      if (generatedActivity) onOpenActivity(generatedActivity.activityId);
    } catch {
      setGenerationFailed(true);
    } finally {
      setGenerating(false);
    }
  };
  const practiceKinds: ReadonlyArray<{
    kind: PracticeKind;
    icon: typeof BookOpen;
  }> = [
    { kind: "custom", icon: Sparkles },
    { kind: "grammar", icon: BookOpen },
    { kind: "reading", icon: MessageSquareText },
    { kind: "listening", icon: Volume2 },
    { kind: "speaking", icon: UserRound },
    { kind: "diagnostic", icon: Gauge },
  ];
  const quizLengthControl = (
    <fieldset className={styles.quizLength}>
      <legend>{t("exercises.custom.countLabel")}</legend>
      <div className={styles.quizLengthOptions}>
        {([3, 6, 10] as const).map((count) => (
          <Button
            aria-pressed={exerciseCount === count}
            className={styles.quizLengthButton}
            data-selected={exerciseCount === count || undefined}
            key={count}
            onPress={() => {
              setExerciseCount(count);
            }}
          >
            {t("exercises.custom.countOption", { count })}
          </Button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <section className={styles.page}>
      <header className={styles.practiceHeader}>
        <p className={styles.eyebrow}>{t("practice.eyebrow")}</p>
        <h1>{t("practice.title")}</h1>
        <p className={styles.lead}>{t("practice.intro")}</p>
      </header>

      <section className={styles.generatedLibrary} aria-busy={libraryBusy}>
        <div className={styles.practiceSectionHeader}>
          <div>
            <h2>{t("practice.library.title")}</h2>
            <p>{t("practice.library.body")}</p>
          </div>
          {preparedActivities.length > 0 && (
            <span className={styles.countBadge}>
              {t("practice.library.count", { count: preparedActivities.length })}
            </span>
          )}
        </div>
        {preparedActivities.length > 0 && (
          <div
            aria-label={t("practice.library.filterLabel")}
            className={styles.libraryFilters}
            role="group"
          >
            {(["all", "custom-lesson", "grammar"] as const).map((filter) => {
              const count =
                filter === "all"
                  ? preparedActivities.length
                  : preparedActivities.filter(({ activityType }) => activityType === filter).length;
              return (
                <Button
                  className={styles.libraryFilterButton}
                  data-selected={libraryFilter === filter || undefined}
                  key={filter}
                  onPress={() => {
                    setLibraryFilter(filter);
                  }}
                >
                  {t(`practice.library.filters.${filter}`)}
                  <span>{count}</span>
                </Button>
              );
            })}
          </div>
        )}
        {libraryError && <OperationError error={libraryError} />}
        {!libraryError && libraryBusy && preparedActivities.length === 0 && (
          <p className={styles.muted}>{t("practice.library.loading")}</p>
        )}
        {!libraryError && preparedActivities.length === 0 && !libraryBusy && (
          <p className={styles.muted}>{t("practice.library.empty")}</p>
        )}
        {filteredActivities.length > 0 && (
          <div className={styles.generatedActivityList}>
            {filteredActivities.map((activity) => {
              const deletionBlocked = activity.deletionStatus === "retained-data";
              const deleteLabel = deletionBlocked
                ? t(`practice.library.deleteBlocked.${activity.deletionStatus}`, {
                    title: activity.title,
                  })
                : t("practice.library.deleteAction", { title: activity.title });
              return (
                <div className={styles.generatedActivity} key={activity.activityId}>
                  <Button
                    aria-label={t("practice.library.open", { title: activity.title })}
                    className={styles.generatedActivityOpen}
                    onPress={() => {
                      onOpenActivity(activity.activityId);
                    }}
                  >
                    <span className={styles.generatedActivityCopy}>
                      <strong>{activity.title}</strong>
                      <span>
                        {t(`practice.library.types.${activity.activityType}`)} ·{" "}
                        {activity.preparedAt.slice(0, 10)}
                        {activity.deletionStatus !== "available"
                          ? ` · ${t(`practice.library.deleteStates.${activity.deletionStatus}`)}`
                          : ""}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                  {deletionBlocked ? (
                    <span className={styles.generatedActivityDeleteWrapper} title={deleteLabel}>
                      <Button
                        aria-label={deleteLabel}
                        className={styles.generatedActivityDelete}
                        isDisabled
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </span>
                  ) : (
                    <DialogTrigger>
                      <Button aria-label={deleteLabel} className={styles.generatedActivityDelete}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                      <ModalOverlay className={styles.modalOverlay} isDismissable>
                        <Modal className={styles.modal}>
                          <Dialog>
                            {({ close }) => (
                              <>
                                <Heading slot="title">
                                  {t("practice.library.deleteTitle", { title: activity.title })}
                                </Heading>
                                <p>
                                  {t(
                                    activity.deletionStatus === "cascade"
                                      ? "practice.library.deleteCascadeBody"
                                      : "practice.library.deleteBody",
                                  )}
                                </p>
                                <div className={styles.buttonRow}>
                                  <Button
                                    className={styles.danger}
                                    onPress={() => {
                                      close();
                                      void deletePreparedActivity(activity);
                                    }}
                                  >
                                    {t("practice.library.deleteConfirm")}
                                  </Button>
                                  <Button className={styles.secondary} onPress={close}>
                                    {t("actions.cancel")}
                                  </Button>
                                </div>
                              </>
                            )}
                          </Dialog>
                        </Modal>
                      </ModalOverlay>
                    </DialogTrigger>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {preparedActivities.length > 0 && filteredActivities.length === 0 && (
          <p className={styles.muted}>{t("practice.library.noFilterResults")}</p>
        )}
      </section>

      <section className={styles.practiceSection} aria-labelledby="practice-type-heading">
        <div className={styles.practiceSectionHeader}>
          <div>
            <h2 id="practice-type-heading">{t("practice.chooser.title")}</h2>
            <p>{t("practice.chooser.body")}</p>
          </div>
        </div>
        <div className={styles.practiceTypeGrid}>
          {practiceKinds.map(({ kind, icon: Icon }) => (
            <Button
              aria-pressed={selectedKind === kind}
              className={styles.practiceTypeCard}
              data-selected={selectedKind === kind || undefined}
              key={kind}
              onPress={() => {
                setSelectedKind(kind);
              }}
            >
              <span className={styles.practiceTypeIcon}>
                <Icon aria-hidden="true" />
              </span>
              <span className={styles.practiceTypeCopy}>
                <strong>{t(`practice.types.${kind}.title`)}</strong>
                <span>{t(`practice.types.${kind}.body`)}</span>
              </span>
            </Button>
          ))}
        </div>
      </section>

      <div className={styles.practiceContent}>
        {selectedKind === "custom" && (
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
            {quizLengthControl}
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
        )}
        {selectedKind === "grammar" && (
          <SurfaceCard>
            <h2>{t("practice.grammarLesson.title")}</h2>
            <p>{t("practice.grammarLesson.body")}</p>
            <p className={styles.muted}>{t("practice.grammarLesson.topic")}</p>
            {quizLengthControl}
            <Button
              className={styles.secondary}
              isDisabled={generating}
              onPress={() => void generateCustomLesson(t("practice.grammarLesson.request"))}
            >
              <BookOpen aria-hidden="true" />
              {generating ? t("exercises.custom.generating") : t("practice.grammarLesson.start")}
            </Button>
          </SurfaceCard>
        )}
        {selectedKind === "reading" && <ReadingPractice />}
        {selectedKind === "listening" && <CodexActivityPreparation kind="listening" />}
        {selectedKind === "speaking" && <CodexActivityPreparation kind="speaking" />}
        {selectedKind === "diagnostic" && <PlacementDiagnostic />}
      </div>
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
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [helperOpen, setHelperOpen] = useState(
    () => window.matchMedia("(min-width: 68.01rem)").matches,
  );
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
  const modelWorkload: ModelWorkload = page === "writing" ? "correction" : "generation";

  return (
    <div
      className={`${styles.shell} ${
        page === "practice" && preparedActivityId ? styles.exerciseMode : ""
      } ${navCollapsed ? styles.navCollapsed : ""} ${helperOpen ? "" : styles.helperCollapsed}`}
    >
      <nav className={styles.nav} aria-label={t("nav.label")}>
        <div className={styles.navInner}>
          <div className={styles.brand}>
            <img alt="" className={styles.brandMark} src={openDeutschLogo} />
            <span className={styles.brandText}>{t("app.name")}</span>
            <Button
              aria-label={
                navCollapsed ? t("actions.expandNavigation") : t("actions.collapseNavigation")
              }
              className={styles.sidebarToggle}
              title={navCollapsed ? t("actions.expandNavigation") : t("actions.collapseNavigation")}
              onPress={() => {
                setNavCollapsed((current) => !current);
              }}
            >
              {navCollapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </Button>
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
                  title={navCollapsed ? t(`nav.${destination}`) : undefined}
                  type="button"
                >
                  <Icon aria-hidden="true" />
                  <span className={styles.navLabel}>{t(`nav.${destination}`)}</span>
                </button>
              </li>
            ))}
          </ul>
          <SidebarModelControl initialWorkload={modelWorkload} />
        </div>
      </nav>
      <main className={styles.workspace} id="main-content">
        <div className={styles.workspaceInner}>
          <header className={styles.workspaceHeader}>
            <LanguageButton />
          </header>
          <CodexBanner readiness={readiness} />
          {operationError && <OperationError error={operationError} />}
          {accountSignedOut && readiness.codex.status === "available" && (
            <div className={styles.banner} role="status">
              <UserRound aria-hidden="true" /> {t("codex.signedOut")}
            </div>
          )}
          {page === "dashboard" ? (
            <Dashboard onAi={() => void openAi()} onNavigate={navigate} />
          ) : null}
          {page === "practice" ? (
            <PracticePage
              {...(preparedActivityId ? { activityId: preparedActivityId } : {})}
              requestAiAccess={openAi}
              onOpenActivity={(activityId) => {
                setPreparedActivityId(activityId);
              }}
              onCloseActivity={() => {
                setPreparedActivityId(undefined);
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
        data-collapsed={!helperOpen}
        aria-label={t("dashboard.helperTitle")}
      >
        <div className={styles.helperInner}>
          <div className={styles.helperHeader}>
            <h2>{t("dashboard.helperTitle")}</h2>
            <Button
              aria-label={helperOpen ? t("actions.hideHelper") : t("actions.showHelper")}
              className={styles.sidebarToggle}
              title={helperOpen ? t("actions.hideHelper") : t("actions.showHelper")}
              onPress={() => {
                setHelperOpen((current) => !current);
              }}
            >
              {helperOpen ? (
                <PanelRightClose aria-hidden="true" />
              ) : (
                <PanelRightOpen aria-hidden="true" />
              )}
            </Button>
          </div>
          <div className={styles.helperContent}>
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
          </div>
        </div>
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

export default function App() {
  const { t } = useTranslation();
  const [readiness, setReadiness] = useState<Readiness>();
  const [fatal, setFatal] = useState<OpenDeutschError>();
  const [recoveringRoot, setRecoveringRoot] = useState(false);
  const [profileOnboarding, setProfileOnboarding] = useState(false);
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
    const initialLoad = window.setTimeout(() => void load(), 0);
    window.openDeutsch.ready();
    return () => {
      window.clearTimeout(initialLoad);
    };
  }, [load]);
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
