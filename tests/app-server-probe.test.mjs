import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertSupportedCodexVersion,
  buildIsolatedCodexEnvironment,
  containsCredentialMaterial,
  createInitializedAppServerClient,
  managedLoginParams,
  projectAccountState,
  projectModelCatalog,
  projectRateLimits,
  readProjectedModelCatalog,
  readSupportedCodexVersion,
  waitForProjectedAccountState,
} from "../scripts/lib/app-server-probe.mjs";

test("accepts only the verified Codex 0.146.0 compatibility interval", () => {
  assert.equal(assertSupportedCodexVersion("codex-cli 0.146.0\n"), "codex-cli 0.146.0");
  for (const version of [
    "codex-cli 0.145.9",
    "codex-cli 0.146.1",
    "codex-cli 0.146.9",
    "codex-cli 0.147.0",
    "codex-cli 0.146.0-dev",
  ]) {
    assert.throws(() => assertSupportedCodexVersion(version), /CODEX_VERSION_UNSUPPORTED/);
  }
});

test("bounds version and initialization probes and cleans a hung child", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(process.env.OPEN_DEUTSCH_DATA_ROOT, "app-server-test-"),
  );
  const pidFile = path.join(temporaryRoot, "pid");
  const fake = path.resolve("tests/fixtures/fake-app-server-hang.mjs");
  await assert.rejects(
    readSupportedCodexVersion(process.execPath, {
      args: [fake, "version-hang", pidFile],
      timeoutMilliseconds: 50,
    }),
    /CODEX_VERSION_TIMEOUT/,
  );
  await assert.rejects(
    createInitializedAppServerClient(process.execPath, {
      args: [fake, "initialize-hang", pidFile],
      initializeTimeoutMilliseconds: 50,
    }),
    /APP_SERVER_TIMEOUT: initialize/,
  );
  const pid = Number(await readFile(pidFile, "utf8"));
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
  await rm(temporaryRoot, { recursive: true });
});

test("scrubs ambient provider credentials before spawning Codex", () => {
  const environment = buildIsolatedCodexEnvironment(
    {
      PATH: "/bin",
      HOME: "/home/learner",
      CODEX_HOME: "/home/learner/.codex",
      OPENAI_API_KEY: "poison",
      CODEX_API_KEY: "poison",
      CODEX_REMOTE_TOKEN: "poison",
      AWS_ACCESS_KEY_ID: "poison",
      AWS_SECRET_ACCESS_KEY: "poison",
      AZURE_OPENAI_API_KEY: "poison",
    },
    { home: "/disposable/home", codexHome: "/disposable/codex" },
  );
  assert.deepEqual(environment, {
    PATH: "/bin",
    HOME: "/disposable/home",
    CODEX_HOME: "/disposable/codex",
  });
});

test("detects credential-shaped fields recursively without matching ordinary account state", () => {
  assert.equal(containsCredentialMaterial({ result: { account: { type: "chatgpt" } } }), false);
  for (const value of [
    { accessToken: "secret" },
    { result: { nested: [{ idToken: "secret" }] } },
    { account: { refreshToken: "secret" } },
    { params: { apiKey: "secret" } },
  ]) {
    assert.equal(containsCredentialMaterial(value), true);
  }
});

test("exposes managed ChatGPT login only and has no API-key input path", () => {
  assert.deepEqual(managedLoginParams("chatgptDeviceCode"), { type: "chatgptDeviceCode" });
  assert.deepEqual(managedLoginParams("chatgpt"), {
    type: "chatgpt",
    useHostedLoginSuccessPage: true,
    appBrand: "chatgpt",
  });
  for (const forbidden of ["apiKey", "chatgptAuthTokens", "amazonBedrock", undefined]) {
    assert.throws(() => managedLoginParams(forbidden), /OPEN_DEUTSCH_MANAGED_CHATGPT_ONLY/);
  }
});

test("projects account state without raw authentication material or email", () => {
  assert.deepEqual(
    projectAccountState({
      account: {
        type: "chatgpt",
        email: "private@example.invalid",
        planType: "plus",
        accessToken: "must-not-cross-boundary",
      },
    }),
    { status: "signedIn", authMode: "chatgpt", planType: "plus" },
  );
  assert.deepEqual(projectAccountState({ account: null }), {
    status: "signedOut",
    authMode: null,
    planType: null,
  });
  assert.deepEqual(projectAccountState({ account: { type: "apiKey" } }), {
    status: "unsupported",
    authMode: null,
    planType: null,
  });
});

test("waits for account state to settle after a successful login notification", async () => {
  const responses = [
    { account: null },
    { account: { type: "chatgpt", email: "private@example.invalid", planType: "plus" } },
  ];
  const client = {
    request(method, params) {
      assert.equal(method, "account/read");
      assert.deepEqual(params, { refreshToken: false });
      return Promise.resolve(responses.shift());
    },
  };
  assert.deepEqual(
    await waitForProjectedAccountState(client, "signedIn", {
      timeoutMilliseconds: 100,
      pollIntervalMilliseconds: 0,
    }),
    { status: "signedIn", authMode: "chatgpt", planType: "plus" },
  );
});

