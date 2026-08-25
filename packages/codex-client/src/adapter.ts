import {
  appServerEventSchema,
  appServerOutputSchemaIds,
  appServerSnapshotSchema,
  correlationIdSchema,
  modelRequestIdSchema,
  openDeutschErrorSchema,
  supportedCodexVersionSchema,
  utcInstantSchema,
  type AppServerEvent,
  type AppServerOperationFor,
  type AppServerOperationStart,
  type AppServerOutputMap,
  type AppServerSnapshot,
  type AppServerValidatedOperationResult,
  type AppServerWorkloadKind,
  type OpenDeutschAppServerAdapter,
  type OpenDeutschError,
} from "@open-deutsch/contracts";

import {
  ManagedAuthenticationClient,
  type AccountState,
  type ManagedLoginState,
} from "./authentication.js";
import { ModelCatalogClient, type ModelCatalog } from "./catalog.js";
import {
  OperationController,
  type ExecuteContext,
  type OperationOutcome,
} from "./operation-controller.js";
import {
  AppServerProcessManager,
  type AppServerLogRecord,
  type AppServerProcessManagerOptions,
} from "./process-manager.js";
import { RateLimitClient, type RateLimitState } from "./rate-limits.js";
import { runBoundedWorkload, type BoundedWorkloadResult } from "./workload.js";

const emptyCatalog: ModelCatalog = {
  models: [],
  runtimeDefaultModelId: null,
  missingReasoningMetadata: [],
};
const unavailableLimits: RateLimitState = { status: "unavailable", reason: "runtime-not-ready" };

type AnyResult = BoundedWorkloadResult<AppServerWorkloadKind>;

export type OpenDeutschAppServerClientOptions = Readonly<{
  process?: AppServerProcessManager;
  processOptions?: AppServerProcessManagerOptions;
  forbiddenRoots: readonly string[];
  openExternal?: (url: string) => Promise<void> | void;
  presentDeviceCode?: (
    value: Readonly<{ verificationUrl: string; userCode: string }>,
  ) => Promise<void> | void;
}>;

type AdapterErrorKind = "cancellation" | "rate-limit" | "model-output" | "app-server";

function safeError(operationId: string, kind: AdapterErrorKind): OpenDeutschError {
  const definitions = {
    cancellation: ["OD_CANCELLED", "errors.cancellation"],
    "rate-limit": ["OD_RATE_LIMITED", "errors.rateLimit"],
    "model-output": ["OD_MODEL_OUTPUT_INVALID", "errors.modelOutput"],
    "app-server": ["OD_APP_SERVER_FAILED", "errors.appServer"],
  } as const;
  const [code, messageKey] = definitions[kind];
  return openDeutschErrorSchema.parse({
    schemaVersion: 1,
    kind,
    code,
    messageKey,
    reference: {
      code,
      correlationId: correlationIdSchema.parse(operationId),
      occurredAt: new Date().toISOString(),
    },
  });
}

function selectRuntimeModel(
  operation: AppServerOperationStart,
  catalog: ModelCatalog,
): Readonly<{ model: string; effort: string }> {
  const modelId =
    operation.modelSelection.model.selection === "exact"
      ? operation.modelSelection.model.modelId
      : catalog.runtimeDefaultModelId;
  const model = catalog.models.find(({ id }) => id === modelId);
  if (!model) throw new Error("OD_APP_SERVER_MODEL_UNAVAILABLE");
  const effort =
    operation.modelSelection.effort.selection === "exact"
      ? operation.modelSelection.effort.effortId
      : model.defaultReasoningEffort;
  if (!effort || !model.supportedReasoningEfforts.includes(effort)) {
    throw new Error("OD_APP_SERVER_EFFORT_UNAVAILABLE");
  }
  return { model: model.id, effort };
}

