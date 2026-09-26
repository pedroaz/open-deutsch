import {
  appServerCandidateOutputSchemas,
  type AppServerCandidateOutputMap,
  type AppServerWorkloadInput,
  type AppServerWorkloadKind,
} from "@open-deutsch/contracts";

const maximumStructuredOutputBytes = 512 * 1024;
const maximumIssues = 12;

export type SafeOutputValidationIssue = Readonly<{
  code: string;
  path: readonly (number | "<field>")[];
}>;

export type ExerciseValidationLocation = Readonly<{
  exerciseIndex: number;
  field:
    | "acceptedAnswers"
    | "title"
    | "instructions"
    | "explanation"
    | "question"
    | "leadingText"
    | "followingText"
    | "sentence"
    | "cue"
    | "hint"
    | "combined";
  answerLength?: number;
}>;

export class AppServerOutputValidationError extends Error {
  readonly issues: readonly SafeOutputValidationIssue[];
  readonly location: ExerciseValidationLocation | undefined;

  constructor(
    code: string,
    issues: readonly SafeOutputValidationIssue[] = [],
    location?: ExerciseValidationLocation,
  ) {
    super(code);
    this.name = "AppServerOutputValidationError";
    this.issues = Object.freeze([...issues]);
    this.location = location;
  }
}

function safeIssues(error: {
  readonly issues: readonly {
    readonly code: string;
    readonly path: readonly PropertyKey[];
  }[];
}): readonly SafeOutputValidationIssue[] {
  return Object.freeze(
    error.issues.slice(0, maximumIssues).map((issue) =>
      Object.freeze({
        code: issue.code,
        path: Object.freeze(
          issue.path
            .slice(0, 8)
            .map((segment) => (typeof segment === "number" ? segment : ("<field>" as const))),
        ),
      }),
    ),
  );
}

export function parseAppServerCandidateOutput<Kind extends AppServerWorkloadKind>(
  kind: Kind,
  finalOutput: unknown,
  input?: Extract<AppServerWorkloadInput, { kind: Kind }>,
): AppServerCandidateOutputMap[Kind] {
  if (typeof finalOutput !== "string") {
    throw new AppServerOutputValidationError("OD_APP_SERVER_OUTPUT_NOT_TEXT");
  }
  const byteLength = Buffer.byteLength(finalOutput, "utf8");
  if (byteLength === 0 || byteLength > maximumStructuredOutputBytes) {
    throw new AppServerOutputValidationError("OD_APP_SERVER_OUTPUT_SIZE_INVALID");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(finalOutput) as unknown;
  } catch {
    throw new AppServerOutputValidationError("OD_APP_SERVER_OUTPUT_JSON_INVALID");
  }

  const parsed = appServerCandidateOutputSchemas[kind].safeParse(candidate);
  if (!parsed.success) {
    throw new AppServerOutputValidationError(
      "OD_APP_SERVER_OUTPUT_SCHEMA_INVALID",
      safeIssues(parsed.error),
    );
  }
  if (kind === "exercise-generation") {
    const workloadInput: AppServerWorkloadInput | undefined = input;
    const output = parsed.data as AppServerCandidateOutputMap["exercise-generation"];
    if (workloadInput?.kind === "exercise-generation" && workloadInput.reading) {
      if (
        !output.readingMaterial ||
        (workloadInput.reading.passage !== null &&
          output.readingMaterial.passage !== workloadInput.reading.passage) ||
        !output.exercises.some((exercise) => exercise.kind === "free-writing")
      ) {
        throw new AppServerOutputValidationError("OD_READING_MATERIAL_INVALID");
      }
    } else if (output.readingMaterial) {
      throw new AppServerOutputValidationError("OD_READING_MATERIAL_UNEXPECTED");
    }
    if (workloadInput?.kind === "exercise-generation" && workloadInput.courseTeaching?.objective) {
      const description = workloadInput.courseTeaching.objective.description;
      if (output.exercises.some((exercise) => exercise.objectives.length !== 1 || exercise.objectives[0] !== description) ||
        (workloadInput.learningPath?.step === "writing" && output.exercises.some((exercise) => exercise.kind !== "free-writing"))) {
        throw new AppServerOutputValidationError("OD_COURSE_OBJECTIVE_MISMATCH");
      }
    }
    assertExerciseGenerationQuality(
      parsed.data as AppServerCandidateOutputMap["exercise-generation"],
      workloadInput?.kind === "exercise-generation"
        ? workloadInput.calibration.approximateLevel
        : undefined,
      workloadInput?.kind === "exercise-generation"
        ? workloadInput.requestedExerciseCount
        : undefined,
    );
  }
  return parsed.data as AppServerCandidateOutputMap[Kind];
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replaceAll(/\s+/gu, " ").toLocaleLowerCase("de-DE");
}

function containsCompleteAnswer(text: string, answer: string): boolean {
  const haystack = normalized(text);
  const needle = normalized(answer);
  if (needle.length < 3) return false;
  let position = haystack.indexOf(needle);
  while (position >= 0) {
    const before = haystack.slice(Math.max(0, position - 1), position);
    const after = haystack.slice(position + needle.length, position + needle.length + 1);
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
      return true;
    }
    position = haystack.indexOf(needle, position + 1);
  }
  return false;
}

function assertDistinct(values: readonly string[], code: string): void {
  const keys = values.map(normalized);
  if (new Set(keys).size !== keys.length) {
    throw new AppServerOutputValidationError(code);
  }
}

