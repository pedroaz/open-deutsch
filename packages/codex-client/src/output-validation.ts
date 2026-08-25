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

export class AppServerOutputValidationError extends Error {
  readonly issues: readonly SafeOutputValidationIssue[];

  constructor(code: string, issues: readonly SafeOutputValidationIssue[] = []) {
    super(code);
    this.name = "AppServerOutputValidationError";
    this.issues = Object.freeze([...issues]);
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
  for (const exercise of output.exercises) {
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
      assertDistinct(answers, "OD_EXERCISE_DUPLICATE_ANSWER");
      const preSubmitText = normalized(
        `${visibleExerciseText(exercise)} ${exercise.hints.join(" ")}`,
      );
      if (answers.some((answer) => containsCompleteAnswer(preSubmitText, answer))) {
        throw new AppServerOutputValidationError("OD_EXERCISE_ANSWER_LEAK");
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
