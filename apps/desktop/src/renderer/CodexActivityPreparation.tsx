import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import {
  voiceActivityContextSchema,
  type ActivityId,
  type VoiceActivityContext,
  type OpenDeutschError,
} from "@open-deutsch/contracts";
import {
  Button,
  Card,
  Disclosure,
  InfoHint,
  ConfirmDialog,
  Feedback,
  FieldGroup,
  Muted,
} from "./components/ui/index.js";
import { invokeDesktop, normalizeDesktopError } from "./ipc.js";
import { OperationError } from "./Startup.js";
import { useActivityLibrary } from "./useActivityLibrary.js";
import styles from "./PracticePage.module.css";

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function CodexActivityPreparation({
  kind,
  initialScenario,
  onOpenActivity,
}: {
  kind: "listening" | "speaking";
  initialScenario?: string;
  onOpenActivity: (id: ActivityId) => void;
}) {
  const { t } = useTranslation();
  const base = kind === "listening" ? "practice.listeningFlow" : "practice.speakingFlow";
  const [scenario, setScenario] = useState(initialScenario?.slice(0, 240) ?? t(`${base}.scenario`));
  const [targetLevel, setTargetLevel] = useState<VoiceActivityContext["targetLevel"]>("a2");
  const levelEdited = useRef(false);
  useEffect(() => {
    let current = true;
    void invokeDesktop("learner-profile/read", {})
      .then((result) => {
        if (current && !levelEdited.current && result.status === "ready") {
          setTargetLevel(result.profile.approximateLevel);
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  const [script, setScript] = useState(
    !initialScenario && kind === "listening" ? t(`${base}.script`) : "",
  );
  const [guidance, setGuidance] = useState(
    initialScenario
      ? t("suggestions.voiceGuidance")
      : `${t(`${base}.guidanceOne`)}\n${t(`${base}.guidanceTwo`)}`,
  );
  const [difficulty, setDifficulty] = useState<VoiceActivityContext["difficulty"]>("intermediate");
  const [correctionTiming, setCorrectionTiming] =
    useState<VoiceActivityContext["correctionTiming"]>("after-each");
  const [objectives, setObjectives] = useState(
    initialScenario
      ? (initialScenario.replace(/\s+/gu, " ").match(/[\s\S]{1,500}/gu) ?? []).join("\n")
      : `${t(`${base}.objectiveOne`)}\n${t(`${base}.objectiveTwo`)}`,
  );
  const [questions, setQuestions] = useState(
    initialScenario
      ? t("suggestions.voiceQuestion")
      : `${t(`${base}.questionOne`)}\n${t(`${base}.questionTwo`)}`,
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
        ...(kind === "listening" && script.trim() ? { script: script.trim() } : {}),
        questions: lines(questions),
        answerGuidance: lines(guidance),
      }) satisfies VoiceActivityContext,
    [
      base,
      correctionTiming,
      difficulty,
      kind,
      objectives,
      questions,
      scenario,
      t,
      targetLevel,
      script,
      guidance,
    ],
  );
  const savedLibrary = useActivityLibrary([
    kind === "speaking" ? "voice-speaking" : "codex-listening",
  ]);
  const savedActivities = savedLibrary.entries;
  const refreshSaved = savedLibrary.refresh;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenDeutschError>();

  const prepare = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await invokeDesktop("codex-activity/prepare", {
        title: scenario.trim().slice(0, 160),
        context,
      });
      await refreshSaved();
      onOpenActivity(result.activityId);
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.voicePreparation} data-testid={`codex-${kind}-preparation`}>
      <Card as="article">
        <h2>
          {t(`${base}.title`)} <InfoHint label={t(`${base}.title`)}>{t(`${base}.body`)}</InfoHint>
        </h2>
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
        </div>
        <Disclosure label={t("ui.activityOptions")}>
          <div className={styles.voiceSetupGrid}>
            <FieldGroup>
              {t(`${base}.levelLabel`)}
              <select
                value={targetLevel}
                onChange={(event) => {
                  levelEdited.current = true;
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
                  setCorrectionTiming(
                    event.target.value as VoiceActivityContext["correctionTiming"],
                  );
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

            {kind === "listening" && (
              <FieldGroup>
                {t(`${base}.scriptLabel`)}
                <textarea
                  rows={5}
                  maxLength={2_400}
                  value={script}
                  disabled={busy}
                  onChange={(event) => setScript(event.target.value)}
                />
              </FieldGroup>
            )}
            <FieldGroup>
              {t(`${base}.guidance`)}
              <textarea
                rows={3}
                maxLength={4_000}
                value={guidance}
                disabled={busy}
                onChange={(event) => setGuidance(event.target.value)}
              />
              <small>{t(`${base}.onePerLine`)}</small>
            </FieldGroup>
          </div>
        </Disclosure>
        <Muted as="p">{t("practice.voiceContentNotice")}</Muted>
        {error && (
          <Feedback live="assertive" tone="error">
            {t(error.messageKey)}
          </Feedback>
        )}
        {!voiceActivityContextSchema.safeParse(context).success && (
          <Muted as="p" role="status">
            {t("ui.completeOptions")}
          </Muted>
        )}
        <Button
          isDisabled={!voiceActivityContextSchema.safeParse(context).success}
          isPending={busy}
          pendingLabel={t(`${base}.preparing`)}
          variant="primary"
          onPress={() => void prepare()}
        >
          {t(`${base}.prepare`)}
        </Button>
      </Card>
      <Card
        as="article"
        aria-busy={savedLibrary.busy}
        data-library-ready={savedLibrary.loaded && !savedLibrary.busy && !savedLibrary.error}
      >
        <h2>{t(`${base}.savedTitle`)}</h2>

        {savedActivities.length === 0 ? (
          <Muted as="p">{t(`${base}.savedEmpty`)}</Muted>
        ) : (
          <div className={styles.generatedActivityList}>
            {savedActivities.map((activity) => (
              <div className={styles.generatedActivity} key={activity.activityId}>
                <Button
                  className={styles.generatedActivityOpen}
                  id={`activity-open-${activity.activityId}`}
                  onPress={() => onOpenActivity(activity.activityId)}
                >
                  <span className={styles.generatedActivityCopy}>
                    <strong>{activity.title}</strong>
                    <span>{activity.preparedAt.slice(0, 10)}</span>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Button>
                {activity.deletionStatus !== "retained-data" && (
                  <ConfirmDialog
                    body={t(`${base}.deleteBody`)}
                    cancel={t("actions.cancel")}
                    confirm={t(`${base}.deleteConfirm`)}
                    onConfirm={() => {
                      return invokeDesktop("prepared-activity/delete", {
                        activityId: activity.activityId,
                      })
                        .then(() => {
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
                )}
              </div>
            ))}
          </div>
        )}
        {savedLibrary.error && <OperationError error={savedLibrary.error} />}
        {savedLibrary.hasMore && (
          <Button isDisabled={savedLibrary.busy} onPress={() => void savedLibrary.loadMore()}>
            {t("practice.library.loadMore")}
          </Button>
        )}
      </Card>
    </div>
  );
}