function exerciseSignature(
  exercise: AppServerCandidateOutputMap["exercise-generation"]["exercises"][number],
): string {
  if (exercise.kind === "free-writing") return `${exercise.kind}:${normalized(exercise.prompt)}`;
  if (exercise.kind === "short-answer") return `${exercise.kind}:${normalized(exercise.question)}`;
  if (exercise.kind === "fill-in-the-blank") {
    return `${exercise.kind}:${normalized(
      exercise.leadingText + exercise.blanks.map(({ followingText }) => followingText).join(""),
    )}`;
  }
  if (exercise.kind === "sentence-correction") {
    return `${exercise.kind}:${normalized(exercise.sentence)}`;
  }
  if (exercise.kind === "multiple-choice") {
    return `${exercise.kind}:${normalized(exercise.question)}`;
  }
  return `${exercise.kind}:${exercise.direction}:${normalized(exercise.cue)}`;
}

function visibleExerciseText(
  exercise: AppServerCandidateOutputMap["exercise-generation"]["exercises"][number],
): string {
  const shared = [exercise.title, exercise.instructions, exercise.explanation ?? ""];
  if (exercise.kind === "free-writing") shared.push(exercise.prompt);
  else if (exercise.kind === "short-answer" || exercise.kind === "multiple-choice") {
    shared.push(exercise.question);
  } else if (exercise.kind === "fill-in-the-blank") {
    shared.push(exercise.leadingText, ...exercise.blanks.map(({ followingText }) => followingText));
  } else if (exercise.kind === "sentence-correction") shared.push(exercise.sentence);
  else shared.push(exercise.cue);
  return normalized(shared.join(" "));
}

function answerLeakLocation(
  exercise: AppServerCandidateOutputMap["exercise-generation"]["exercises"][number],
  answer: string,
  exerciseIndex: number,
): ExerciseValidationLocation {
  const fields: { field: ExerciseValidationLocation["field"]; text: string }[] = [
    { field: "title", text: exercise.title },
    { field: "instructions", text: exercise.instructions },
    { field: "explanation", text: exercise.explanation ?? "" },
  ];
  if (exercise.kind === "short-answer" || exercise.kind === "multiple-choice") {
    fields.push({ field: "question", text: exercise.question });
  } else if (exercise.kind === "fill-in-the-blank") {
    fields.push({ field: "leadingText", text: exercise.leadingText });
    fields.push(
      ...exercise.blanks.map(({ followingText }) => ({
        field: "followingText" as const,
        text: followingText,
      })),
    );
  } else if (exercise.kind === "sentence-correction") {
    fields.push({ field: "sentence", text: exercise.sentence });
  } else if (exercise.kind === "vocabulary-recall") {
    fields.push({ field: "cue", text: exercise.cue });
  }
  fields.push(...exercise.hints.map((text) => ({ field: "hint" as const, text })));
  const field = fields.find(({ text }) => containsCompleteAnswer(text, answer))?.field ?? "combined";
  return { exerciseIndex, field, answerLength: normalized(answer).length };
}

function assertExerciseGenerationQuality(
  output: AppServerCandidateOutputMap["exercise-generation"],
  expectedLevel?: "A1" | "A2" | "B1" | "B2",
  expectedExerciseCount?: number,
): void {
  if (expectedExerciseCount !== undefined && output.exercises.length !== expectedExerciseCount) {
    throw new AppServerOutputValidationError("OD_EXERCISE_COUNT_MISMATCH");
  }
  assertDistinct(
    output.exercises.map(({ title }) => title),
    "OD_EXERCISE_DUPLICATE_TITLE",
  );
  assertDistinct(output.exercises.map(exerciseSignature), "OD_EXERCISE_DUPLICATE_CONTENT");
  for (const [exerciseIndex, exercise] of output.exercises.entries()) {
    if (expectedLevel && exercise.cefrBand !== expectedLevel) {
      throw new AppServerOutputValidationError("OD_EXERCISE_LEVEL_MISMATCH");
    }
    const answerGroups =
      exercise.kind === "fill-in-the-blank"
        ? exercise.blanks.map(({ acceptedAnswers }) => acceptedAnswers)
        : exercise.kind === "short-answer" ||
            exercise.kind === "sentence-correction" ||
            exercise.kind === "vocabulary-recall"
          ? [exercise.acceptedAnswers]
          : exercise.kind === "multiple-choice"
            ? [[exercise.options[exercise.correctOptionPosition] ?? ""]]
            : [];
    if (exercise.kind === "multiple-choice") {
      assertDistinct(exercise.options, "OD_EXERCISE_DUPLICATE_OPTION");
    }
    for (const answers of answerGroups) {
      if (new Set(answers.map(normalized)).size !== answers.length) {
        throw new AppServerOutputValidationError("OD_EXERCISE_DUPLICATE_ANSWER", [], {
          exerciseIndex,
          field: "acceptedAnswers",
        });
      }
      const preSubmitText = normalized(
        `${visibleExerciseText(exercise)} ${exercise.hints.join(" ")}`,
      );
      const leakedAnswer = answers.find((answer) => containsCompleteAnswer(preSubmitText, answer));
      if (leakedAnswer !== undefined) {
        throw new AppServerOutputValidationError(
          "OD_EXERCISE_ANSWER_LEAK",
          [],
          answerLeakLocation(exercise, leakedAnswer, exerciseIndex),
        );
      }
    }
  }
  if (output.lesson) {
    assertDistinct(
      output.lesson.sections.map(({ heading }) => heading),
      "OD_LESSON_DUPLICATE_SECTION",
    );
    assertDistinct(
      output.lesson.vocabularyFoundations.map(({ german }) => german),
      "OD_LESSON_DUPLICATE_VOCABULARY",
    );
  }
}

export function repairIssueCodes(error: AppServerOutputValidationError): readonly string[] {
  const codes = new Set<string>([error.message]);
  for (const issue of error.issues) codes.add(issue.code);
  return Object.freeze([...codes].slice(0, maximumIssues + 1));
}
