import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  courseEvidenceSchema,
  learningCourseSchema,
  learningPathStateSchema,
  learningPathUpdateSchema,
  preparedActivitySchema,
  type CourseEvidence,
  type LearningCourse,
} from "@open-deutsch/contracts";
import { resolveCourseReference } from "@open-deutsch/domain";
import { withLeasedConnection, withLeasedTransaction, type OpenDeutschDatabase } from "./sqlite.js";

export async function readLearningCourse(curriculumRoot: string): Promise<LearningCourse | null> {
  let source: string;
  try {
    source = await readFile(path.join(curriculumRoot, "learning-path.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("OD_COURSE_UNAVAILABLE");
  }
  if (source.length > 2_000_000) throw new Error("OD_COURSE_INVALID");
  return learningCourseSchema.parse(JSON.parse(source));
}

export function saveCourseEvidence(
  connection: DatabaseSync,
  input: {
    activityId: string;
    historyEntryId: string;
    occurredAt: string;
    evidence: CourseEvidence[];
  },
) {
  const activity = connection
    .prepare("SELECT context_json FROM prepared_activities WHERE activity_id = ?")
    .get(input.activityId) as { context_json: string } | undefined;
  if (!activity) throw new Error("OD_COURSE_ACTIVITY_MISSING");
  const reference = preparedActivitySchema.shape.context.parse(
    JSON.parse(activity.context_json),
  ).learningPath;
  if (!reference) return;
  connection
    .prepare(
      "INSERT INTO course_results (history_entry_id, activity_id, occurred_at, evidence_json) VALUES (?, ?, ?, ?)",
    )
    .run(
      input.historyEntryId,
      input.activityId,
      input.occurredAt,
      JSON.stringify(input.evidence.map((e) => courseEvidenceSchema.parse(e))),
    );
  if (reference.mode === "course")
    connection
      .prepare("DELETE FROM course_marks WHERE version = ? AND unit_id = ? AND step = ?")
      .run(reference.version, reference.unitId, reference.step);
}

export async function readLearningPathState(database: OpenDeutschDatabase) {
  return withLeasedConnection(database, (connection) => {
    const selection = connection
      .prepare("SELECT selected_stage, current_json FROM course_selection WHERE singleton = 1")
      .get() as { selected_stage: string; current_json: string | null } | undefined;
    const marks = connection
      .prepare("SELECT version, unit_id, step, status, updated_at FROM course_marks")
      .all() as {
      version: string;
      unit_id: string;
      step: string;
      status: string;
      updated_at: string;
    }[];
    const activities = connection
      .prepare(
        `SELECT a.activity_id, a.context_json, a.status, a.completed_at,
      (SELECT count(*) FROM course_results r WHERE r.activity_id = a.activity_id AND r.occurred_at = a.completed_at) AS result_count,
      (SELECT json_array_length(p.output_json, '$.exercises') FROM generated_activity_payloads p WHERE p.activity_id = a.activity_id) AS expected_count
      FROM prepared_activities a WHERE json_type(a.context_json, '$.learningPath') = 'object'
      ORDER BY a.prepared_at DESC LIMIT 2000`,
      )
      .all() as {
      activity_id: string;
      context_json: string;
      status: string;
      completed_at: string | null;
      result_count: number;
      expected_count: number | null;
    }[];
    return learningPathStateSchema.parse({
      selectedStage: selection?.selected_stage ?? "a1-1",
      current: selection?.current_json ? JSON.parse(selection.current_json) : null,
      marks: marks.map((m) => ({
        reference: { version: m.version, unitId: m.unit_id, step: m.step, mode: "course" },
        status: m.status,
        updatedAt: m.updated_at,
      })),
      activities: activities.map((a) => {
        const results = connection
          .prepare(
            "SELECT history_entry_id, evidence_json FROM course_results WHERE activity_id = ? AND occurred_at = (SELECT max(occurred_at) FROM course_results WHERE activity_id = ?) ORDER BY history_entry_id",
          )
          .all(a.activity_id, a.activity_id) as {
          history_entry_id: string;
          evidence_json: string;
        }[];
        return {
          reference: preparedActivitySchema.shape.context.parse(JSON.parse(a.context_json))
            .learningPath,
          activityId: a.activity_id,
          completed: a.status === "completed" && a.result_count === (a.expected_count ?? 1),
          historyEntryIds: results.map((r) => r.history_entry_id),
          evidence: results.flatMap((r) => JSON.parse(r.evidence_json) as unknown[]),
        };
      }),
    });
  });
}

export async function updateLearningPath(
  database: OpenDeutschDatabase,
  course: LearningCourse,
  raw: unknown,
) {
  const input = learningPathUpdateSchema.parse(raw);
  if (input.expectedGeneration !== database.rootGeneration) throw new Error("OD_DATA_ROOT_STALE");
  const { reference, unit } = resolveCourseReference(course, input.reference);
  if (reference.mode !== "course") throw new Error("OD_COURSE_REFERENCE_INVALID");
  if (input.action === "complete-explanation" && reference.step !== "learn")
    throw new Error("OD_COURSE_COMPLETION_INVALID");
  await withLeasedTransaction(database, (connection) => {
    connection
      .prepare(
        `INSERT INTO course_selection (singleton, selected_stage, current_json) VALUES (1, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET selected_stage = excluded.selected_stage, current_json = excluded.current_json`,
      )
      .run(unit.stage, JSON.stringify(reference));
    if (input.action !== "select")
      connection
        .prepare(
          `INSERT INTO course_marks (version, unit_id, step, status, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(version, unit_id, step) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        )
        .run(
          reference.version,
          reference.unitId,
          reference.step,
          input.action === "complete-explanation"
            ? "completed"
            : input.action === "skip"
              ? "skipped"
              : "not-started",
          new Date().toISOString(),
        );
  });
}
