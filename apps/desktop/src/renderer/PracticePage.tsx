import { OperationProgress } from "./OperationProgress.js";
import type { PracticeLaunch } from "./usePracticeSuggestion.js";
import { CodexActivityPreparation } from "./CodexActivityPreparation.js";
import { useLearningOperation } from "./useLearningOperation.js";
import { ReadingPractice } from "./ReadingPractice.js";
import { PreparedActivityWorkspace } from "./PreparedActivityWorkspace.js";
import { useActivityLibrary } from "./useActivityLibrary.js";
import { generatePracticeActivity } from "./generatePracticeActivity.js";
import { OperationError } from "./Startup.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  exerciseFeedbackCandidateSchema,
  type DesktopIpcResponse,
  type OpenDeutschError,
} from "@open-deutsch/contracts";
import { materializeGeneratedExerciseSet } from "@open-deutsch/domain";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
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
  ToggleButtonGroup,
  Card,
  ConfirmDialog,
  FieldGroup,
  IconButton,
  InfoHint,
  ItemList,
  Muted,
} from "./components/ui/index.js";
import { ActionGroup, Page } from "./components/layout/index.js";
import { invokeDesktop, normalizeDesktopError } from "./ipc.js";

type PreparedActivityId = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "dashboard/read" }
>["result"]["preparedActivities"][number]["activityId"];
type PreparedActivity = Extract<
  DesktopIpcResponse,
  { status: "ok"; channel: "dashboard/read" }
>["result"]["preparedActivities"][number];
type PracticeKind = "custom" | "grammar" | "reading" | "listening" | "speaking";
type PracticeLibraryFilter = "all" | "custom-lesson" | "grammar" | "reading";

