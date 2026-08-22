import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import { compareVersions, parseVersion } from "./toolchain-diagnostics.mjs";

const execFileAsync = promisify(execFile);
const minimumCodexVersion = parseVersion("0.146.0", "Codex minimum");
const maximumCodexVersion = parseVersion("0.146.1", "Codex maximum");
const managedLoginTypes = new Set(["chatgpt", "chatgptDeviceCode"]);
const credentialFieldNames = new Set(["accessToken", "apiKey", "idToken", "refreshToken"]);

export function assertSupportedCodexVersion(output) {
  let version;
  try {
    version = parseVersion(output, "Codex CLI");
  } catch {
    throw new Error(`CODEX_VERSION_UNSUPPORTED: expected >=0.146.0 <0.146.1`);
  }
  if (
    compareVersions(version, minimumCodexVersion) < 0 ||
    compareVersions(version, maximumCodexVersion) >= 0
  ) {
    throw new Error(
      `CODEX_VERSION_UNSUPPORTED: expected >=0.146.0 <0.146.1, received ${version.text}`,
    );
  }
  return `codex-cli ${version.text}`;
}

export async function readSupportedCodexVersion(command, options = {}) {
  try {
    const { stdout } = await execFileAsync(command, options.args ?? ["--version"], {
      timeout: options.timeoutMilliseconds ?? 5_000,
      killSignal: "SIGKILL",
      env: options.env,
    });
    return assertSupportedCodexVersion(stdout);
  } catch (error) {
    if (error.killed || error.signal === "SIGKILL") {
      throw new Error("CODEX_VERSION_TIMEOUT");
    }
    if (error.message?.startsWith("CODEX_VERSION_UNSUPPORTED")) throw error;
    throw new Error(`CODEX_VERSION_UNAVAILABLE: ${error.code ?? "unknown"}`);
  }
}

export function managedLoginParams(type) {
  if (!managedLoginTypes.has(type)) {
    throw new Error("OPEN_DEUTSCH_MANAGED_CHATGPT_ONLY");
  }
  if (type === "chatgptDeviceCode") return { type };
  return { type, useHostedLoginSuccessPage: true, appBrand: "chatgpt" };
}

export function containsCredentialMaterial(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsCredentialMaterial);
  return Object.entries(value).some(
    ([key, nested]) => credentialFieldNames.has(key) || containsCredentialMaterial(nested),
  );
}

export function projectAccountState(result) {
  const accountType = result?.account?.type ?? null;
  if (accountType !== null && accountType !== "chatgpt") {
    return { status: "unsupported", authMode: null, planType: null };
  }
  return {
    status: accountType === "chatgpt" ? "signedIn" : "signedOut",
    authMode: accountType,
    planType: result?.account?.planType ?? null,
  };
}

