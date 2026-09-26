import { OperationProgress } from "./OperationProgress.js";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  courseStepSchema,
  type ActivityId,
  type CourseReference,
  type CourseUnit,
  type DesktopIpcRequest,
  type OpenDeutschError,
} from "@open-deutsch/contracts";
import { courseStepStatus, nextCourseStep, sameCourseStep } from "@open-deutsch/domain";
import {
  Button,
  Card,
  Disclosure,
  Feedback,
  FieldGroup,
  ItemList,
  LoadingState,
  Muted,
} from "./components/ui/index.js";
import { ActionGroup, ContentGrid, Page } from "./components/layout/index.js";
import { invokeDesktop, normalizeDesktopError } from "./ipc.js";
import { useLearningPath } from "./useLearningPath.js";
import { useLearningOperation } from "./useLearningOperation.js";
import { generatePracticeActivity } from "./generatePracticeActivity.js";
import { OperationError } from "./Startup.js";
import { PracticePage } from "./PracticePage.js";
import styles from "./LearningPathPage.module.css";

export function LearningPathPage({
  requestAiAccess,
  onOpenHistory,
}: {
  requestAiAccess: () => Promise<boolean>;
  onOpenHistory: (
    ids?: NonNullable<
      Extract<DesktopIpcRequest, { channel: "history/read" }>["payload"]["historyEntryIds"]
    >,
  ) => void;
}) {
  const { t } = useTranslation();
  const learning = useLearningPath();
  const locale = learning.snapshot?.explanationLanguage ?? "en";
  const generation = useLearningOperation();
  const [tab, setTab] = useState<"course" | "progress" | "challenges">("course");
  const [selectedUnit, setSelectedUnit] = useState<string>();
  const [activityId, setActivityId] = useState<ActivityId>();
  const [challengeScope, setChallengeScope] = useState("a1-1");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<OpenDeutschError>();
  const snapshot = learning.snapshot;
  const course = snapshot?.course;
  const state = snapshot?.state;
  const reference = (
    unit: CourseUnit,
    step: CourseReference["step"],
    mode: CourseReference["mode"] = "course",
  ): CourseReference => ({ version: course!.version, unitId: unit.id, step, mode });
  const mutate = async (
    ref: CourseReference,
    action: "select" | "complete-explanation" | "skip" | "reopen",
  ) => {
    if (!snapshot || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await invokeDesktop("learning-path/update", {
        expectedGeneration: snapshot.rootGeneration,
        reference: ref,
        action,
      });
      setSelectedUnit(ref.unitId);
      await learning.refresh();
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const launch = async (ref: CourseReference) => {
    if (!snapshot || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (ref.mode === "course")
        await invokeDesktop("learning-path/update", {
          expectedGeneration: snapshot.rootGeneration,
          reference: ref,
          action: "select",
        });
      setSelectedUnit(ref.unitId);
      if (ref.step === "listening" || ref.step === "speaking") {
        const result = await invokeDesktop("learning-path/prepare-voice", {
          expectedGeneration: snapshot.rootGeneration,
          reference: ref,
        });
        setActivityId(result.activityId);
      } else {
        if (!(await requestAiAccess())) return;
        const id = await generatePracticeActivity(
          { source: "learning-path", expectedGeneration: snapshot.rootGeneration, reference: ref },
          generation.run,
        );
        setActivityId(id);
      }
    } catch (cause) {
      setError(normalizeDesktopError(cause).detail);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const closeActivity = () => {
    setActivityId(undefined);
    void learning.refresh();
  };
  if (activityId)
    return (
      <div className={styles.page}>
        <Button onPress={closeActivity}>{t("learningPath.return")}</Button>
        <PracticePage
          activityId={activityId}
          requestAiAccess={requestAiAccess}
          onOpenActivity={setActivityId}
          onCloseActivity={closeActivity}
        />
      </div>
    );
  const next = course && state ? nextCourseStep(course, state) : null;
  const selected =
    course?.units.find(
      (unit) => unit.id === (selectedUnit ?? next?.unitId ?? state?.current?.unitId),
    ) ?? course?.units.find((unit) => unit.stage === state?.selectedStage);
  const unitCounts = (unit: CourseUnit) => {
    const statuses = courseStepSchema.options.map((step) =>
      courseStepStatus(state!, reference(unit, step)),
    );
    return {
      completed: statuses.filter((s) => s === "completed").length,
      skipped: statuses.filter((s) => s === "skipped").length,
      total: statuses.length,
    };
  };
  const activityCard = (
    unit: CourseUnit,
    step: CourseReference["step"],
    mode: CourseReference["mode"],
  ) => {
    const ref = reference(unit, step, mode);
    const status = courseStepStatus(state!, ref);
    const attempts = state!.activities.filter((a) => sameCourseStep(a.reference, ref));
    const saved = attempts.find((a) => !a.completed);
    return (
      <Card as="article" key={`${unit.id}-${step}-${mode}`}>
        <h3>
          {mode === "challenge" ? `${unit.title[locale]} · ` : ""}
          {t(`learningPath.steps.${step}`)}
        </h3>
        <p>{t(`learningPath.status.${status}`)}</p>
        {step !== "learn" && <p>{unit.tasks[step][locale]}</p>}
        <ActionGroup>
          {step === "learn" ? (
            <Button
              isDisabled={busy || status === "completed"}
              onPress={() => void mutate(ref, "complete-explanation")}
            >
              {t("learningPath.finishExplanation")}
            </Button>
          ) : (
            <>
              {saved && (
                <Button isDisabled={busy} onPress={() => setActivityId(saved.activityId)}>
                  {t("learningPath.openSaved")}
                </Button>
              )}
              <Button isDisabled={busy} onPress={() => void launch(ref)}>
                {t(attempts.length ? "learningPath.practiseAgain" : "learningPath.start")}
              </Button>
            </>
          )}
          {mode === "course" && (
            <Button
              variant="quiet"
              isDisabled={busy}
              onPress={() =>
                void mutate(ref, status === "skipped" || status === "completed" ? "reopen" : "skip")
              }
            >
              {t(
                status === "skipped" || status === "completed"
                  ? "learningPath.reopen"
                  : "learningPath.skip",
              )}
            </Button>
          )}
        </ActionGroup>
        {attempts.some((a) => a.completed) && (
          <Disclosure label={t("learningPath.evidence")}>
            <ItemList>
              {attempts
                .filter((a) => a.completed)
                .flatMap((a) =>
                  a.evidence.map((e, i) => (
                    <li key={`${a.activityId}-${i}`}>
                      <strong>{t(`learningPath.outcomes.${e.outcome}`)}</strong> — {e.evidence}{" "}
                      <Muted>{t(`learningPath.uncertainty.${e.uncertainty}`)}</Muted>
                    </li>
                  )),
                )}
            </ItemList>
            <Button
              onPress={() =>
                onOpenHistory(attempts.flatMap((a) => a.historyEntryIds).slice(0, 100))
              }
            >
              {t("learningPath.openHistory")}
            </Button>
          </Disclosure>
        )}
      </Card>
    );
  };
  const challengeUnits =
    course?.units.filter(
      (unit) =>
        challengeScope === "a1" || unit.stage === challengeScope || unit.id === challengeScope,
    ) ?? [];
  const skills = ["reading", "writing", "listening", "speaking"] as const;
  return (
    <Page title={t("learningPath.title")}>
      <p>{t("learningPath.intro")}</p>
      <ActionGroup>
        {(["course", "progress", "challenges"] as const).map((value) => (
          <Button
            key={value}
            aria-pressed={tab === value}
            variant={tab === value ? "primary" : "secondary"}
            onPress={() => setTab(value)}
          >
            {t(`learningPath.tabs.${value}`)}
          </Button>
        ))}
      </ActionGroup>
      {(error ?? learning.error) && <OperationError error={(error ?? learning.error)!} />}
      <OperationProgress progress={generation.progress} onCancel={generation.cancel} />
      {busy && !generation.busy && (
        <Feedback live="polite">
          {t("learningPath.preparing")}
        </Feedback>
      )}
      {!snapshot && !learning.error && (
        <LoadingState live>{t("learningPath.loading")}</LoadingState>
      )}
      {snapshot && !course && <Feedback live="off">{t("learningPath.courseUnavailable")}</Feedback>}
      {course && state && tab === "course" && (
        <>
          <ActionGroup>
            {(["a1-1", "a1-2"] as const).map((stage) => (
              <Button
                key={stage}
                isDisabled={busy}
                aria-pressed={state.selectedStage === stage}
                onPress={() => {
                  const unit = course.units.find((u) => u.stage === stage)!;
                  void mutate(reference(unit, "learn"), "select");
                }}
              >
                {stage.replace("a", "A").replace("-", ".")}
              </Button>
            ))}
          </ActionGroup>
          {next ? (
            <Card>
              <h2>{t("learningPath.continue")}</h2>
              <p>
                {course.units.find((u) => u.id === next.unitId)?.title[locale]} ·{" "}
                {t(`learningPath.steps.${next.step}`)}
              </p>
              <Button
                variant="primary"
                isDisabled={busy}
                onPress={() =>
                  next.step === "learn" ? void mutate(next, "select") : void launch(next)
                }
              >
                {t("learningPath.continue")}
              </Button>
            </Card>
          ) : (
            <Feedback live="polite">{t("learningPath.stageFinished")}</Feedback>
          )}
          <div className={styles.outline} aria-label={t("learningPath.syllabus")}>
            {course.units
              .filter((u) => u.stage === state.selectedStage)
              .map((unit, index) => (
                <Button
                  key={unit.id}
                  aria-pressed={selected?.id === unit.id}
                  onPress={() => void mutate(reference(unit, "learn"), "select")}
                  isDisabled={busy}
                >
                  {index + 1}. {unit.title[locale]} — {t("learningPath.counts", unitCounts(unit))}
                </Button>
              ))}
          </div>
          {selected && (
            <section key={selected.id} className={styles.unit} aria-label={selected.title[locale]}>
              <h2>{selected.title[locale]}</h2>
              <ItemList>
                {selected.objectives.map((o) => (
                  <li key={o.id}>{o.description[locale]}</li>
                ))}
              </ItemList>
              {selected.prerequisites.length > 0 && (
                <p>
                  {t("learningPath.prerequisites")}{" "}
                  {selected.prerequisites.map((id) => (
                    <Button
                      key={id}
                      variant="quiet"
                      onPress={() => {
                        const unit = course.units.find((u) => u.id === id)!;
                        void mutate(reference(unit, "learn"), "select");
                      }}
                    >
                      {course.units.find((u) => u.id === id)?.title[locale]}
                    </Button>
                  ))}
                </p>
              )}
              <Card>
                <h3>{t("learningPath.grammar")}</h3>
                <p>{selected.grammar[locale]}</p>
                <p className={styles.explanation}>{selected.explanation[locale]}</p>
                <ItemList>
                  {selected.examples.map((e) => (
                    <li key={e.german}>
                      <strong lang="de">{e.german}</strong> — {e.meaning[locale]}
                    </li>
                  ))}
                </ItemList>
                <Disclosure label={t("learningPath.vocabulary")}>
                  <dl className={styles.words}>
                    {selected.vocabulary.map((w) => (
                      <div key={w.german}>
                        <dt lang="de">{w.german}</dt>
                        <dd>{w.meaning[locale]}</dd>
                      </div>
                    ))}
                  </dl>
                </Disclosure>
              </Card>
              <ContentGrid>
                {courseStepSchema.options.map((step) => activityCard(selected, step, "course"))}
              </ContentGrid>
            </section>
          )}
        </>
      )}
      {course && state && tab === "progress" && (
        <>
          <p>{t("learningPath.progressMeaning")}</p>
          <ContentGrid>
            {course.units.map((unit) => (
              <Card key={unit.id}>
                <h2>{unit.title[locale]}</h2>
                <p>{t("learningPath.counts", unitCounts(unit))}</p>
                <Button
                  onPress={() => {
                    setTab("course");
                    void mutate(reference(unit, "learn"), "select");
                  }}
                >
                  {t("learningPath.openUnit")}
                </Button>
              </Card>
            ))}
          </ContentGrid>
          <ContentGrid>
            {skills.map((skill) => {
              const activities = state.activities.filter(
                (a) =>
                  a.reference.version === course.version &&
                  a.completed &&
                  a.reference.step === skill,
              );
              const evidence = activities.flatMap((a) =>
                a.evidence.filter((e) => e.skill === skill),
              );
              return (
                <Card key={skill}>
                  <h2>{t(`history.skills.${skill}`)}</h2>
                  <p>{t("learningPath.skillParticipation", { count: activities.length })}</p>
                  {evidence.length ? (
                    <ItemList>
                      {evidence.slice(0, 3).map((e, i) => (
                        <li key={`${e.objectiveId}-${i}`}>
                          <strong>{t(`learningPath.outcomes.${e.outcome}`)}</strong> — {e.evidence}{" "}
                          <Muted>{t(`learningPath.uncertainty.${e.uncertainty}`)}</Muted>
                        </li>
                      ))}
                    </ItemList>
                  ) : (
                    <Muted as="p">{t("learningPath.noEvidence")}</Muted>
                  )}
                </Card>
              );
            })}
          </ContentGrid>
          <Button onPress={() => onOpenHistory()}>{t("learningPath.historyAndPatterns")}</Button>
        </>
      )}
      {course && state && tab === "challenges" && (
        <>
          <p>{t("learningPath.challengeIntro")}</p>
          <FieldGroup>
            {t("learningPath.challengeScope")}
            <select
              value={challengeScope}
              onChange={(e) => setChallengeScope(e.currentTarget.value)}
            >
              <option value="a1-1">A1.1</option>
              <option value="a1">A1</option>
              {course.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.title[locale]}
                </option>
              ))}
            </select>
          </FieldGroup>
          <p>{t("learningPath.challengeCoverage")}</p>
          <ContentGrid>
            {challengeUnits.flatMap((unit, i) =>
              (challengeUnits.length === 1 ? [...skills] : [skills[i % skills.length]!]).map(
                (skill) => activityCard(unit, skill, "challenge"),
              ),
            )}
          </ContentGrid>
        </>
      )}
      <Card>
        <h2>{t("learningPath.moreLevels")}</h2>
        <ItemList>
          {["A2", "B1", "B2"].map((level) => (
            <li key={level}>
              {level} — {t("learningPath.construction")}
            </li>
          ))}
        </ItemList>
      </Card>
    </Page>
  );
}
