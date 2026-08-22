import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  activityIdSchema,
  activityCreateInputSchema,
  activityCreateResultSchema,
  attemptFeedbackSaveInputSchema,
  attemptFeedbackSaveResultSchema,
  listeningResultSaveInputSchema,
  listeningResultSaveResultSchema,
  calendarDateSchema,
  curriculumCoverageReadInputSchema,
  curriculumCoverageReadResultSchema,
  errorDefinitions,
  learnerContextReadInputSchema,
  learnerContextReadResultSchema,
  mcpToolContracts,
  openDeutschErrorSchema,
  practiceContextReadInputSchema,
  practiceContextReadResultSchema,
  voiceSummarySaveInputSchema,
  voiceSummarySaveResultSchema,
  weeklyPlanReplacementInputSchema,
  weeklyPlanReplacementResultSchema,
  type ErrorKind,
  utcInstantSchema,
} from "@open-deutsch/contracts";
import {
  aiProvenanceSchema,
  curriculumManifestSchema,
  selectNextCurriculumGap,
  selectWeeklyPlanRecommendation,
  voiceSummarySchema,
  weeklyPlanSchema,
} from "@open-deutsch/domain";
import {
  assertCurrentDataRootLease,
  OpenDeutschRepository,
  openOpenDeutschDatabase,
  readBootstrapPointer,
  resolveDataRootLayout,
  type OpenDeutschDatabase,
} from "@open-deutsch/persistence";
import { parse as parseYaml } from "yaml";

const serverName = "open-deutsch";
const serverVersion = "0.1.0";
const thisFile = fileURLToPath(import.meta.url);

type Runtime = Readonly<{
  bootstrapFile: string;
  dataRoot: string;
  rootGeneration: number;
  database: OpenDeutschDatabase;
  repository: OpenDeutschRepository;
}>;

function deterministicId(
  prefix: "activity" | "attempt" | "model-request" | "plan" | "voice-session",
  key: string,
) {
  return `${prefix}_${createHash("sha256").update(key, "utf8").digest("hex").slice(0, 32)}`;
}

function now() {
  return new Date().toISOString();
}

function safeError(kind: ErrorKind) {
  const definition = errorDefinitions[kind];
  const correlationId = `correlation_${randomUUID().replaceAll("-", "")}`;
  const occurredAt = now();
  return openDeutschErrorSchema.parse({
    schemaVersion: 1,
    kind,
    code: definition.code,
    messageKey: definition.messageKey,
    reference: { code: definition.code, correlationId, occurredAt },
  });
}

function successResult(summary: string, data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: { status: "ok", summary, data },
  };
}

function failureResult(kind: ErrorKind, summary: string): CallToolResult {
  const error = safeError(kind);
  return {
    isError: true,
    content: [{ type: "text", text: `${error.code}: ${summary}` }],
    structuredContent: { status: "error", summary, error },
  };
}

async function readManifest(): Promise<ReturnType<typeof curriculumManifestSchema.parse>> {
  const configured = process.env["OPEN_DEUTSCH_CURRICULUM_ROOT"];
  const root = configured
    ? path.resolve(configured)
    : path.resolve(path.dirname(thisFile), "../../../content/curriculum");
  const parsed: unknown = parseYaml(
    await readFile(path.join(root, "manifest.yaml"), "utf8"),
  ) as unknown;
  return curriculumManifestSchema.parse(parsed);
}