function projectedRateLimitFailure(state: RateLimitState): Readonly<{
  reached: "primary" | "secondary" | "both" | "unknown";
  retryAt: number | null;
}> {
  if (state.status !== "limited") return { reached: "unknown", retryAt: null };
  const candidates = state.buckets.flatMap((bucket) => {
    const windows =
      state.reached === "primary"
        ? [bucket.primary]
        : state.reached === "secondary"
          ? [bucket.secondary]
          : [bucket.primary, bucket.secondary];
    return windows.flatMap((window) =>
      window?.usedPercent === 100 && window.resetsAt !== null ? [window.resetsAt] : [],
    );
  });
  return {
    reached: state.reached,
    retryAt: candidates.length === 0 ? null : Math.min(...candidates),
  };
}

export class OpenDeutschAppServerClient implements OpenDeutschAppServerAdapter {
  readonly #process: AppServerProcessManager;
  readonly #authentication: ManagedAuthenticationClient;
  readonly #catalog: ModelCatalogClient;
  readonly #limits: RateLimitClient;
  readonly #forbiddenRoots: readonly string[];
  readonly #codexSource: "path" | "configured-absolute-path";
  readonly #listeners = new Set<(event: AppServerEvent) => void>();
  readonly #operations = new OperationController<AppServerOperationStart, AnyResult>();
  readonly #operationInputs = new Map<string, AppServerOperationStart>();
  readonly #log: AppServerProcessManagerOptions["log"];
  #account: AccountState = { status: "signed-out" };
  #models: ModelCatalog = emptyCatalog;
  #rateLimits: RateLimitState = unavailableLimits;
  #lifecycle: AppServerSnapshot["lifecycle"] = {
    status: "stopped",
    codex: { status: "missing" },
  };
  #codexWasCompatible = false;
  #notificationQueue: Promise<void> = Promise.resolve();

  constructor(options: OpenDeutschAppServerClientOptions) {
    this.#process = options.process ?? new AppServerProcessManager(options.processOptions);
    this.#log = options.processOptions?.log;
    this.#codexSource =
      options.processOptions?.executable === undefined ? "path" : "configured-absolute-path";
    this.#forbiddenRoots = Object.freeze([...options.forbiddenRoots]);
    this.#authentication = new ManagedAuthenticationClient({
      requester: this.#process,
      ...(options.openExternal === undefined ? {} : { openExternal: options.openExternal }),
      ...(options.presentDeviceCode === undefined
        ? {}
        : { presentDeviceCode: options.presentDeviceCode }),
      onAccountChanged: (state) => {
        this.#account = state;
        this.#emit({ event: "account-changed", state });
      },
      onLoginChanged: (loginId, state) => {
        this.#loginEvent(loginId, state);
      },
    });
    this.#catalog = new ModelCatalogClient({
      requester: this.#process,
      onCatalogChanged: (catalog) => {
        const changed = JSON.stringify(catalog) !== JSON.stringify(this.#models);
        this.#models = catalog;
        if (changed) this.#emit({ event: "models-changed" });
      },
    });
    this.#limits = new RateLimitClient({
      requester: this.#process,
      onRateLimitsChanged: (state) => {
        this.#rateLimits = state;
        this.#emit({ event: "rate-limits-changed" });
      },
    });
    this.#process.subscribeNotifications((method, params) => {
      this.#notificationQueue = this.#notificationQueue
        .then(() => this.#handleNotification(method, params))
        .catch(() => {
          // The next projected notification remains processable after a safe failure.
        });
    });
    this.#process.subscribeLifecycle((state) => {
      this.#projectLifecycle(state);
    });
  }

  async start() {
    await this.#process.start();
    await this.#authentication.restore();
    if (this.#account.status === "signed-in") {
      await Promise.all([
        this.refreshModels().catch(() => {
          this.#models = emptyCatalog;
        }),
        this.refreshRateLimits(),
      ]);
    }
    return this.snapshot();
  }

  snapshot() {
    return Promise.resolve(
      appServerSnapshotSchema.parse({
        lifecycle: this.#lifecycle,
        account: this.#account,
        models: this.#models,
        rateLimits: this.#rateLimits,
      }),
    );
  }

  startManagedLogin(method: "browser" | "device-code") {
    return this.#authentication.startManagedLogin(method);
  }

  cancelManagedLogin(loginId: Parameters<ManagedAuthenticationClient["cancelManagedLogin"]>[0]) {
    return this.#authentication.cancelManagedLogin(loginId);
  }

  logout() {
    return this.#authentication.logout();
  }

  refreshModels() {
    return this.#catalog.refresh();
  }

  refreshRateLimits() {
    return this.#limits.refresh();
  }

  async runOperation<Kind extends AppServerWorkloadKind>(
    operation: AppServerOperationFor<Kind>,
  ): Promise<AppServerValidatedOperationResult<Kind, AppServerOutputMap>> {
    const validated = operation as AppServerOperationStart;
    const accepted = this.#operations.start({
      submissionId: validated.submissionId,
      operationId: validated.operationId,
      input: validated,
      execute: (retained, context) => this.#execute(retained, context),
    });
    if (accepted.accepted === "started") {
      this.#operationInputs.set(validated.operationId, validated);
      this.#operationLog("info", "APP_SERVER_OPERATION_STARTED", validated, "Operation started.");
      this.#state(validated, "accepted");
      this.#progress(validated, "queued");
    }
    const outcome = await accepted.completion;
    if (outcome.status === "succeeded" || outcome.status === "cancelled") {
      this.#operationInputs.delete(validated.operationId);
    }
    if (outcome.status === "rate-limited") await this.refreshRateLimits();
    return this.#operationResult(validated, outcome) as AppServerValidatedOperationResult<
      Kind,
      AppServerOutputMap
    >;
  }

  async retryOperation<Kind extends AppServerWorkloadKind>(options: {
    previousOperationId: Parameters<OpenDeutschAppServerAdapter["cancelOperation"]>[0];
    operationId: Parameters<OpenDeutschAppServerAdapter["cancelOperation"]>[0];
    submissionId: Parameters<OpenDeutschAppServerAdapter["cancelOperation"]>[0];
  }): Promise<AppServerValidatedOperationResult<Kind, AppServerOutputMap>> {
    const previous = this.#operationInputs.get(options.previousOperationId);
    if (!previous) throw new Error("OD_OPERATION_RETRY_UNAVAILABLE");
    const operation = {
      ...previous,
      operationId: options.operationId,
      submissionId: options.submissionId,
    };
    const accepted = this.#operations.retry({
      previousOperationId: options.previousOperationId,
      operationId: options.operationId,
      submissionId: options.submissionId,
      retain: () => operation,
      execute: (retained, context) => this.#execute(retained, context),
    });
    const effective =
      accepted.accepted === "replayed"
        ? (this.#operationInputs.get(accepted.operationId) ?? {
            ...previous,
            operationId: correlationIdSchema.parse(accepted.operationId),
            submissionId: options.submissionId,
          })
        : operation;
    if (accepted.accepted === "started") {
      this.#operationInputs.set(operation.operationId, operation);
      this.#operationLog("info", "APP_SERVER_OPERATION_STARTED", operation, "Retry started.");
      this.#state(operation, "accepted");
      this.#progress(operation, "queued");
    }
    const outcome = await accepted.completion;
    if (outcome.status === "succeeded" || outcome.status === "cancelled") {
      this.#operationInputs.delete(effective.operationId);
    }
    if (outcome.status === "rate-limited") await this.refreshRateLimits();
    return this.#operationResult(effective, outcome) as AppServerValidatedOperationResult<
      Kind,
      AppServerOutputMap
    >;
  }

  cancelOperation(operationId: Parameters<OpenDeutschAppServerAdapter["cancelOperation"]>[0]) {
    const operation = this.#operationInputs.get(operationId);
    if (this.#operations.cancel(operationId) && operation) {
      this.#progress(operation, "cancelling");
    }
    return Promise.resolve();
  }

  async shutdown(): Promise<void> {
    await this.#process.shutdown();
  }

  subscribe(listener: (event: AppServerEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #execute(retained: AppServerOperationStart, context: ExecuteContext): Promise<AnyResult> {
    const selection = selectRuntimeModel(retained, this.#models);
    return runBoundedWorkload(this.#process, {
      input: retained.input,
      ...selection,
      forbiddenRoots: this.#forbiddenRoots,
      signal: context.signal,
      onProgress: (stage) => {
        if (stage === "validating") context.validating();
        this.#progress(retained, stage);
      },
    });
  }

  #projectLifecycle(state: ReturnType<AppServerProcessManager["state"]>): void {
    if (state === "ready") {
      this.#codexWasCompatible = true;
      this.#lifecycle = {
        status: "ready",
        codexVersion: supportedCodexVersionSchema.parse("0.146.0"),
        initializedAt: utcInstantSchema.parse(new Date().toISOString()),
      };
    } else if (state === "failed") {
      this.#lifecycle = {
        status: "failed",
        error: safeError("correlation_runtime0000000000", "app-server"),
      };
    } else if (state === "stopped") {
      this.#lifecycle = {
        status: "stopped",
        codex: this.#codexWasCompatible
          ? {
              status: "compatible",
              version: supportedCodexVersionSchema.parse("0.146.0"),
              source: this.#codexSource,
            }
          : { status: "missing" },
      };
    } else {
      this.#lifecycle = {
        status: state,
        startedAt: utcInstantSchema.parse(new Date().toISOString()),
      };
    }
    this.#emit({ event: "lifecycle-changed", state: this.#lifecycle });
  }

  async #handleNotification(method: string, params: unknown): Promise<void> {
    try {
      const accountChanged = await this.#authentication.handleNotification(method, params);
      const limitsChanged = await this.#limits.handleNotification(method);
      if (accountChanged && this.#account.status === "signed-in") {
        await Promise.all([this.refreshModels(), this.refreshRateLimits()]);
      } else if (limitsChanged) {
        this.#emit({ event: "rate-limits-changed" });
      }
    } catch {
      // Projection clients publish closed unavailable states; raw notification data is discarded.
    }
  }

  #loginEvent(loginId: string, state: ManagedLoginState): void {
    if (state.status === "failed") {
      this.#emit({
        event: "account-login-changed",
        loginId: correlationIdSchema.parse(loginId),
        state: { status: "failed", error: safeError(loginId, "app-server") },
      });
      return;
    }
    this.#emit({
      event: "account-login-changed",
      loginId: correlationIdSchema.parse(loginId),
      state,
    });
  }

  #progress(
    operation: AppServerOperationStart,
    stage: "queued" | "starting" | "running" | "validating" | "cancelling",
  ): void {
    this.#emit({
      event: "operation-progress",
      operationId: operation.operationId,
      submissionId: operation.submissionId,
      kind: operation.input.kind,
      stage,
    });
  }

  #state(operation: AppServerOperationStart, status: "accepted"): void {
    this.#emit({
      event: "operation-state-changed",
      state: {
        operationId: operation.operationId,
        submissionId: operation.submissionId,
        kind: operation.input.kind,
        submission: "retained",
        status,
      },
    });
  }

  #operationResult(
    operation: AppServerOperationStart,
    outcome: OperationOutcome<AnyResult>,
  ): AppServerValidatedOperationResult<AppServerWorkloadKind, AppServerOutputMap> {
    if (outcome.status === "succeeded") {
      this.#operationLog(
        "info",
        "APP_SERVER_OPERATION_VALIDATED",
        operation,
        "Operation output validated.",
      );
      const result = {
        operationId: operation.operationId,
        submissionId: operation.submissionId,
        kind: operation.input.kind,
        modelRequestId: modelRequestIdSchema.parse(outcome.output.modelRequestId),
        outputSchemaId: appServerOutputSchemaIds[operation.input.kind],
        output: outcome.output.output,
      } as AppServerValidatedOperationResult<AppServerWorkloadKind, AppServerOutputMap>;
      this.#emit({
        event: "operation-state-changed",
        state: { ...result, submission: "retained", status: "validated" },
      });
      this.#emit({
        event: "operation-finished",
        operationId: operation.operationId,
        submissionId: operation.submissionId,
        kind: operation.input.kind,
        outcome: {
          status: "validated",
          modelRequestId: result.modelRequestId,
          outputSchemaId: result.outputSchemaId,
        },
      });
      return result;
    }
    const kind: AdapterErrorKind =
      outcome.status === "rate-limited"
        ? "rate-limit"
        : outcome.status === "cancelled"
          ? "cancellation"
          : outcome.errorCode.startsWith("OD_APP_SERVER_OUTPUT_")
            ? "model-output"
            : "app-server";
    const error = safeError(operation.operationId, kind);
    this.#operationLog(
      outcome.status === "cancelled"
        ? "info"
        : outcome.status === "rate-limited"
          ? "warn"
          : "error",
      outcome.status === "cancelled"
        ? "APP_SERVER_OPERATION_CANCELLED"
        : outcome.status === "rate-limited"
          ? "APP_SERVER_OPERATION_RATE_LIMITED"
          : "APP_SERVER_OPERATION_FAILED",
      operation,
      outcome.status === "cancelled"
        ? "Operation cancelled."
        : outcome.status === "rate-limited"
          ? "Operation rate limited."
          : "Operation failed.",
      outcome.status === "failed" ? outcome.errorCode : undefined,
    );
    const rateLimit = projectedRateLimitFailure(this.#rateLimits);
    this.#emit({
      event: "operation-state-changed",
      state:
        outcome.status === "rate-limited"
          ? {
              operationId: operation.operationId,
              submissionId: operation.submissionId,
              kind: operation.input.kind,
              submission: "retained",
              status: "rate-limited",
              reached: rateLimit.reached,
              retryAt: rateLimit.retryAt,
            }
          : outcome.status === "cancelled"
            ? {
                operationId: operation.operationId,
                submissionId: operation.submissionId,
                kind: operation.input.kind,
                submission: "retained",
                status: "cancelled",
              }
            : {
                operationId: operation.operationId,
                submissionId: operation.submissionId,
                kind: operation.input.kind,
                submission: "retained",
                status: "failed",
                error,
              },
    });
    this.#emit({
      event: "operation-finished",
      operationId: operation.operationId,
      submissionId: operation.submissionId,
      kind: operation.input.kind,
      outcome:
        outcome.status === "cancelled"
          ? { status: "cancelled" }
          : outcome.status === "rate-limited"
            ? { status: "rate-limited", ...rateLimit }
            : { status: "failed", error },
    });
    throw new Error(error.code);
  }

  #operationLog(
    severity: AppServerLogRecord["severity"],
    code: string,
    operation: AppServerOperationStart,
    message: string,
    errorCode?: string,
  ): void {
    try {
      this.#log?.({
        timestamp: new Date().toISOString(),
        severity,
        component: "app-server",
        code,
        correlationId: operation.operationId,
        message,
        metadata: {
          reason: operation.input.kind,
          ...(errorCode === undefined ? {} : { code: errorCode }),
        },
      });
    } catch {
      // Diagnostic sinks cannot change operation settlement.
    }
  }

  #emit(event: AppServerEvent): void {
    const safe = appServerEventSchema.parse(event);
    for (const listener of this.#listeners) {
      try {
        listener(safe);
      } catch {
        // Public observers cannot change adapter state or operation settlement.
      }
    }
  }
}