export function PracticePage({
  initialPreparation,
  activityId,
  requestAiAccess,
  onOpenActivity,
  onCloseActivity,
}: {
  initialPreparation?: Extract<PracticeLaunch, { destination: "preparation" }>;
  activityId?: PreparedActivityId;
  requestAiAccess: () => Promise<boolean>;
  onOpenActivity: (activityId: PreparedActivityId) => void;
  onCloseActivity: () => void;
}) {
  const { t } = useTranslation();
  const [generatedResult, setGenerated] =
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
  const generation = useLearningOperation();
  const feedback = useLearningOperation();
  const generating = generation.busy;
  const [generationError, setGenerationError] = useState<OpenDeutschError>();
  const [deleting, setDeleting] = useState(false);
  const [libraryView, setLibraryView] = useState(false);
  const returnPosition = useRef<{ y: number; id: string } | undefined>(undefined);
  const openSavedActivity = (id: PreparedActivityId) => {
    returnPosition.current = { y: window.scrollY, id };
    onOpenActivity(id);
  };
  const [selectedKind, setSelectedKind] = useState<PracticeKind>(
    initialPreparation?.kind ?? "custom",
  );
  const [libraryFilter, setLibraryFilter] = useState<PracticeLibraryFilter>("all");
  const library = useActivityLibrary(
    libraryFilter === "all"
      ? ["grammar", "custom-lesson", "reading", "writing", "vocabulary-review", "placement"]
      : [libraryFilter],
  );
  const preparedActivities = library.entries;
  const libraryBusy = library.busy;
  const [libraryMutationError, setLibraryMutationError] = useState<OpenDeutschError>();
  const libraryError = libraryMutationError ?? library.error;
  const [prepared, setPrepared] =
    useState<Extract<DesktopIpcResponse, { status: "ok"; channel: "activity/read" }>["result"]>();

  const generated = prepared?.activity.activityId === activityId ? generatedResult : undefined;
  useEffect(() => {
    if (!activityId && !libraryBusy && returnPosition.current) {
      const position = returnPosition.current;
      const frame = window.requestAnimationFrame(() => {
        window.scrollTo(0, position.y);
        document.getElementById(`activity-open-${position.id}`)?.focus({ preventScroll: true });
        returnPosition.current = undefined;
      });
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [activityId, libraryBusy, preparedActivities.length]);
  useEffect(() => {
    setPrepared(undefined);
    setGenerated(undefined);
    setStartedAttemptIds(undefined);
    setError(undefined);
    if (!activityId) return;
    window.scrollTo(0, 0);
    let current = true;
    void invokeDesktop("activity/read", { activityId })
      .then(async (result) => {
        if (!current) return;
        setPrepared(result);
        if (result.generated) {
          const generatedActivity = await invokeDesktop("prepared-activity/read", { activityId });
          if (current) setGenerated(generatedActivity);
        }
      })
      .catch((cause: unknown) => {
        if (current) setError(normalizeDesktopError(cause).detail);
      });
    return () => {
      current = false;
    };
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
  const filteredActivities = preparedActivities;
  const deletePreparedActivity = async (activityToDelete: PreparedActivity) => {
    setLibraryMutationError(undefined);
    try {
      await invokeDesktop("prepared-activity/delete", { activityId: activityToDelete.activityId });
      await library.refresh();
    } catch (cause: unknown) {
      setLibraryMutationError(normalizeDesktopError(cause).detail);
    }
  };
  if (
    activityId &&
    prepared &&
    prepared.activity.activityId === activityId &&
    !prepared.generated
  ) {
    return (
      <PreparedActivityWorkspace
        prepared={prepared}
        onClose={onCloseActivity}
        onOpenActivity={onOpenActivity}
        requestAiAccess={requestAiAccess}
      />
    );
  }
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
      <section className={`${styles.page} ${styles.practiceSession}`} data-activity-id={activityId}>
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
        {generated?.output.readingMaterial && (
          <Card as="article">
            <h2>{generated.output.readingMaterial.title}</h2>
            <p className={styles.readingPassage}>{generated.output.readingMaterial.passage}</p>
          </Card>
        )}
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
            <OperationProgress progress={feedback.progress} />
            <ExerciseEngine
              {...(feedback.busy ? { onCancelAiEvaluation: feedback.cancel } : {})}
              key={activityId}
              exercises={exercises}
              restart={Boolean(generated.activeSet)}
              onStarted={async () => {
                if (generated.activeSet) {
                  await invokeDesktop("exercise-set/abandon", { activityId });
                  setGenerated((current) => (current ? { ...current, activeSet: null } : current));
                }
                const started = await invokeDesktop("exercise-set/start", {
                  activityId,
                });
                setStartedAttemptIds(started.attemptIds);
              }}
              onAiEvaluationRequested={async (evaluation, exercisePosition) => {
                if (!(await requestAiAccess())) throw new Error("OD_AI_DISCLOSURE_REQUIRED");
                const attemptId = startedAttemptIds?.[exercisePosition];
                if (!attemptId) throw new Error("OD_EXERCISE_ATTEMPT_SET_INVALID");
                if (
                  evaluation.answer.kind !== "free-writing" &&
                  evaluation.answer.kind !== "short-answer" &&
                  evaluation.answer.kind !== "sentence-correction"
                ) {
                  throw new Error("OD_EXERCISE_AI_FEEDBACK_NOT_REQUIRED");
                }
                const result = await feedback.run({
                  kind: "exercise-feedback",
                  activityId,
                  attemptId,
                  answer: evaluation.answer,
                });
                return exerciseFeedbackCandidateSchema.parse(result.output);
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
    setGenerationError(undefined);
    try {
      const createdId = await generatePracticeActivity(
        {
          source: "natural-request",
          naturalRequest: requestedLesson.trim(),
          exerciseCount,
        },
        generation.run,
      );
      setCustomRequest("");
      onOpenActivity(createdId);
    } catch (cause) {
      setGenerationError(normalizeDesktopError(cause).detail);
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
  ];
  const quizLengthControl = (
    <fieldset className={styles.quizLength}>
      <legend>{t("exercises.custom.countLabel")}</legend>
      <div className={styles.quizLengthOptions}>
        {([3, 6, 10] as const).map((count) => (
          <Button
            isDisabled={generating}
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
    <Page title={t("practice.title")}>
      <ToggleButtonGroup label={t("practice.title")}>
        <Button aria-pressed={!libraryView} onPress={() => setLibraryView(false)}>
          {t("ui.newPractice")}
        </Button>
        <Button aria-pressed={libraryView} onPress={() => setLibraryView(true)}>
          {t("practice.library.title")}
        </Button>
      </ToggleButtonGroup>

      <section
        hidden={!libraryView}
        className={styles.generatedLibrary}
        aria-busy={libraryBusy}
        data-library-ready={library.loaded && !libraryBusy && !libraryError}
      >
        <div className={styles.practiceSectionHeader}>
          <div>
            <h2>{t("practice.library.title")}</h2>
          </div>
          {preparedActivities.length > 0 && (
            <span className={styles.countBadge}>
              {t("practice.library.count", { count: preparedActivities.length })}
            </span>
          )}
        </div>
        {(preparedActivities.length > 0 || libraryFilter !== "all") && (
          <div
            aria-label={t("practice.library.filterLabel")}
            className={styles.libraryFilters}
            role="group"
          >
            {(["all", "custom-lesson", "grammar", "reading"] as const).map((filter) => {
              return (
                <Button
                  className={styles.libraryFilterButton}
                  aria-pressed={libraryFilter === filter}
                  data-selected={libraryFilter === filter || undefined}
                  key={filter}
                  onPress={() => {
                    setLibraryFilter(filter);
                  }}
                >
                  {t(`practice.library.filters.${filter}`)}
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
          <Muted as="p">
            {t(
              libraryFilter === "all"
                ? "practice.library.empty"
                : "practice.library.noFilterResults",
            )}
          </Muted>
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
                    id={`activity-open-${activity.activityId}`}
                    aria-label={t("practice.library.open", { title: activity.title })}
                    className={styles.generatedActivityOpen}
                    onPress={() => {
                      openSavedActivity(activity.activityId);
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
                    <InfoHint label={t("practice.library.deleteAction", { title: activity.title })}>
                      {deleteLabel}
                    </InfoHint>
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
        {library.hasMore && (
          <Button isDisabled={libraryBusy} onPress={() => void library.loadMore()}>
            {t("practice.library.loadMore")}
          </Button>
        )}
      </section>

      <div hidden={libraryView}>
        <section className={styles.practiceSection} aria-labelledby="practice-type-heading">
          <div className={styles.practiceSectionHeader}>
            <div>
              <h2 id="practice-type-heading">{t("practice.chooser.title")}</h2>
            </div>
          </div>
          <div className={styles.practiceTypeGrid}>
            {practiceKinds.map(({ kind, icon: Icon }) => (
              <Button
                isDisabled={generating}
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
                </span>
              </Button>
            ))}
          </div>
        </section>

        {generationError && <OperationError error={generationError} />}
        <div className={styles.practiceContent}>
          {selectedKind === "custom" && (
            <Card as="article">
              <h2>{t("exercises.custom.title")}</h2>

              <FieldGroup>
                {t("exercises.custom.request")}
                <textarea
                  maxLength={2_000}
                  disabled={generating}
                  value={customRequest}
                  onChange={(event) => {
                    setCustomRequest(event.target.value);
                  }}
                />
              </FieldGroup>
              {quizLengthControl}
              <OperationProgress progress={generation.progress} />
              <ActionGroup>
                <Button
                  variant="primary"
                  isDisabled={generating || !customRequest.trim()}
                  onPress={() => void generateCustomLesson()}
                >
                  {generating ? t("exercises.custom.generating") : t("exercises.custom.generate")}
                </Button>
                {generating && (
                  <Button variant="secondary" onPress={generation.cancel}>
                    {t("actions.cancel")}
                  </Button>
                )}
              </ActionGroup>
            </Card>
          )}
          {selectedKind === "grammar" && (
            <Card as="article">
              <h2>{t("practice.grammarLesson.title")}</h2>

              <Muted as="p">{t("practice.grammarLesson.topic")}</Muted>
              {quizLengthControl}
              <OperationProgress progress={generation.progress} />
              <ActionGroup>
                <Button
                  isDisabled={generating}
                  onPress={() => void generateCustomLesson(t("practice.grammarLesson.request"))}
                >
                  <BookOpen aria-hidden="true" />
                  {generating
                    ? t("exercises.custom.generating")
                    : t("practice.grammarLesson.start")}
                </Button>
                {generating && (
                  <Button variant="secondary" onPress={generation.cancel}>
                    {t("actions.cancel")}
                  </Button>
                )}
              </ActionGroup>
            </Card>
          )}
          {selectedKind === "reading" && (
            <ReadingPractice requestAiAccess={requestAiAccess} onOpenActivity={onOpenActivity} />
          )}
          {selectedKind === "listening" && (
            <CodexActivityPreparation
              key="listening"
              kind="listening"
              {...(initialPreparation?.kind === "listening"
                ? { initialScenario: initialPreparation.prompt }
                : {})}
              onOpenActivity={onOpenActivity}
            />
          )}
          {selectedKind === "speaking" && (
            <CodexActivityPreparation
              key="speaking"
              kind="speaking"
              {...(initialPreparation?.kind === "speaking"
                ? { initialScenario: initialPreparation.prompt }
                : {})}
              onOpenActivity={onOpenActivity}
            />
          )}
        </div>
      </div>
    </Page>
  );
}