test("projects paginated visible models and preserves missing-field fallbacks", async () => {
  const pages = [
    {
      data: [
        {
          id: "model-a",
          displayName: "Model A",
          isDefault: true,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "private presentation copy" },
            { reasoningEffort: "medium" },
          ],
        },
      ],
      nextCursor: "page-2",
    },
    {
      data: [{ model: "model-b", inputModalities: ["text"] }],
      nextCursor: null,
    },
  ];
  const client = {
    request(method, params) {
      assert.equal(method, "model/list");
      assert.equal(params.includeHidden, false);
      assert.equal(params.cursor, pages.length === 2 ? undefined : "page-2");
      return Promise.resolve(pages.shift());
    },
  };
  assert.deepEqual(await readProjectedModelCatalog(client), {
    models: [
      {
        id: "model-a",
        displayName: "Model A",
        isDefault: true,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: ["low", "medium"],
        inputModalities: ["text", "image"],
      },
      {
        id: "model-b",
        displayName: "model-b",
        isDefault: false,
        defaultReasoningEffort: null,
        supportedReasoningEfforts: [],
        inputModalities: ["text"],
      },
    ],
    runtimeDefaultModelId: "model-a",
    missingReasoningMetadata: ["model-b"],
  });
});

test("fails closed on malformed or inconsistent model metadata", () => {
  for (const data of [
    null,
    [{ id: "duplicate" }, { id: "duplicate" }],
    [
      {
        id: "bad-default",
        defaultReasoningEffort: "high",
        supportedReasoningEfforts: [{ reasoningEffort: "low" }],
      },
    ],
    [{ id: "bad-effort", supportedReasoningEfforts: [{}] }],
    [{ id: "bad-boolean", isDefault: "true" }],
    [{ id: "bad-optional", defaultReasoningEffort: "" }],
    [
      { id: "first-default", isDefault: true },
      { id: "second-default", isDefault: true },
    ],
  ]) {
    assert.throws(() => projectModelCatalog({ data }), /APP_SERVER_MODEL_CATALOG_INVALID/);
  }
});

test("projects rate-limit status without opaque credit or account details", () => {
  assert.deepEqual(
    projectRateLimits({
      rateLimitsByLimitId: {
        codex: {
          limitId: "codex",
          planType: "pro",
          primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: 1_730_947_200 },
          secondary: null,
          rateLimitReachedType: null,
        },
      },
      rateLimitResetCredits: {
        availableCount: 2,
        credits: [{ id: "opaque-private-id", title: "not projected" }],
      },
    }),
    {
      status: "available",
      buckets: [
        {
          limitId: "codex",
          planType: "pro",
          primary: {
            usedPercent: 25,
            windowDurationMins: 15,
            resetsAt: 1_730_947_200,
          },
          secondary: null,
          rateLimitReachedType: null,
        },
      ],
      resetCreditsAvailableCount: 2,
    },
  );
  assert.deepEqual(projectRateLimits({}), {
    status: "unavailable",
    buckets: [],
    resetCreditsAvailableCount: null,
  });
  assert.equal(
    projectRateLimits({
      rateLimitsByLimitId: {},
      rateLimits: { limitId: "legacy", primary: { usedPercent: 1 } },
    }).buckets[0].limitId,
    "legacy",
  );
  for (const value of [
    { rateLimitsByLimitId: [] },
    { rateLimits: "malformed" },
    { rateLimits: { primary: { usedPercent: "25" } } },
    { rateLimitResetCredits: { availableCount: "2" } },
  ]) {
    assert.throws(() => projectRateLimits(value), /APP_SERVER_RATE_LIMITS_INVALID/);
  }
});

test("keeps authenticated probing explicit, isolated, and outside deterministic tests", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  assert.doesNotMatch(manifest.scripts["test:fast"], /probe:app-server/);
  assert.match(manifest.scripts["probe:app-server:authenticated"], /confirm-and-run\.mjs/);
  assert.match(
    manifest.scripts["probe:app-server:capabilities:authenticated"],
    /confirm-and-run\.mjs/,
  );
  for (const path of [
    "scripts/probe-app-server-authenticated.mjs",
    "scripts/probe-app-server-capabilities-authenticated.mjs",
  ]) {
    const script = await readFile(path, "utf8");
    assert.match(script, /OPEN_DEUTSCH_INTERACTIVE_CONFIRMATION/);
    assert.match(script, /createDisposableDataHarness/);
    assert.match(script, /buildIsolatedCodexEnvironment/);
    assert.match(script, /codexHome,/);
    assert.match(script, /home: isolatedHome/);
    assert.match(script, /env: codexEnvironment/);
    assert.match(script, /account\/logout/);
    assert.doesNotMatch(script, /accessToken|apiKey/);
  }
});