async function writeLog(runtime: Runtime, event: string, kind?: ErrorKind) {
  const layout = resolveDataRootLayout(runtime.dataRoot);
  await mkdir(layout.logs, { recursive: true, mode: 0o700 });
  if ((await realpath(layout.logs)) !== layout.logs) throw new Error("OD_LOG_DIRECTORY_INVALID");
  const logFile = path.join(layout.logs, "mcp-server.log");
  const current = await stat(logFile).catch(() => undefined);
  if (current && current.size >= 5 * 1024 * 1024) {
    await rm(`${logFile}.9`, { force: true });
    for (let index = 8; index >= 1; index -= 1) {
      await rename(`${logFile}.${String(index)}`, `${logFile}.${String(index + 1)}`).catch(
        (error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        },
      );
    }
    await rename(logFile, `${logFile}.1`);
  }
  const line = `${now()} INFO mcp ${event}${kind ? ` code=${errorDefinitions[kind].code}` : ""}\n`;
  await appendFile(logFile, line, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function openRuntimeFromEnvironment(): Promise<Runtime> {
  const bootstrapFile = process.env["OPEN_DEUTSCH_BOOTSTRAP_FILE"] ?? "";
  if (!path.isAbsolute(bootstrapFile) || bootstrapFile.includes("\0")) {
    throw new Error("OD_MCP_BOOTSTRAP_INVALID");
  }
  const state = await readBootstrapPointer(bootstrapFile);
  if (state.status !== "ready") throw new Error("OD_MCP_DATA_ROOT_UNAVAILABLE");
  const database = await openOpenDeutschDatabase({
    bootstrapFile,
    dataRoot: state.dataRoot,
    rootGeneration: state.rootGeneration,
  });
  const runtime = {
    bootstrapFile,
    dataRoot: state.dataRoot,
    rootGeneration: state.rootGeneration,
    database,
    repository: new OpenDeutschRepository(database),
  } satisfies Runtime;
  await writeLog(runtime, "startup-ready");
  return runtime;
}

async function withFreshRoot<T>(runtime: Runtime, operation: () => Promise<T>) {
  await assertCurrentDataRootLease({
    bootstrapFile: runtime.bootstrapFile,
    dataRoot: runtime.dataRoot,
    rootGeneration: runtime.rootGeneration,
  });
  return operation();
}

async function withInputFreshRoot<T>(
  runtime: Runtime,
  generation: number,
  operation: () => Promise<T>,
) {
  if (generation !== runtime.rootGeneration) throw new Error("OD_DATA_ROOT_STALE");
  return withFreshRoot(runtime, operation);
}

function activityType(
  kind: "writing" | "grammar" | "vocabulary" | "reading" | "listening" | "speaking" | "placement",
) {
  if (kind === "vocabulary") return "vocabulary-review" as const;
  if (kind === "listening") return "codex-listening" as const;
  if (kind === "speaking") return "voice-speaking" as const;
  return kind;
}

function makeCodexPlan(input: ReturnType<typeof weeklyPlanReplacementInputSchema.parse>) {
  const generatedAt = now();
  return weeklyPlanSchema.parse({
    schemaVersion: 1,
    planId: deterministicId("plan", input.idempotencyKey),
    role: "advisory",
    weekStartsOn: calendarDateSchema.parse(input.plan.weekStartsOn),
    requestedFrom: "codex",
    aiProvenance: aiProvenanceSchema.parse({
      source: "ai",
      producer: "codex-host",
      modelRequestId: deterministicId("model-request", input.idempotencyKey),
      generatedAt,
      modelSelection: { availability: "not-reported" },
    }),
    goals: input.plan.goals.map((goal) => ({
      title: goal.title,
      outcome: goal.rationale,
      suggestedActivities: goal.suggestions.map((suggestion) => ({
        kind: "custom-lesson" as const,
        title: suggestion.slice(0, 160),
        rationale: goal.rationale,
        naturalRequest: suggestion,
        estimatedMinutes: 15,
        context: { curriculumTopicIds: [], mistakeIds: [], vocabularyIds: [] },
      })),
    })),
  });
}

export function createProductionServer(runtime: Runtime) {
  let writeQueue = Promise.resolve();
  const serializeWrite = <T>(operation: () => Promise<T>) => {
    const next = writeQueue.then(operation, operation);
    writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  const server = new McpServer(
    { name: serverName, version: serverVersion },
    {
      instructions:
        "Open Deutsch provides bounded local learner context and explicit learning writes.",
    },
  );

  server.registerTool(
    "open_deutsch_read_learner_context",
    {
      ...mcpToolContracts.open_deutsch_read_learner_context,
      inputSchema: learnerContextReadInputSchema,
      outputSchema: learnerContextReadResultSchema,
    },
    async (raw) => {
      try {
        const input = learnerContextReadInputSchema.parse(raw);
        return await withInputFreshRoot(runtime, input.dataRootGeneration, async () => {
          const settings = await runtime.repository.readCurrentLearnerSettings();
          if (!settings) return failureResult("not-found", "No learner profile is configured yet.");
          const data = {
            learnerId: settings.profile.learnerId,
            approximateLevel: settings.profile.levelEstimate.currentLevel.toUpperCase() as
              "A1" | "A2" | "B1" | "B2",
            everydayLifeGoal: settings.profile.everydayGermanyGoal,
            availableMinutesPerWeek: settings.profile.availableStudyMinutesPerWeek,
            explanationLanguage: settings.profile.teachingLanguage,
            teachingProfile:
              settings.profile.defaultTeachingProfileId === "strict-corrector"
                ? ("strict-corrector" as const)
                : ("conversation-partner" as const),
          };
          void input;
          return successResult("Learner context is ready.", data);
        });
      } catch (error) {
        await writeLog(
          runtime,
          "learner-context-failed",
          error instanceof Error && error.message.includes("STALE") ? "stale-data-root" : "mcp",
        );
        return failureResult(
          error instanceof Error && error.message.includes("STALE")
            ? "stale-data-root"
            : "validation",
          "Learner context is unavailable.",
        );
      }
    },
  );

  server.registerTool(
    "open_deutsch_read_practice_context",
    {
      ...mcpToolContracts.open_deutsch_read_practice_context,
      inputSchema: practiceContextReadInputSchema,
      outputSchema: practiceContextReadResultSchema,
    },
    async (raw) => {
      try {
        const input = practiceContextReadInputSchema.parse(raw);
        return await withInputFreshRoot(runtime, input.dataRootGeneration, async () => {
          const snapshot = await runtime.repository.readDashboardSnapshot(now().slice(0, 10));
          const recommendation = snapshot.weeklyPlan
            ? selectWeeklyPlanRecommendation({
                plan: snapshot.weeklyPlan,
                dueVocabularyIds: snapshot.dueVocabulary.map(({ vocabularyId }) => vocabularyId),
                relevantMistakeIds: snapshot.recurringMistakes.map(({ mistakeId }) => mistakeId),
              })
            : null;
          const maximum = input.maximumItemsPerSection;
          const include = (section: "recommendation" | "mistakes" | "vocabulary" | "weekly-plan") =>
            input.focus === "all" || input.focus === section;
          const data = {
            currentPlan:
              include("weekly-plan") && snapshot.weeklyPlan
                ? {
                    planId: snapshot.weeklyPlan.planId,
                    summary: snapshot.weeklyPlan.goals
                      .map(({ title }) => title)
                      .join("; ")
                      .slice(0, 500),
                    goalCount: snapshot.weeklyPlan.goals.length,
                  }
                : null,
            mistakes: include("mistakes")
              ? snapshot.recurringMistakes.slice(0, maximum).map((mistake) => ({
                  mistakeId: mistake.mistakeId,
                  category: mistake.category.categoryKey,
                  occurrenceCount: mistake.occurrenceCount,
                  summary: `Recurring ${mistake.category.categoryKey} evidence observed ${String(mistake.occurrenceCount)} times.`,
                }))
              : [],
            dueVocabulary: include("vocabulary")
              ? snapshot.dueVocabulary
                  .slice(0, maximum)
                  .map(({ vocabularyId, lemma, dueOn }) => ({ vocabularyId, lemma, dueOn }))
              : [],
            recommendation:
              include("recommendation") && recommendation
                ? {
                    primary: recommendation.primary.title,
                    alternatives: recommendation.alternatives.map(({ title }) => title),
                  }
                : null,
          };
          return successResult("Practice context is ready.", data);
        });
      } catch (error) {
        await writeLog(
          runtime,
          "practice-context-failed",
          error instanceof Error && error.message.includes("STALE") ? "stale-data-root" : "mcp",
        );
        return failureResult(
          error instanceof Error && error.message.includes("STALE")
            ? "stale-data-root"
            : "validation",
          "Practice context is unavailable.",
        );
      }
    },
  );

  server.registerTool(
    "open_deutsch_read_curriculum_coverage",
    {
      ...mcpToolContracts.open_deutsch_read_curriculum_coverage,
      inputSchema: curriculumCoverageReadInputSchema,
      outputSchema: curriculumCoverageReadResultSchema,
    },
    async (raw) => {
      try {
        const input = curriculumCoverageReadInputSchema.parse(raw);
        const manifest = await withInputFreshRoot(runtime, input.dataRootGeneration, readManifest);
        const entries = (["a1", "a2", "b1", "b2"] as const)
          .flatMap((band) =>
            input.band && input.band.toLowerCase() !== band
              ? []
              : manifest.bands[band].map((entry) => ({ ...entry, band })),
          )
          .filter((entry) => !input.domain || entry.domain === input.domain);
        return successResult("Curriculum coverage is ready.", {
          matchingTopicCount: entries.length,
          foundationReadyCount: entries.filter(({ status }) => status === "foundation-ready")
            .length,
          gaps: entries
            .filter(({ status }) => status !== "foundation-ready")
            .slice(0, 100)
            .map((entry) => ({
              topicId: entry.topicId,
              band: entry.band.toUpperCase() as "A1" | "A2" | "B1" | "B2",
              domain: entry.domain,
              summary: `Topic foundation is ${entry.status.replaceAll("-", " ")}.`,
            })),
          nextGap: (() => {
            const gap = selectNextCurriculumGap(manifest, {
              ...(input.band === undefined
                ? {}
                : { band: input.band.toLowerCase() as "a1" | "a2" | "b1" | "b2" }),
              ...(input.domain === undefined ? {} : { domain: input.domain }),
            });
            return gap === null
              ? null
              : { ...gap, band: gap.band.toUpperCase() as "A1" | "A2" | "B1" | "B2" };
          })(),
        });
      } catch (error) {
        await writeLog(
          runtime,
          "curriculum-coverage-failed",
          error instanceof Error && error.message.includes("STALE") ? "stale-data-root" : "mcp",
        );
        return failureResult(
          error instanceof Error && error.message.includes("STALE")
            ? "stale-data-root"
            : "validation",
          "Curriculum coverage is unavailable.",
        );
      }
    },
  );

  server.registerTool(
    "open_deutsch_create_activity",
    {
      ...mcpToolContracts.open_deutsch_create_activity,
      inputSchema: activityCreateInputSchema,
      outputSchema: activityCreateResultSchema,
    },
    async (raw) => {
      const perform = async () => {
        try {
          const input = activityCreateInputSchema.parse(raw);
          return await withInputFreshRoot(runtime, input.dataRootGeneration, async () => {
            const activityId = activityIdSchema.parse(
              deterministicId("activity", input.idempotencyKey),
            );
            const naturalRequest = (
              input.activity.naturalRequest ?? input.activity.instructions
            ).slice(0, 1_000);
            const result = await runtime.repository.savePreparedActivity(
              {
                activityId,
                activityType: activityType(input.activity.kind),
                title: input.activity.title,
                originSurface: "codex",
                context: {
                  naturalRequest,
                  instructions: input.activity.instructions,
                  curriculumTopicIds: input.activity.curriculumTopicIds,
                  mistakeIds: [],
                  vocabularyIds: [],
                  ...(input.activity.voiceContext
                    ? { voiceContext: input.activity.voiceContext }
                    : {}),
                },
                preparedAt: utcInstantSchema.parse(now()),
              },
              input.idempotencyKey,
            );
            return successResult(
              result.replayed
                ? "Activity already existed."
                : "Activity created on the Open Deutsch dashboard.",
              {
                activityId,
                destinationSurface: input.activity.destinationSurface,
                persistence: "until-completed-or-deleted" as const,
                replayed: result.replayed,
              },
            );
          });
        } catch (error) {
          await writeLog(
            runtime,
            "activity-create-failed",
            error instanceof Error && error.message.includes("STALE") ? "stale-data-root" : "mcp",
          );
          return failureResult(
            error instanceof Error && error.message.includes("STALE")
              ? "stale-data-root"
              : error instanceof Error && error.message.includes("CONFLICT")
                ? "conflict"
                : "validation",
            "The activity could not be created.",
          );
        }
      };
      return serializeWrite(perform);
    },
  );

  server.registerTool(
    "open_deutsch_replace_weekly_plan",
    {
      ...mcpToolContracts.open_deutsch_replace_weekly_plan,
      inputSchema: weeklyPlanReplacementInputSchema,
      outputSchema: weeklyPlanReplacementResultSchema,
    },
    async (raw) =>
      serializeWrite(async () => {
        try {
          const input = weeklyPlanReplacementInputSchema.parse(raw);
          return await withInputFreshRoot(runtime, input.dataRootGeneration, async () => {
            const snapshot = await runtime.repository.readDashboardSnapshot(now().slice(0, 10));
            const currentId = snapshot.weeklyPlan?.planId ?? null;
            const requestedPlanId = deterministicId("plan", input.idempotencyKey);
            if (currentId !== input.expectedCurrentPlanId && currentId !== requestedPlanId)
              return failureResult("conflict", "The weekly plan changed before confirmation.");
            const plan = makeCodexPlan(input);
            const result = await runtime.repository.replaceWeeklyPlan(
              plan,
              now(),
              input.idempotencyKey,
            );
            return successResult(
              result.replayed
                ? "Weekly plan replacement already existed."
                : "Advisory weekly plan replaced.",
              {
                planId: plan.planId,
                replacedPlanId: currentId,
                replayed: result.replayed,
              },
            );
          });
        } catch (error) {
          await writeLog(
            runtime,
            "weekly-plan-replace-failed",
            error instanceof Error && error.message.includes("STALE") ? "stale-data-root" : "mcp",
          );
          return failureResult(
            error instanceof Error && error.message.includes("STALE")
              ? "stale-data-root"
              : error instanceof Error && error.message.includes("CONFLICT")
                ? "conflict"
                : "validation",
            "The weekly plan could not be replaced.",
          );
        }
      }),
  );

  server.registerTool(
    "open_deutsch_save_voice_summary",
    {
      ...mcpToolContracts.open_deutsch_save_voice_summary,
      inputSchema: voiceSummarySaveInputSchema,
      outputSchema: voiceSummarySaveResultSchema,
    },
    async (raw) =>
      serializeWrite(async () => {
        try {
          const input = voiceSummarySaveInputSchema.parse(raw);
          return await withInputFreshRoot(runtime, input.dataRootGeneration, async () => {
            const settings = await runtime.repository.readCurrentLearnerSettings();
            if (!settings)
              return failureResult("not-found", "No learner profile is configured yet.");
            const summary = voiceSummarySchema.parse({
              schemaVersion: 1,
              voiceSessionId: deterministicId("voice-session", input.idempotencyKey),
              summarizedAt: input.summary.occurredAt,
              scenario: {
                title: input.summary.scenario,
                topic: input.summary.topic,
                targetLevel: settings.profile.levelEstimate.currentLevel,
                speakingGoals: [input.summary.topic],
              },
              duration:
                input.summary.durationMilliseconds === null
                  ? { status: "not-reported" }
                  : { status: "known", milliseconds: input.summary.durationMilliseconds },
              observedIssues: input.summary.observedIssues.map((observation) => ({
                category: "vocabulary" as const,
                observation,
                evidenceSummary: observation,
                feedback: observation,
                uncertainty: { level: "none" as const },
              })),
              vocabulary: input.summary.vocabularyNotes.map((note) => ({
                lemma: note.slice(0, 160),
                meaning: note.slice(0, 500),
                contextSummary: note.slice(0, 500),
              })),
              feedback: {
                summary: input.summary.feedback,
                strengths: [],
                priorities: input.summary.nextSteps.slice(0, 12),
                uncertainty: { level: "none" as const },
              },
              nextSteps: input.summary.nextSteps.map((nextStep) => ({
                title: nextStep.slice(0, 160),
                rationale: nextStep.slice(0, 500),
                naturalRequest: nextStep.slice(0, 1_000),
              })),
            });
            const result = await runtime.repository.saveVoiceSummary(summary, input.idempotencyKey);
            return successResult(
              result.replayed
                ? "Voice summary already existed."
                : "Voice summary saved to History.",
              { voiceSessionId: summary.voiceSessionId, replayed: result.replayed },
            );
          });
        } catch (error) {
          await writeLog(
            runtime,
            "voice-summary-failed",
            error instanceof Error && error.message.includes("STALE") ? "stale-data-root" : "mcp",
          );
          return failureResult(
            error instanceof Error && error.message.includes("STALE")
              ? "stale-data-root"
              : error instanceof Error && error.message.includes("CONFLICT")
                ? "conflict"
                : "validation",
            "The Voice summary could not be saved.",
          );
        }
      }),
  );

  server.registerTool(
    "open_deutsch_save_listening_result",
    {
      ...mcpToolContracts.open_deutsch_save_listening_result,
      inputSchema: listeningResultSaveInputSchema,
      outputSchema: listeningResultSaveResultSchema,
    },
    async (raw) =>
      serializeWrite(async () => {
        try {
          const input = listeningResultSaveInputSchema.parse(raw);
          return await withInputFreshRoot(runtime, input.dataRootGeneration, async () => {
            const attemptId = deterministicId("attempt", input.idempotencyKey);
            const result = await runtime.repository.saveListeningResult({
              attemptId,
              activityId: input.activityId,
              expectedActivityRevision: input.expectedActivityRevision,
              result: input.result,
              occurredAt: input.occurredAt,
              idempotencyKey: input.idempotencyKey,
            });
            return successResult(
              result.replayed
                ? "Listening result already existed."
                : "Structured listening result saved to History.",
              {
                attemptId,
                activityId: input.activityId,
                historyEntryId: result.historyEntryId,
                replayed: result.replayed,
              },
            );
          });
        } catch (error) {
          await writeLog(
            runtime,
            "listening-result-failed",
            error instanceof Error && error.message.includes("STALE") ? "stale-data-root" : "mcp",
          );
          return failureResult(
            error instanceof Error && error.message.includes("STALE")
              ? "stale-data-root"
              : error instanceof Error && error.message.includes("NOT_FOUND")
                ? "not-found"
                : error instanceof Error && error.message.includes("CONFLICT")
                  ? "conflict"
                  : "validation",
            "The structured listening result could not be saved.",
          );
        }
      }),
  );

  server.registerTool(
    "open_deutsch_save_attempt_feedback",
    {
      ...mcpToolContracts.open_deutsch_save_attempt_feedback,
      inputSchema: attemptFeedbackSaveInputSchema,
      outputSchema: attemptFeedbackSaveResultSchema,
    },
    async (raw) =>
      serializeWrite(async () => {
        try {
          const input = attemptFeedbackSaveInputSchema.parse(raw);
          return await withInputFreshRoot(runtime, input.dataRootGeneration, async () => {
            const attemptId = deterministicId("attempt", input.idempotencyKey);
            const result = await runtime.repository.saveMcpAttemptFeedback({
              attemptId,
              activityId: input.activityId,
              expectedActivityRevision: input.expectedActivityRevision,
              feedback: input.feedback,
              savedAt: utcInstantSchema.parse(now()),
              idempotencyKey: input.idempotencyKey,
            });
            return successResult(
              result.replayed
                ? "Attempt feedback already existed."
                : "Attempt feedback saved to History.",
              { attemptId, activityId: input.activityId, replayed: result.replayed },
            );
          });
        } catch (error) {
          await writeLog(
            runtime,
            "attempt-feedback-failed",
            error instanceof Error && error.message.includes("STALE") ? "stale-data-root" : "mcp",
          );
          const message = error instanceof Error ? error.message : "";
          return failureResult(
            message.includes("STALE")
              ? "stale-data-root"
              : message.includes("NOT_FOUND")
                ? "not-found"
                : message.includes("CONFLICT")
                  ? "conflict"
                  : "validation",
            "Attempt feedback could not be saved.",
          );
        }
      }),
  );

  return server;
}

export async function main() {
  let runtime: Runtime | undefined;
  try {
    runtime = await openRuntimeFromEnvironment();
    const activeRuntime = runtime;
    const handle = serveStdio(() => createProductionServer(activeRuntime), {
      onerror: () => {
        if (runtime) void writeLog(runtime, "protocol-error", "mcp");
        process.stderr.write("OD_MCP_PROTOCOL_ERROR\n");
      },
    });
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        void handle.close().finally(() => {
          runtime?.database.close();
          process.exitCode = 0;
        });
      });
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "OD_MCP_START_FAILED"}\n`);
    runtime?.database.close();
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  await main();
}

export type { Runtime };