export async function waitForProjectedAccountState(
  client,
  expectedStatus,
  { timeoutMilliseconds = 10_000, pollIntervalMilliseconds = 100 } = {},
) {
  if (expectedStatus !== "signedIn" && expectedStatus !== "signedOut") {
    throw new Error("APP_SERVER_ACCOUNT_STATE_EXPECTATION_INVALID");
  }
  const deadline = Date.now() + timeoutMilliseconds;
  while (true) {
    const state = projectAccountState(
      await client.request("account/read", { refreshToken: false }, timeoutMilliseconds),
    );
    if (state.status === expectedStatus) return state;
    if (state.status === "unsupported") {
      throw new Error("APP_SERVER_ACCOUNT_MODE_UNSUPPORTED");
    }
    if (Date.now() >= deadline) {
      throw new Error(`APP_SERVER_ACCOUNT_STATE_TIMEOUT: ${expectedStatus}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMilliseconds));
  }
}

function nonblankString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function projectModelCatalog(result) {
  if (!Array.isArray(result?.data)) throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
  const seen = new Set();
  const models = result.data.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      entry.hidden === true ||
      (entry.hidden !== undefined && typeof entry.hidden !== "boolean") ||
      (entry.isDefault !== undefined && typeof entry.isDefault !== "boolean") ||
      (entry.displayName !== undefined && !nonblankString(entry.displayName)) ||
      (entry.defaultReasoningEffort !== undefined && !nonblankString(entry.defaultReasoningEffort))
    ) {
      throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
    }
    const id = nonblankString(entry.id) ?? nonblankString(entry.model);
    if (!id || seen.has(id)) throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
    seen.add(id);

    const advertisedEfforts = entry.supportedReasoningEfforts ?? [];
    if (!Array.isArray(advertisedEfforts)) {
      throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
    }
    const supportedReasoningEfforts = advertisedEfforts.map((effort) => {
      const name = nonblankString(effort?.reasoningEffort);
      if (!name) throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
      return name;
    });
    if (new Set(supportedReasoningEfforts).size !== supportedReasoningEfforts.length) {
      throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
    }

    const defaultReasoningEffort = nonblankString(entry.defaultReasoningEffort);
    if (
      defaultReasoningEffort &&
      supportedReasoningEfforts.length > 0 &&
      !supportedReasoningEfforts.includes(defaultReasoningEffort)
    ) {
      throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
    }

    let inputModalities;
    if (entry.inputModalities === undefined) {
      inputModalities = ["text", "image"];
    } else if (
      Array.isArray(entry.inputModalities) &&
      entry.inputModalities.every((modality) => nonblankString(modality))
    ) {
      inputModalities = [...new Set(entry.inputModalities)];
    } else {
      throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
    }

    return {
      id,
      displayName: nonblankString(entry.displayName) ?? id,
      isDefault: entry.isDefault === true,
      defaultReasoningEffort,
      supportedReasoningEfforts,
      inputModalities,
    };
  });

  const runtimeDefaults = models.filter((model) => model.isDefault);
  if (runtimeDefaults.length > 1) throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
  return {
    models,
    runtimeDefaultModelId: runtimeDefaults[0]?.id ?? null,
    missingReasoningMetadata: models
      .filter(
        (model) => !model.defaultReasoningEffort || model.supportedReasoningEfforts.length === 0,
      )
      .map((model) => model.id),
  };
}

export async function readProjectedModelCatalog(client, options = {}) {
  const data = [];
  let cursor;
  for (let page = 0; page < (options.maximumPages ?? 20); page += 1) {
    const params = { limit: options.pageSize ?? 100, includeHidden: false };
    if (cursor) params.cursor = cursor;
    const result = await client.request(
      "model/list",
      params,
      options.timeoutMilliseconds ?? 20_000,
    );
    if (!Array.isArray(result?.data)) throw new Error("APP_SERVER_MODEL_CATALOG_INVALID");
    data.push(...result.data);
    const nextCursor = nonblankString(result.nextCursor);
    if (!nextCursor) return projectModelCatalog({ data });
    cursor = nextCursor;
  }
  throw new Error("APP_SERVER_MODEL_CATALOG_PAGINATION_LIMIT");
}

function projectRateWindow(window) {
  if (window === undefined || window === null) return null;
  if (typeof window !== "object" || Array.isArray(window)) {
    throw new Error("APP_SERVER_RATE_LIMITS_INVALID");
  }
  const numeric = (value) => {
    if (value === undefined || value === null) return null;
    if (!Number.isFinite(value)) throw new Error("APP_SERVER_RATE_LIMITS_INVALID");
    return value;
  };
  return {
    usedPercent: numeric(window.usedPercent),
    windowDurationMins: numeric(window.windowDurationMins),
    resetsAt: numeric(window.resetsAt),
  };
}

function projectRateLimitBucket(bucket, fallbackLimitId = null) {
  if (bucket === undefined || bucket === null) return null;
  if (typeof bucket !== "object" || Array.isArray(bucket)) {
    throw new Error("APP_SERVER_RATE_LIMITS_INVALID");
  }
  for (const field of ["limitId", "planType", "rateLimitReachedType"]) {
    if (bucket[field] !== undefined && bucket[field] !== null && !nonblankString(bucket[field])) {
      throw new Error("APP_SERVER_RATE_LIMITS_INVALID");
    }
  }
  return {
    limitId: nonblankString(bucket.limitId) ?? fallbackLimitId,
    planType: nonblankString(bucket.planType),
    primary: projectRateWindow(bucket.primary),
    secondary: projectRateWindow(bucket.secondary),
    rateLimitReachedType: nonblankString(bucket.rateLimitReachedType),
  };
}

export function projectRateLimits(result) {
  const byId = result?.rateLimitsByLimitId;
  let buckets = [];
  if (byId !== undefined && (byId === null || typeof byId !== "object" || Array.isArray(byId))) {
    throw new Error("APP_SERVER_RATE_LIMITS_INVALID");
  }
  if (byId && Object.keys(byId).length > 0) {
    buckets = Object.entries(byId).map(([id, bucket]) => {
      const fallbackLimitId = nonblankString(id);
      if (!fallbackLimitId) throw new Error("APP_SERVER_RATE_LIMITS_INVALID");
      return projectRateLimitBucket(bucket, fallbackLimitId);
    });
  } else {
    const bucket = projectRateLimitBucket(result?.rateLimits);
    if (bucket) buckets = [bucket];
  }
  if (buckets.some((bucket) => !bucket)) throw new Error("APP_SERVER_RATE_LIMITS_INVALID");
  const availableCount = result?.rateLimitResetCredits?.availableCount;
  if (
    availableCount !== undefined &&
    availableCount !== null &&
    !Number.isInteger(availableCount)
  ) {
    throw new Error("APP_SERVER_RATE_LIMITS_INVALID");
  }
  return {
    status: buckets.length > 0 ? "available" : "unavailable",
    buckets,
    resetCreditsAvailableCount: Number.isInteger(availableCount) ? availableCount : null,
  };
}

export class AppServerProbeClient {
  #child;
  #nextId = 1;
  #pending = new Map();
  #notifications = [];
  #waiters = [];
  #stderr = "";
  #credentialMaterialObserved = false;
  #closed;

  constructor(command, options = {}) {
    this.#child = spawn(command, options.args ?? ["app-server", "--stdio"], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#closed = new Promise((resolve) => {
      this.#child.once("close", (code, signal) => resolve({ code, signal }));
    });
    this.#child.stderr.on("data", (chunk) => {
      this.#stderr = `${this.#stderr}${chunk}`.slice(-8_192);
    });
    this.#child.once("error", (error) => this.#rejectAll(error));
    const lines = createInterface({ input: this.#child.stdout });
    lines.on("line", (line) => this.#receive(line));
    this.#child.once("close", (code, signal) => {
      this.#rejectAll(
        new Error(`APP_SERVER_EXITED: code=${String(code)} signal=${String(signal)}`),
      );
    });
  }

  async initialize(timeoutMilliseconds = 10_000) {
    const result = await this.request(
      "initialize",
      {
        clientInfo: { name: "open_deutsch", title: "Open Deutsch", version: "0.0.0" },
      },
      timeoutMilliseconds,
    );
    this.notify("initialized", {});
    return result;
  }

  request(method, params = {}, timeoutMilliseconds = 10_000) {
    if (method === "account/login/start") {
      const expected = managedLoginParams(params.type);
      if (JSON.stringify(params) !== JSON.stringify(expected)) {
        throw new Error("OPEN_DEUTSCH_MANAGED_CHATGPT_ONLY");
      }
    }
    const id = this.#nextId++;
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`APP_SERVER_TIMEOUT: ${method}`));
      }, timeoutMilliseconds);
      this.#pending.set(id, { resolve, reject, timeout, method });
    });
    this.#send({ method, id, params });
    return response;
  }

  notify(method, params = {}) {
    this.#send({ method, params });
  }

  waitForNotification(method, predicate = () => true, timeoutMilliseconds = 10_000) {
    const index = this.#notifications.findIndex(
      (notification) => notification.method === method && predicate(notification.params),
    );
    if (index !== -1) return Promise.resolve(this.#notifications.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { method, predicate, resolve, reject };
      const timeout = setTimeout(() => {
        this.#waiters = this.#waiters.filter((candidate) => candidate !== waiter);
        reject(new Error(`APP_SERVER_NOTIFICATION_TIMEOUT: ${method}`));
      }, timeoutMilliseconds);
      waiter.timeout = timeout;
      this.#waiters.push(waiter);
    });
  }

  async close() {
    if (this.#child.exitCode === null && this.#child.signalCode === null) this.#child.stdin.end();
    const graceful = await Promise.race([
      this.#closed,
      new Promise((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    if (graceful) return { ...graceful, stderr: this.#stderr };
    this.#child.kill("SIGTERM");
    const terminated = await Promise.race([
      this.#closed,
      new Promise((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    if (terminated) return { ...terminated, stderr: this.#stderr };
    this.#child.kill("SIGKILL");
    return { ...(await this.#closed), stderr: this.#stderr };
  }

  credentialMaterialObserved() {
    return this.#credentialMaterialObserved;
  }

  #send(message) {
    if (!this.#child.stdin.write(`${JSON.stringify(message)}\n`)) {
      this.#child.stdin.once("drain", () => undefined);
    }
  }

  #receive(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.#rejectAll(new Error("APP_SERVER_INVALID_JSON"));
      return;
    }
    if (containsCredentialMaterial(message)) {
      this.#credentialMaterialObserved = true;
      this.#rejectAll(new Error("APP_SERVER_CREDENTIAL_MATERIAL_REJECTED"));
      return;
    }
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(`APP_SERVER_ERROR: ${pending.method}: ${message.error.message ?? "unknown"}`),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    const waiterIndex = this.#waiters.findIndex(
      (waiter) => waiter.method === message.method && waiter.predicate(message.params),
    );
    if (waiterIndex !== -1) {
      const [waiter] = this.#waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    } else {
      this.#notifications.push(message);
    }
  }

  #rejectAll(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
    for (const waiter of this.#waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.#waiters = [];
  }
}

export async function createInitializedAppServerClient(command, options = {}) {
  const client = new AppServerProbeClient(command, options);
  try {
    const initialized = await client.initialize(options.initializeTimeoutMilliseconds);
    return { client, initialized };
  } catch (error) {
    await client.close();
    throw error;
  }
}

const credentialEnvironmentNames = new Set([
  "AWS_ACCESS_KEY_ID",
  "AWS_CONFIG_FILE",
  "AWS_PROFILE",
  "AWS_ROLE_ARN",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AZURE_OPENAI_API_KEY",
  "CODEX_API_KEY",
  "CODEX_REMOTE_TOKEN",
  "OPENAI_API_KEY",
]);

export function scrubCodexEnvironment(inherited) {
  return Object.fromEntries(
    Object.entries(inherited).filter(([name]) => !credentialEnvironmentNames.has(name)),
  );
}

export function buildIsolatedCodexEnvironment(inherited, { codexHome, home }) {
  return {
    ...scrubCodexEnvironment(inherited),
    HOME: home,
    CODEX_HOME: codexHome,
  };
}
