import {
  courseReferenceSchema,
  courseStepSchema,
  type CourseReference,
  type LearningCourse,
  type LearningPathState,
} from "@open-deutsch/contracts";

export function resolveCourseReference(course: LearningCourse | null, value: CourseReference) {
  const reference = courseReferenceSchema.parse(value);
  const unit = course?.units.find((candidate) => candidate.id === reference.unitId);
  if (!course || course.version !== reference.version || !unit)
    throw new Error("OD_COURSE_REFERENCE_STALE");
  if (
    reference.mode === "challenge" &&
    (reference.step === "learn" || reference.step === "practice")
  )
    throw new Error("OD_COURSE_REFERENCE_INVALID");
  return { reference, unit };
}
export function sameCourseStep(a: CourseReference, b: CourseReference) {
  return a.version === b.version && a.unitId === b.unitId && a.step === b.step && a.mode === b.mode;
}
export function courseStepStatus(state: LearningPathState, reference: CourseReference) {
  const mark = state.marks.find((m) => sameCourseStep(m.reference, reference));
  if (mark) return mark.status;
  const activities = state.activities.filter((a) => sameCourseStep(a.reference, reference));
  if (activities.some((a) => a.completed)) return "completed" as const;
  return activities.length ? ("started" as const) : ("not-started" as const);
}
export function nextCourseStep(
  course: LearningCourse,
  state: LearningPathState,
): CourseReference | null {
  if (
    state.current &&
    state.current.version === course.version &&
    state.current.mode === "course" &&
    courseStepStatus(state, state.current) !== "completed" &&
    courseStepStatus(state, state.current) !== "skipped"
  )
    return state.current;
  const stageUnits = course.units.filter((u) => u.stage === state.selectedStage);
  const start = Math.max(
    0,
    stageUnits.findIndex((u) => u.id === state.current?.unitId),
  );
  const units = [...stageUnits.slice(start), ...stageUnits.slice(0, start)];
  for (const unit of units)
    for (const step of courseStepSchema.options) {
      const reference: CourseReference = {
        version: course.version,
        unitId: unit.id,
        step,
        mode: "course",
      };
      const status = courseStepStatus(state, reference);
      if (status !== "completed" && status !== "skipped") return reference;
    }
  return null;
}
