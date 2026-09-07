import { useCallback, useEffect, useMemo, useState } from "react";
import {
  exerciseFeedbackCandidateSchema,
  learningOperationInputSchema,
  placementResultSchema,
  readingResultSchema,
  type DesktopIpcResponse,
  type OpenDeutschError,
  type VoiceActivityContext,
} from "@open-deutsch/contracts";
import { materializeGeneratedExerciseSet } from "@open-deutsch/domain";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Gauge,
  MessageSquareText,
  Sparkles,
  Trash2,
  UserRound,
  Volume2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ExerciseEngine } from "./ExerciseEngine.js";
import styles from "./PracticePage.module.css";
import {
  Button,
  Card,
  ConfirmDialog,
  Feedback,
  FieldGroup,
  IconButton,
  ItemList,
  Muted,
} from "./components/ui/index.js";
import { ActionGroup } from "./components/layout/index.js";
import {
  createDesktopSubmissionId,
  invokeDesktop,
  normalizeDesktopError,
  subscribeDesktop,
} from "./ipc.js";

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
      <Card as="article">
        <h2>{t("practice.diagnosticFlow.completedTitle")}</h2>
        <p>
          {t("practice.diagnosticFlow.completedBody", {
            level: completed.estimatedLevel.toUpperCase(),
          })}
        </p>
        <Feedback live="off" tone="warning">
          {completed.uncertainty.level === "none"
            ? t("practice.diagnosticFlow.noAdditionalUncertainty")
            : completed.uncertainty.explanation}
        </Feedback>
        <ItemList>
          {completed.sampleResults.map((sample) => (
            <li key={sample.kind}>
              <strong>{sample.topic}</strong>:{" "}
              {t(`practice.diagnosticFlow.outcomes.${sample.outcome}`)} — {sample.evidence}
            </li>
          ))}
        </ItemList>
        <Feedback live="off" tone="warning">{completed.voiceCalibration.explanation}</Feedback>
      </Card>
    );
  }

  return (
    <Card as="article">
      <h2>{t("practice.diagnosticFlow.title")}</h2>
      <p>{t("practice.diagnosticFlow.body")}</p>
      {skipped && <Feedback live="off">{t("practice.diagnosticFlow.skipped")}</Feedback>}
      {!started && !skipped ? (
        <ActionGroup>
          <Button
            variant="primary"
            onPress={() => {
              setStarted(true);
            }}
          >
            {t("practice.diagnosticFlow.start")}
          </Button>
          <Button

            onPress={() => {
              setSkipped(true);
            }}
          >
            {t("practice.diagnosticFlow.skip")}
          </Button>
        </ActionGroup>
      ) : null}
      {started && !skipped ? (
        <div className={styles.historyDetail}>
          <FieldGroup>
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
          </FieldGroup>
          <FieldGroup>
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
          </FieldGroup>
          <section>
            <h3>{t("practice.diagnosticFlow.reading")}</h3>
            <p>{t("practice.diagnosticFlow.readingText")}</p>
            <FieldGroup>
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
            </FieldGroup>
          </section>
          <FieldGroup>
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
          </FieldGroup>
          {error && <Feedback live="assertive" tone="error">{t(error.messageKey)}</Feedback>}
          <Button isPending={busy} pendingLabel={t("practice.diagnosticFlow.saving")} variant="primary" onPress={() => void complete()}>
            {t("practice.diagnosticFlow.finish")}
          </Button>
        </div>
      ) : null}
    </Card>
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
    <Card as="article">
      <h2>{t("practice.readingFlow.title")}</h2>
      <p>{t("practice.readingFlow.body")}</p>
      {saved ? (
        <Feedback live="off" tone="success">{t("practice.readingFlow.saved")}</Feedback>
      ) : !started ? (
        <div className={styles.inlineActions}>
          <Button

            onPress={() => {
              setStarted(true);
            }}
          >
            <MessageSquareText aria-hidden="true" /> {t("practice.readingFlow.start")}
          </Button>
          <Button onPress={useGeneratedPassage}>
            <Sparkles aria-hidden="true" /> {t("practice.readingFlow.generate")}
          </Button>
        </div>
      ) : (
        <div className={styles.historyDetail}>
          <section>
            <h3>{t("practice.readingFlow.material")}</h3>
            <Muted as="p">
              {t("practice.readingFlow.source")}: {sourceLabel}
              {sourceKind === "bundled" ? " · 2026-08-20" : ""}
            </Muted>
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
          <FieldGroup>
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
          </FieldGroup>
          <Button

            onPress={useImportedText}
            isDisabled={!importDraft.trim()}
          >
            {t("practice.readingFlow.useImport")}
          </Button>
          <FieldGroup>
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
          </FieldGroup>
          <FieldGroup>
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
          </FieldGroup>
          <FieldGroup>
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
          </FieldGroup>
          <FieldGroup>
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
          </FieldGroup>
          {error && <Feedback live="assertive" tone="error">{t(error.messageKey)}</Feedback>}
          <Button isPending={busy} pendingLabel={t("practice.readingFlow.saving")} variant="primary" onPress={() => void complete()}>
            {t("practice.readingFlow.finish")}
          </Button>
        </div>
      )}
    </Card>
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
      <Card as="article">
        <h2>{t(`${base}.title`)}</h2>
        <p>{t(`${base}.body`)}</p>
        <div className={styles.voiceSetupGrid}>
          <FieldGroup className={styles.voiceScenarioField}>
            {t(`${base}.scenarioLabel`)}
            <input
              maxLength={240}
              value={scenario}
              onChange={(event) => {
                setScenario(event.target.value);
              }}
            />
          </FieldGroup>
          <FieldGroup>
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
          </FieldGroup>
          <FieldGroup>
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
          </FieldGroup>
          <FieldGroup>
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
          </FieldGroup>
          <FieldGroup>
            {t(`${base}.objectives`)}
            <textarea
              maxLength={4_000}
              value={objectives}
              onChange={(event) => {
                setObjectives(event.target.value);
              }}
            />
            <small>{t(`${base}.onePerLine`)}</small>
          </FieldGroup>
          <FieldGroup>
            {t(`${base}.questions`)}
            <textarea
              maxLength={4_000}
              value={questions}
              onChange={(event) => {
                setQuestions(event.target.value);
              }}
            />
            <small>{t(`${base}.onePerLine`)}</small>
          </FieldGroup>
        </div>
        {context.script && (
          <section>
            <h3>{t(`${base}.scriptLabel`)}</h3>
            <p>{context.script}</p>
          </section>
        )}
        <section>
          <h3>{t(`${base}.guidance`)}</h3>
          <ItemList>
            {context.answerGuidance.map((guidance) => (
              <li key={guidance}>{guidance}</li>
            ))}
          </ItemList>
        </section>
        {error && <Feedback live="assertive" tone="error">{t(error.messageKey)}</Feedback>}
        {selectedActivity && (
          <section className={styles.voicePreparedPreview}>
            <h3>{selectedActivity.context.scenario}</h3>
            <Muted as="p">
              {selectedActivity.context.targetLevel.toUpperCase()} ·{" "}
              {t(`${base}.difficultyOptions.${selectedActivity.context.difficulty}`)} ·{" "}
              {t(`${base}.correctionOptions.${selectedActivity.context.correctionTiming}`)}
            </Muted>
            <h4>{t(`${base}.objectives`)}</h4>
            <ItemList>
              {selectedActivity.context.objectives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ItemList>
            <h4>{t(`${base}.questions`)}</h4>
            <ItemList>
              {selectedActivity.context.questions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ItemList>
            <Feedback live="off" tone="success">
              <strong>{t(`${base}.saved`)}</strong>
              <span>{t(`${base}.voiceStart`)}</span>
              <ItemList>
                <li>{t(`${base}.voiceStepOne`)}</li>
                <li>{t(`${base}.voiceStepTwo`)}</li>
                <li>{t(`${base}.voiceStepThree`)}</li>
              </ItemList>
            </Feedback>
          </section>
        )}
        <Button
          isDisabled={
            !scenario.trim() || lines(objectives).length === 0 || lines(questions).length === 0
          }
          isPending={busy}
          pendingLabel={t(`${base}.preparing`)}
          variant="primary"
          onPress={() => void prepare()}
        >
          {t(`${base}.prepare`)}
        </Button>
      </Card>
      <Card as="article">
        <h2>{t(`${base}.savedTitle`)}</h2>
        <p>{t(`${base}.savedBody`)}</p>
        {savedActivities.length === 0 ? (
          <Muted as="p">{t(`${base}.savedEmpty`)}</Muted>
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
                <ConfirmDialog
                  body={t(`${base}.deleteBody`)}
                  cancel={t("actions.cancel")}
                  confirm={t(`${base}.deleteConfirm`)}
                  onConfirm={() => {
                    return invokeDesktop("prepared-activity/delete", {
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
      </Card>
    </div>
  );
}

export function PracticePage({
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
              <ConfirmDialog
                body={t(
                  generated.deletionStatus === "cascade"
                    ? "exercises.delete.cascadeBody"
                    : "exercises.delete.body",
                )}
                cancel={t("actions.cancel")}
                confirm={t("exercises.delete.confirm")}
                onConfirm={() => deleteGeneratedLesson()}
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
                  <ItemList>
                    {generated.output.lesson.vocabularyFoundations.map((item) => (
                      <li key={`${item.german}:${item.example}`}>
                        <strong>{item.german}</strong> — {item.explanation}
                        <Muted as="span">{item.example}</Muted>
                      </li>
                    ))}
                  </ItemList>
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
          <Muted as="p">{t("practice.library.loading")}</Muted>
        )}
        {!libraryError && preparedActivities.length === 0 && !libraryBusy && (
          <Muted as="p">{t("practice.library.empty")}</Muted>
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
                    <IconButton
                      className={styles.generatedActivityDelete}
                      isDisabled
                      label={deleteLabel}
                      leadingIcon={<Trash2 aria-hidden="true" />}
                    />
                  ) : (
                    <ConfirmDialog
                      body={t(
                        activity.deletionStatus === "cascade"
                          ? "practice.library.deleteCascadeBody"
                          : "practice.library.deleteBody",
                      )}
                      cancel={t("actions.cancel")}
                      confirm={t("practice.library.deleteConfirm")}
                      title={t("practice.library.deleteTitle", { title: activity.title })}
                      trigger={deleteLabel}
                      triggerNode={
                        <IconButton
                          className={styles.generatedActivityDelete}
                          label={deleteLabel}
                          leadingIcon={<Trash2 aria-hidden="true" />}
                        />
                      }
                      onConfirm={() => deletePreparedActivity(activity)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {preparedActivities.length > 0 && filteredActivities.length === 0 && (
          <Muted as="p">{t("practice.library.noFilterResults")}</Muted>
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
          <Card as="article">
            <h2>{t("exercises.custom.title")}</h2>
            <p>{t("exercises.custom.body")}</p>
            <FieldGroup>
              {t("exercises.custom.request")}
              <textarea
                maxLength={2_000}
                value={customRequest}
                onChange={(event) => {
                  setCustomRequest(event.target.value);
                }}
              />
            </FieldGroup>
            {quizLengthControl}
            {generationFailed && (
              <Feedback live="assertive" tone="error">{t("exercises.custom.failed")}</Feedback>
            )}
            <Button
              variant="primary"
              isDisabled={generating || !customRequest.trim()}
              onPress={() => void generateCustomLesson()}
            >
              {generating ? t("exercises.custom.generating") : t("exercises.custom.generate")}
            </Button>
          </Card>
        )}
        {selectedKind === "grammar" && (
          <Card as="article">
            <h2>{t("practice.grammarLesson.title")}</h2>
            <p>{t("practice.grammarLesson.body")}</p>
            <Muted as="p">{t("practice.grammarLesson.topic")}</Muted>
            {quizLengthControl}
            <Button

              isDisabled={generating}
              onPress={() => void generateCustomLesson(t("practice.grammarLesson.request"))}
            >
              <BookOpen aria-hidden="true" />
              {generating ? t("exercises.custom.generating") : t("practice.grammarLesson.start")}
            </Button>
          </Card>
        )}
        {selectedKind === "reading" && <ReadingPractice />}
        {selectedKind === "listening" && <CodexActivityPreparation kind="listening" />}
        {selectedKind === "speaking" && <CodexActivityPreparation kind="speaking" />}
        {selectedKind === "diagnostic" && <PlacementDiagnostic />}
      </div>
    </section>
  );
}

