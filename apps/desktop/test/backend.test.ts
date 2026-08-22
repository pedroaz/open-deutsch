/// <reference types="node" />

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appServerEventSchema,
  appServerSnapshotSchema,
  desktopIpcRequestSchema,
  type DesktopIpcRequest,
  type DesktopIpcResponse,
  type AppServerOperationFor,
  type AppServerOutputMap,
  type AppServerValidatedOperationResult,
  type AppServerWorkloadKind,
  type OpenDeutschAppServerAdapter,
} from "@open-deutsch/contracts";
import { OpenDeutschAppServerClient } from "@open-deutsch/codex-client";
import { resolveDataRootLayout } from "@open-deutsch/persistence";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import { DesktopBackend } from "../src/main/backend.js";

const factory = createDeterministicContractFactory();
const requestId = () => factory.nextId("correlation");
const backends: DesktopBackend[] = [];

function appServerStub() {
  const runOperation = vi.fn<OpenDeutschAppServerAdapter["runOperation"]>(
    <Kind extends AppServerWorkloadKind>(
      operation: AppServerOperationFor<Kind>,
    ): Promise<AppServerValidatedOperationResult<Kind, AppServerOutputMap>> => {
      void operation;
      return new Promise<never>(() => {});
    },
  );
  const retryOperation = vi.fn(() => new Promise<never>(() => {}));
  const cancelOperation = vi.fn(() => Promise.resolve());
  const initialSnapshot = appServerSnapshotSchema.parse({
    lifecycle: {
      status: "ready",
      codexVersion: "0.146.0",
      initializedAt: "2026-08-15T08:30:00.000Z",
    },
    account: { status: "signed-in", planType: "plus" },
    models: {
      models: [
        {
          id: "runtime-default",
          displayName: "Runtime default",
          isDefault: true,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: ["low", "medium", "high"],
          inputModalities: ["text" as const],
          upgrade: null,
        },
      ],
      runtimeDefaultModelId: "runtime-default",
      missingReasoningMetadata: [],
    },
    rateLimits: { status: "unavailable", reason: "not-reported" },
  });
  let account = initialSnapshot.account;
  const snapshot = () => appServerSnapshotSchema.parse({ ...initialSnapshot, account });
  const models = initialSnapshot.models;
  const listeners = new Set<(event: ReturnType<typeof appServerEventSchema.parse>) => void>();
  const adapter: OpenDeutschAppServerAdapter = {
    start: () => Promise.resolve(snapshot()),
    snapshot: () => Promise.resolve(snapshot()),
    startManagedLogin: () => Promise.resolve(requestId()),
    cancelManagedLogin: () => Promise.resolve(),
    logout: () => {
      account = { status: "signed-out" };
      return Promise.resolve(account);
    },
    refreshModels: () => Promise.resolve(models),
    refreshRateLimits: () => Promise.resolve({ status: "unavailable", reason: "not-reported" }),
    runOperation: runOperation as OpenDeutschAppServerAdapter["runOperation"],
    retryOperation,
    cancelOperation,
    shutdown: () => Promise.resolve(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    adapter,
    runOperation,
    retryOperation,
    cancelOperation,
    emit: (event: unknown) => {
      const parsed = appServerEventSchema.parse(event);
      for (const listener of listeners) listener(parsed);
    },
    setSignedOut: () => {
      account = { status: "signed-out" };
    },
  };
}

function backend() {
  const instance = new DesktopBackend({
    bootstrapFile: "/disposable/open-deutsch/bootstrap.json",
    chooseDirectory: () => Promise.resolve(undefined),
    knownInstallRoots: [],
  });
  backends.push(instance);
  return instance;
}

function request(input: unknown): DesktopIpcRequest {
  return desktopIpcRequestSchema.parse(input);
}

function successful(response: DesktopIpcResponse) {
  expect(response.status).toBe("ok");
  if (response.status !== "ok") throw new Error("expected successful desktop response");
  return response;
}

afterEach(() => {
  for (const instance of backends.splice(0)) instance.close();
  vi.unstubAllEnvs();
});

describe("desktop backend semantic IPC", () => {
  it("switches through the owned selector and exposes only redacted diagnostics while clearing logs", async () => {
    vi.stubEnv("OPEN_DEUTSCH_TEST_MODE", "1");
    const sandbox = await mkdtemp("/tmp/open-deutsch-settings-system-");
    const dataRoot = path.join(sandbox, "learning-data");
    await mkdir(dataRoot, { mode: 0o700 });
    const events: unknown[] = [];
    const exportedDiagnostics: string[] = [];
    const instance = new DesktopBackend({
      bootstrapFile: path.join(sandbox, "config", "bootstrap.json"),
      chooseDirectory: () => Promise.resolve(dataRoot),
      knownInstallRoots: [],
      exportDiagnostics: (content) => {
        exportedDiagnostics.push(content);
        return Promise.resolve({
          status: "exported" as const,
          displayName: "open-deutsch-diagnostics.json",
        });
      },
      emitEvent: (event) => events.push(event),
    });
    try {
      const selected = successful(
        await instance.handle(
          request({ channel: "data-root/choose", requestId: requestId(), payload: {} }),
        ),
      );
      expect(selected.channel).toBe("data-root/choose");
      if (selected.channel !== "data-root/choose" || selected.result.status !== "selected") {
        throw new Error("expected selected data root");
      }
      const confirmed = successful(
        await instance.handle(
          request({
            channel: "data-root/confirm",
            requestId: requestId(),
            payload: { selectionId: selected.result.selectionId },
          }),
        ),
      );
      expect(confirmed).toMatchObject({ result: { status: "ready", generation: 1 } });
      expect(events).toContainEqual(
        expect.objectContaining({ event: "data-root-changed", generation: 1 }),
      );
      expect(
        successful(
          await instance.handle(
            request({ channel: "dashboard/read", requestId: requestId(), payload: {} }),
          ),
        ),
      ).toMatchObject({
        result: {
          rootGeneration: 1,
          weeklyPlan: null,
          preparedActivities: [],
          dueVocabulary: [],
          recentCorrections: [],
          recurringMistakes: [],
        },
      });

      const logs = resolveDataRootLayout(dataRoot).logs;
      await writeFile(path.join(logs, "desktop.log"), "safe diagnostic line\n", { mode: 0o600 });
      const diagnostics = successful(
        await instance.handle(
          request({ channel: "diagnostics/read", requestId: requestId(), payload: {} }),
        ),
      );
      expect(diagnostics).toMatchObject({
        result: {
          dataRootGeneration: 1,
          dataRootFormatVersion: 1,
          journalMode: "wal",
          foreignKeysEnabled: true,
          logFileCount: 1,
        },
      });
      expect(JSON.stringify(diagnostics)).not.toContain(dataRoot);
      const exported = successful(
        await instance.handle(
          request({ channel: "diagnostics/export", requestId: requestId(), payload: {} }),
        ),
      );
      expect(exported).toMatchObject({
        result: { status: "exported", displayName: "open-deutsch-diagnostics.json" },
      });
      expect(exportedDiagnostics).toHaveLength(1);
      expect(exportedDiagnostics[0]).not.toContain(dataRoot);
      expect(exportedDiagnostics[0]).not.toContain("safe diagnostic line");
      const cleared = successful(
        await instance.handle(
          request({ channel: "logs/clear", requestId: requestId(), payload: {} }),
        ),
      );
      expect(cleared).toMatchObject({ result: { clearedFileCount: 1 } });
      expect(await readdir(logs)).toEqual([]);
    } finally {
      await instance.shutdown();
      await rm(sandbox, { recursive: true });
    }
  });

  it("routes account state through the production App Server adapter seam", async () => {
    const root = await mkdtemp("/tmp/open-deutsch-desktop-adapter-");
    const controlPath = path.join(root, "control.json");
    const executable = path.resolve("packages/codex-client/test/fixtures/fake-codex.mjs");
    await writeFile(
      controlPath,
      `${JSON.stringify({ scenario: "standard", account: { planType: "plus" } })}\n`,
      { mode: 0o600 },
    );
    const appServer = new OpenDeutschAppServerClient({
      forbiddenRoots: [root, process.cwd()],
      processOptions: {
        executable,
        environment: { ...process.env, OPEN_DEUTSCH_FAKE_CONTROL_FILE: controlPath },
        initializeTimeoutMilliseconds: 1_000,
        requestTimeoutMilliseconds: 1_000,
        shutdownGraceMilliseconds: 200,
      },
    });
    const instance = new DesktopBackend({
      bootstrapFile: path.join(root, "bootstrap.json"),
      chooseDirectory: () => Promise.resolve(undefined),
      knownInstallRoots: [],
      appServer,
    });
    try {
      const response = successful(
        await instance.handle(
          request({ channel: "codex/account/read", requestId: requestId(), payload: {} }),
        ),
      );
      expect(response).toMatchObject({
        channel: "codex/account/read",
        result: { status: "signed-in", planType: "plus" },
      });
    } finally {
      await instance.shutdown();
      await rm(root, { recursive: true });
    }
  });

  it("dispatches an acknowledged learning operation through the production adapter", async () => {
    vi.stubEnv("OPEN_DEUTSCH_TEST_MODE", "1");
    vi.stubEnv("OPEN_DEUTSCH_DESKTOP_SCENARIO", "first-run");
    const root = await mkdtemp("/tmp/open-deutsch-desktop-operation-");
    const dataRoot = path.join(root, "learning-data");
    await mkdir(dataRoot, { mode: 0o700 });
    const controlPath = path.join(root, "control.json");
    const executable = path.resolve("packages/codex-client/test/fixtures/fake-codex.mjs");
    await writeFile(
      controlPath,
      `${JSON.stringify({ scenario: "standard", account: { planType: "plus" } })}\n`,
      { mode: 0o600 },
    );
    const appServer = new OpenDeutschAppServerClient({
      forbiddenRoots: [root, process.cwd()],
      processOptions: {
        executable,
        environment: { ...process.env, OPEN_DEUTSCH_FAKE_CONTROL_FILE: controlPath },
        initializeTimeoutMilliseconds: 1_000,
        requestTimeoutMilliseconds: 1_000,
        shutdownGraceMilliseconds: 200,
      },
    });
    const events: unknown[] = [];
    const instance = new DesktopBackend({
      bootstrapFile: path.join(root, "config", "bootstrap.json"),
      chooseDirectory: () => Promise.resolve(dataRoot),
      knownInstallRoots: [],
      appServer,
      emitEvent: (event) => events.push(event),
    });
    try {
      const selected = successful(
        await instance.handle(
          request({ channel: "data-root/choose", requestId: requestId(), payload: {} }),
        ),
      );
      expect(selected.channel).toBe("data-root/choose");
      if (selected.channel !== "data-root/choose" || selected.result.status !== "selected") {
        throw new Error("expected selected root");
      }
      await instance.handle(
        request({
          channel: "data-root/confirm",
          requestId: requestId(),
          payload: { selectionId: selected.result.selectionId },
        }),
      );
      await instance.handle(
        request({
          channel: "learner-profile/complete-onboarding",
          requestId: requestId(),
          payload: {
            approximateLevel: "a2",
            everydayGermanyGoal: "Handle appointments confidently.",
            availableStudyMinutesPerWeek: 90,
            defaultTeachingProfileId: "conversation-partner",
            explanationLanguage: "en",
            placement: { status: "skipped" },
          },
        }),
      );
      await instance.handle(
        request({
          channel: "privacy/ai-disclosure/acknowledge",
          requestId: requestId(),
          payload: {},
        }),
      );
      const response = successful(
        await instance.handle(
          request({
            channel: "learning-operation/start",
            requestId: requestId(),
            payload: {
              submissionId: requestId(),
              input: {
                kind: "writing-correction",
                learnerText: "Ich gehen heute.",
              },
            },
          }),
        ),
      );
      expect(response.channel).toBe("learning-operation/start");
      await vi.waitFor(() => {
        expect(JSON.stringify(events)).toContain('"status":"validated"');
      });
      expect(JSON.stringify(events)).not.toContain("Ich gehen heute");
    } finally {
      await instance.shutdown();
      await rm(root, { recursive: true });
    }
  });

  it("starts and idempotently cancels only product-owned managed login attempts", async () => {
    const instance = backend();
    const started = successful(
      await instance.handle(
        request({
          channel: "codex/account/login/start",
          requestId: requestId(),
          payload: { method: "device-code" },
        }),
      ),
    );
    expect(started.channel).toBe("codex/account/login/start");
    if (started.channel !== "codex/account/login/start") throw new Error("unexpected channel");

    const cancel = () =>
      instance.handle(
        request({
          channel: "codex/account/login/cancel",
          requestId: requestId(),
          payload: { loginId: started.result.loginId },
        }),
      );
    expect(successful(await cancel())).toMatchObject({
      channel: "codex/account/login/cancel",
      result: { loginId: started.result.loginId, status: "cancelled" },
    });
    expect(successful(await cancel())).toMatchObject({
      channel: "codex/account/login/cancel",
      result: { loginId: started.result.loginId, status: "already-finished" },
    });
  });

  it("generates and persists an advisory weekly plan from learner evidence", async () => {
    vi.stubEnv("OPEN_DEUTSCH_TEST_MODE", "1");
    vi.stubEnv("OPEN_DEUTSCH_DESKTOP_SCENARIO", "first-run");
    const root = await mkdtemp("/tmp/open-deutsch-desktop-weekly-plan-");
    const dataRoot = path.join(root, "learning-data");
    await mkdir(dataRoot, { mode: 0o700 });
    const appServer = appServerStub();
    const instance = new DesktopBackend({
      bootstrapFile: path.join(root, "config", "bootstrap.json"),
      chooseDirectory: () => Promise.resolve(dataRoot),
      knownInstallRoots: [],
      appServer: appServer.adapter,
    });
    try {
      const selected = successful(
        await instance.handle(
          request({ channel: "data-root/choose", requestId: requestId(), payload: {} }),
        ),
      );
      if (selected.channel !== "data-root/choose" || selected.result.status !== "selected") {
        throw new Error("expected selected root");
      }
      await instance.handle(
        request({
          channel: "data-root/confirm",
          requestId: requestId(),
          payload: { selectionId: selected.result.selectionId },
        }),
      );
      await instance.handle(
        request({
          channel: "learner-profile/complete-onboarding",
          requestId: requestId(),
          payload: {
            approximateLevel: "a2",
            everydayGermanyGoal: "Handle appointments confidently.",
            availableStudyMinutesPerWeek: 90,
            defaultTeachingProfileId: "conversation-partner",
            explanationLanguage: "en",
            placement: { status: "skipped" },
          },
        }),
      );
      await instance.handle(
        request({
          channel: "privacy/ai-disclosure/acknowledge",
          requestId: requestId(),
          payload: {},
        }),
      );
      const submissionId = requestId();
      const started = successful(
        await instance.handle(
          request({
            channel: "learning-operation/start",
            requestId: requestId(),
            payload: {
              submissionId,
              input: { kind: "weekly-plan-generation", naturalRequest: "Prioritise appointments." },
            },
          }),
        ),
      );
      const lastOperation = appServer.runOperation.mock.calls.at(-1)?.[0];
      if (!lastOperation) throw new Error("Expected a weekly-plan operation");
      expect(lastOperation.input).toMatchObject({
        kind: "weekly-plan-generation",
        everydayLifeGoal: "Handle appointments confidently.",
        availableMinutesPerWeek: 90,
        relevantMistakeIds: [],
        dueVocabularyIds: [],
        curriculumTopicIds: [],
      });
      if (started.channel !== "learning-operation/start") {
        throw new Error("Expected a learning-operation/start response");
      }
      appServer.emit({
        event: "operation-state-changed",
        state: {
          operationId: started.result.operationId,
          submissionId,
          kind: "weekly-plan-generation",
          submission: "retained",
          status: "validated",
          modelRequestId: "model-request_0123456789abcdefgh",
          outputSchemaId: "open-deutsch/weekly-plan@1",
          output: {
            role: "advisory",
            goals: [
              {
                title: "Appointments",
                outcome: "Arrange an appointment in German.",
                suggestedActivities: [
                  {
                    kind: "writing",
                    title: "Write a booking message",
                    rationale: "Practice in context.",
                    naturalRequest: "Write a short booking message.",
                    estimatedMinutes: 20,
                  },
                ],
              },
            ],
            uncertainty: { level: "none" },
            caveats: [],
          },
        },
      });
      await vi.waitFor(async () => {
        const response = successful(
          await instance.handle(
            request({ channel: "weekly-plan/read", requestId: requestId(), payload: {} }),
          ),
        );
        expect(response).toMatchObject({ result: { plan: { role: "advisory" } } });
      });
    } finally {
      await instance.shutdown();
      await rm(root, { recursive: true });
    }
  });

  it("deduplicates identical renderer submissions and rejects identifier reuse", async () => {
    vi.stubEnv("OPEN_DEUTSCH_TEST_MODE", "1");
    vi.stubEnv("OPEN_DEUTSCH_DESKTOP_SCENARIO", "ready");
    const appServer = appServerStub();
    const instance = new DesktopBackend({
      bootstrapFile: "/disposable/open-deutsch/bootstrap.json",
      chooseDirectory: () => Promise.resolve(undefined),
      knownInstallRoots: [],
      appServer: appServer.adapter,
    });
    backends.push(instance);
    await instance.handle(
      request({
        channel: "privacy/ai-disclosure/acknowledge",
        requestId: requestId(),
        payload: {},
      }),
    );
    const submissionId = requestId();
    const start = (learnerText: string) =>
      instance.handle(
        request({
          channel: "learning-operation/start",
          requestId: requestId(),
          payload: {
            submissionId,
            input: {
              kind: "writing-correction",
              learnerText,
            },
          },
        }),
      );

    const first = successful(await start("Ich gehe heute zum Arzt."));
    const duplicate = successful(await start("Ich gehe heute zum Arzt."));
    expect(first.channel).toBe("learning-operation/start");
    expect(duplicate.channel).toBe("learning-operation/start");
    if (
      first.channel !== "learning-operation/start" ||
      duplicate.channel !== "learning-operation/start"
    ) {
      throw new Error("unexpected channel");
    }
    expect(duplicate.result).toEqual(first.result);
    expect(first.result).toMatchObject({
      submissionId,
      status: "accepted",
      submission: "retained",
    });
    expect(appServer.runOperation).toHaveBeenCalledTimes(1);
    expect(appServer.runOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        modelSelection: {
          model: { selection: "exact", modelId: "runtime-default" },
          effort: { selection: "exact", effortId: "medium" },
        },
        input: {
          kind: "writing-correction",
          learnerText: "Ich gehe heute zum Arzt.",
          activityGoal: "Handle everyday appointments in German.",
          calibration: {
            approximateLevel: "A2",
            explanationLanguage: "en",
            teachingProfile: "strict-corrector",
          },
          feedback: {
            coverage: "all-meaningful",
            showConciseExplanation: true,
            showNaturalAlternative: true,
          },
          relevantMistakes: [],
        },
      }),
    );

    const conflicting = await start("Ich gehe morgen zum Arzt.");
    expect(conflicting).toMatchObject({
      status: "error",
      channel: "learning-operation/start",
      error: { kind: "conflict", code: "OD_CONFLICT" },
    });

    const promptStart = successful(
      await instance.handle(
        request({
          channel: "learning-operation/start",
          requestId: requestId(),
          payload: {
            submissionId: requestId(),
            input: { kind: "writing-prompt" },
          },
        }),
      ),
    );
    expect(promptStart.channel).toBe("learning-operation/start");
    if (promptStart.channel !== "learning-operation/start") throw new Error("unexpected channel");
    expect(appServer.runOperation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: {
          kind: "writing-prompt",
          calibration: {
            approximateLevel: "A2",
            explanationLanguage: "en",
            teachingProfile: "conversation-partner",
          },
          everydayLifeGoal: "Handle everyday appointments in German.",
          interests: [],
          preferredTopics: [],
        },
      }),
    );

    const helperSessionId = requestId();
    const startHelper = (question: string, submissionId = requestId()) =>
      instance.handle(
        request({
          channel: "learning-operation/start",
          requestId: requestId(),
          payload: {
            submissionId,
            input: {
              kind: "contextual-help",
              sessionId: helperSessionId,
              selectedText: "einen Termin",
              containingSentence: "Ich brauche einen Termin.",
              question,
              activeResultSummary: "The article was corrected.",
            },
          },
        }),
      );
    const firstHelper = successful(await startHelper("Why einen?"));
    expect(firstHelper.channel).toBe("learning-operation/start");
    if (firstHelper.channel !== "learning-operation/start") throw new Error("unexpected channel");
    const firstHelperCall = appServer.runOperation.mock.calls.at(-1)?.[0];
    expect(firstHelperCall).toMatchObject({
      input: {
        kind: "contextual-help",
        selectedText: "einen Termin",
        containingSentence: "Ich brauche einen Termin.",
        question: "Why einen?",
        activeResultSummary: "The article was corrected.",
        calibration: {
          approximateLevel: "A2",
          explanationLanguage: "en",
          teachingProfile: "conversation-partner",
        },
        relevantMistakes: [],
        priorTurns: [],
      },
    });
    appServer.emit({
      event: "operation-state-changed",
      state: {
        operationId: firstHelper.result.operationId,
        submissionId: firstHelper.result.submissionId,
        kind: "contextual-help",
        submission: "retained",
        status: "validated",
        modelRequestId: "model-request_0123456789abcdefgh",
        outputSchemaId: "open-deutsch/contextual-help@1",
        output: {
          answer: "Termin is masculine and the object is accusative.",
          examples: ["Ich brauche einen Termin."],
          alternatives: [],
          translations: [],
          miniExercises: [],
          followUpSuggestions: [],
          uncertainty: { level: "none" },
          caveats: [],
        },
      },
    });
    if (!firstHelperCall || firstHelperCall.input.kind !== "contextual-help") {
      throw new Error("expected contextual helper operation");
    }
    await startHelper("What about the whole phrase?");
    const secondHelperCall = appServer.runOperation.mock.calls.at(-1)?.[0];
    expect(secondHelperCall).toMatchObject({
      input: {
        kind: "contextual-help",
        activityId: firstHelperCall.input.activityId,
        question: "What about the whole phrase?",
        priorTurns: [
          {
            question: "Why einen?",
            answer: "Termin is masculine and the object is accusative.",
          },
        ],
      },
    });

    appServer.emit({
      event: "operation-state-changed",
      state: {
        operationId: first.result.operationId,
        submissionId,
        kind: "writing-correction",
        submission: "retained",
        status: "failed",
        error: {
          schemaVersion: 1,
          kind: "app-server",
          code: "OD_APP_SERVER_FAILED",
          messageKey: "errors.appServer",
          reference: {
            code: "OD_APP_SERVER_FAILED",
            correlationId: requestId(),
            occurredAt: "2026-08-20T12:00:00.000Z",
          },
        },
      },
    });

    const retrySubmissionId = requestId();
    const retry = () =>
      instance.handle(
        request({
          channel: "learning-operation/retry",
          requestId: requestId(),
          payload: {
            previousOperationId: first.result.operationId,
            submissionId: retrySubmissionId,
          },
        }),
      );
    const retried = successful(await retry());
    expect(retried).toMatchObject({
      channel: "learning-operation/retry",
      result: { submissionId: retrySubmissionId, status: "accepted", submission: "retained" },
    });
    expect(successful(await retry())).toEqual(expect.objectContaining({ result: retried.result }));
    expect(appServer.retryOperation).toHaveBeenCalledTimes(1);

    appServer.setSignedOut();
    const retryAfterLogout = await instance.handle(
      request({
        channel: "learning-operation/retry",
        requestId: requestId(),
        payload: {
          previousOperationId: first.result.operationId,
          submissionId: requestId(),
        },
      }),
    );
    expect(retryAfterLogout).toMatchObject({
      status: "error",
      error: { code: "OD_AUTHENTICATION_REQUIRED" },
    });
    expect(appServer.retryOperation).toHaveBeenCalledTimes(1);

    const cancel = () =>
      instance.handle(
        request({
          channel: "learning-operation/cancel",
          requestId: requestId(),
          payload: { operationId: promptStart.result.operationId },
        }),
      );
    expect(successful(await cancel())).toMatchObject({ result: { status: "cancelling" } });
    expect(successful(await cancel())).toMatchObject({ result: { status: "already-finished" } });
    expect(appServer.cancelOperation).toHaveBeenCalledTimes(1);
  });

  it("enforces persisted first-AI disclosure before dispatch", async () => {
    vi.stubEnv("OPEN_DEUTSCH_TEST_MODE", "1");
    vi.stubEnv("OPEN_DEUTSCH_DESKTOP_SCENARIO", "ready");
    const appServer = appServerStub();
    const instance = new DesktopBackend({
      bootstrapFile: "/disposable/open-deutsch/bootstrap.json",
      chooseDirectory: () => Promise.resolve(undefined),
      knownInstallRoots: [],
      appServer: appServer.adapter,
    });
    backends.push(instance);
    const response = await instance.handle(
      request({
        channel: "learning-operation/start",
        requestId: requestId(),
        payload: {
          submissionId: requestId(),
          input: {
            kind: "writing-correction",
            learnerText: "Ich gehen heute.",
          },
        },
      }),
    );
    expect(response).toMatchObject({ status: "error", error: { code: "OD_VALIDATION_FAILED" } });
    expect(appServer.runOperation).not.toHaveBeenCalled();
  });

  it("rejects retained learner text after the active data-root generation changes", async () => {
    const sandbox = await mkdtemp("/tmp/open-deutsch-retry-root-");
    const firstRoot = path.join(sandbox, "first");
    const secondRoot = path.join(sandbox, "second");
    await mkdir(firstRoot, { mode: 0o700 });
    await mkdir(secondRoot, { mode: 0o700 });
    let selectedRoot = firstRoot;
    const appServer = appServerStub();
    const instance = new DesktopBackend({
      bootstrapFile: path.join(sandbox, "config", "bootstrap.json"),
      chooseDirectory: () => Promise.resolve(selectedRoot),
      knownInstallRoots: [],
      appServer: appServer.adapter,
    });
    backends.push(instance);
    const chooseAndConfirm = async (expectedGeneration?: number) => {
      const chosen = successful(
        await instance.handle(
          request({
            channel: "data-root/choose",
            requestId: requestId(),
            payload: expectedGeneration === undefined ? {} : { expectedGeneration },
          }),
        ),
      );
      expect(chosen.channel).toBe("data-root/choose");
      if (chosen.channel !== "data-root/choose" || chosen.result.status !== "selected") {
        throw new Error("expected selected root");
      }
      return instance.handle(
        request({
          channel: "data-root/confirm",
          requestId: requestId(),
          payload: { selectionId: chosen.result.selectionId },
        }),
      );
    };
    try {
      expect(successful(await chooseAndConfirm())).toMatchObject({ result: { generation: 1 } });
      await instance.handle(
        request({
          channel: "learner-profile/complete-onboarding",
          requestId: requestId(),
          payload: {
            approximateLevel: "a2",
            everydayGermanyGoal: "Handle appointments confidently.",
            availableStudyMinutesPerWeek: 90,
            defaultTeachingProfileId: "conversation-partner",
            explanationLanguage: "en",
            placement: { status: "skipped" },
          },
        }),
      );
      await instance.handle(
        request({
          channel: "privacy/ai-disclosure/acknowledge",
          requestId: requestId(),
          payload: {},
        }),
      );
      const submissionId = requestId();
      const started = successful(
        await instance.handle(
          request({
            channel: "learning-operation/start",
            requestId: requestId(),
            payload: {
              submissionId,
              input: { kind: "writing-correction", learnerText: "Privater Testtext." },
            },
          }),
        ),
      );
      expect(started.channel).toBe("learning-operation/start");
      if (started.channel !== "learning-operation/start") throw new Error("unexpected channel");
      appServer.emit({
        event: "operation-state-changed",
        state: {
          operationId: started.result.operationId,
          submissionId,
          kind: "writing-correction",
          submission: "retained",
          status: "rate-limited",
          reached: "primary",
          retryAt: null,
        },
      });

      selectedRoot = secondRoot;
      expect(successful(await chooseAndConfirm(1))).toMatchObject({ result: { generation: 2 } });
      await instance.handle(
        request({
          channel: "privacy/ai-disclosure/acknowledge",
          requestId: requestId(),
          payload: {},
        }),
      );
      const retried = await instance.handle(
        request({
          channel: "learning-operation/retry",
          requestId: requestId(),
          payload: { previousOperationId: started.result.operationId, submissionId: requestId() },
        }),
      );
      expect(retried).toMatchObject({
        status: "error",
        error: { code: "OD_DATA_ROOT_STALE" },
      });
      expect(appServer.retryOperation).not.toHaveBeenCalled();
    } finally {
      await instance.shutdown();
      await rm(sandbox, { recursive: true });
    }
  });

  it("creates one narrow onboarding profile and rejects conflicting replay", async () => {
    vi.stubEnv("OPEN_DEUTSCH_TEST_MODE", "1");
    vi.stubEnv("OPEN_DEUTSCH_DESKTOP_SCENARIO", "first-run");
    const instance = backend();
    const payload = {
      approximateLevel: "a2" as const,
      everydayGermanyGoal: "Handle appointments confidently.",
      availableStudyMinutesPerWeek: 90,
      defaultTeachingProfileId: "conversation-partner" as const,
      explanationLanguage: "de" as const,
      placement: { status: "skipped" as const },
    };
    const complete = (value = payload) =>
      instance.handle(
        request({
          channel: "learner-profile/complete-onboarding",
          requestId: requestId(),
          payload: value,
        }),
      );
    expect(successful(await complete())).toMatchObject({
      channel: "learner-profile/complete-onboarding",
      result: {
        status: "ready",
        profile: {
          approximateLevel: "a2",
          explanationLanguage: "de",
          uiLocale: "en",
          placement: { status: "skipped" },
        },
      },
    });
    expect(successful(await complete())).toMatchObject({ result: { status: "ready" } });
    expect(
      await complete({ ...payload, everydayGermanyGoal: "A conflicting replacement." }),
    ).toMatchObject({ status: "error", error: { code: "OD_CONFLICT" } });
    expect(
      successful(
        await instance.handle(
          request({ channel: "learner-profile/read", requestId: requestId(), payload: {} }),
        ),
      ),
    ).toMatchObject({ result: { status: "ready", profile: { uiLocale: "en" } } });
  });

  it("reads and optimistically updates privileged Settings without identity or paths", async () => {
    vi.stubEnv("OPEN_DEUTSCH_TEST_MODE", "1");
    vi.stubEnv("OPEN_DEUTSCH_DESKTOP_SCENARIO", "first-run");
    const events: unknown[] = [];
    const instance = new DesktopBackend({
      bootstrapFile: "/disposable/open-deutsch/bootstrap.json",
      chooseDirectory: () => Promise.resolve(undefined),
      knownInstallRoots: [],
      emitEvent: (event) => events.push(event),
    });
    backends.push(instance);
    await instance.handle(
      request({
        channel: "learner-profile/complete-onboarding",
        requestId: requestId(),
        payload: {
          approximateLevel: "a2",
          everydayGermanyGoal: "Handle appointments confidently.",
          availableStudyMinutesPerWeek: 90,
          defaultTeachingProfileId: "conversation-partner",
          explanationLanguage: "en",
          placement: { status: "skipped" },
        },
      }),
    );
    vi.stubEnv("OPEN_DEUTSCH_DESKTOP_SCENARIO", "ready");
    const read = successful(
      await instance.handle(
        request({ channel: "learner-settings/read", requestId: requestId(), payload: {} }),
      ),
    );
    expect(read.channel).toBe("learner-settings/read");
    if (read.channel !== "learner-settings/read") throw new Error("unexpected channel");
    expect(read.result).toMatchObject({
      dataRoot: { generation: 1, displayName: "Learning data" },
      settings: { uiLocale: "en", explanationLanguage: "en" },
    });
    expect(JSON.stringify(read.result)).not.toContain("learner_");
    expect(JSON.stringify(read.result)).not.toContain("/disposable");

    const nextSettings = {
      ...read.result.settings,
      approximateLevel: "b1" as const,
      everydayGermanyGoal: "Speak confidently with doctors and neighbors.",
      availableStudyMinutesPerWeek: 180,
      defaultTeachingProfileId: "strict-corrector" as const,
      explanationLanguage: "de" as const,
      uiLocale: "de" as const,
      modelPreferences: {
        ...read.result.settings.modelPreferences,
        correction: {
          model: { mode: "exact" as const, modelId: "runtime-default" },
          effort: { mode: "exact" as const, effortId: "high" },
        },
      },
    };
    const updated = successful(
      await instance.handle(
        request({
          channel: "learner-settings/update",
          requestId: requestId(),
          payload: { expectedUpdatedAt: read.result.updatedAt, settings: nextSettings },
        }),
      ),
    );
    expect(updated.channel).toBe("learner-settings/update");
    if (updated.channel !== "learner-settings/update") throw new Error("unexpected channel");
    expect(updated.result.settings).toEqual(nextSettings);
    expect(updated.result.updatedAt).not.toBe(read.result.updatedAt);
    expect(events).toContainEqual({ event: "state-invalidated", scope: "settings" });
    expect(
      await instance.handle(
        request({
          channel: "learner-settings/update",
          requestId: requestId(),
          payload: { expectedUpdatedAt: read.result.updatedAt, settings: nextSettings },
        }),
      ),
    ).toMatchObject({ status: "error", error: { code: "OD_CONFLICT" } });
  });

  it("rejects credential and raw-protocol fields before backend handling", () => {
    for (const payload of [
      { method: "api-key", apiKey: "secret" },
      { method: "device-code", accessToken: "secret" },
      { method: "browser", rawProtocol: { method: "account/login/start" } },
    ]) {
      expect(
        desktopIpcRequestSchema.safeParse({
          channel: "codex/account/login/start",
          requestId: requestId(),
          payload,
        }).success,
      ).toBe(false);
    }
  });
});
