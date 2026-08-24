import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildIsolatedCodexEnvironment,
  createInitializedAppServerClient,
  managedLoginParams,
  projectAccountState,
  projectRateLimits,
  readProjectedModelCatalog,
  readSupportedCodexVersion,
  waitForProjectedAccountState,
} from "./lib/app-server-probe.mjs";
import { createDisposableDataHarness } from "../tests/support/disposable-data.mjs";

if (process.env.OPEN_DEUTSCH_INTERACTIVE_CONFIRMATION !== "yes") {
  throw new Error("LIVE_AUTH_CONFIRMATION_REQUIRED");
}

const codexExecutable = process.env.CODEX_EXECUTABLE ?? "codex";
const harness = await createDisposableDataHarness();
const codexHome = path.join(harness.sandboxRoot, "codex-home");
const isolatedHome = path.join(harness.sandboxRoot, "home");
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const evidenceDirectory = path.join(repositoryRoot, "test-results/app-server-probe");
const codexEnvironment = buildIsolatedCodexEnvironment(harness.environment(process.env), {
  codexHome,
  home: isolatedHome,
});
let client;

try {
  await mkdir(codexHome, { mode: 0o700 });
  await mkdir(isolatedHome, { mode: 0o700 });
  const codexVersion = await readSupportedCodexVersion(codexExecutable, {
    env: codexEnvironment,
  });
  const startedClient = await createInitializedAppServerClient(codexExecutable, {
    cwd: repositoryRoot,
    env: codexEnvironment,
  });
  client = startedClient.client;

  const initial = projectAccountState(
    await client.request("account/read", { refreshToken: false }),
  );
  if (initial.status !== "signedOut") throw new Error("ISOLATED_CODEX_HOME_NOT_SIGNED_OUT");

  const startedLogin = await client.request(
    "account/login/start",
    managedLoginParams("chatgptDeviceCode"),
    20_000,
  );
  process.stdout.write(
    `\nOpen ${startedLogin.verificationUrl}\nEnter code: ${startedLogin.userCode}\n\n`,
  );
  const completed = await client.waitForNotification(
    "account/login/completed",
    ({ loginId }) => loginId === startedLogin.loginId,
    600_000,
  );
  if (!completed.params.success) throw new Error("MANAGED_CHATGPT_LOGIN_FAILED");
  await client.waitForNotification(
    "account/updated",
    ({ authMode }) => authMode === "chatgpt",
    30_000,
  );

  const account = await waitForProjectedAccountState(client, "signedIn", {
    timeoutMilliseconds: 30_000,
  });
  const catalog = await readProjectedModelCatalog(client);
  if (catalog.models.length === 0) throw new Error("APP_SERVER_MODEL_CATALOG_EMPTY");
  if (
    !catalog.models.some(
      (model) => model.defaultReasoningEffort && model.supportedReasoningEfforts.length > 0,
    )
  ) {
    throw new Error("APP_SERVER_REASONING_METADATA_UNAVAILABLE");
  }

  const rateLimits = projectRateLimits(await client.request("account/rateLimits/read"));
  const updated = client.waitForNotification(
    "account/updated",
    ({ authMode }) => authMode === null,
  );
  await client.request("account/logout");
  await updated;
  const signedOut = await waitForProjectedAccountState(client, "signedOut", {
    timeoutMilliseconds: 30_000,
  });

  const closed = await client.close();
  const rawTokensObserved = client.credentialMaterialObserved();
  client = undefined;
  if (closed.code !== 0) throw new Error("APP_SERVER_DID_NOT_EXIT_CLEANLY");
  if (rawTokensObserved) throw new Error("APP_SERVER_EXPOSED_CREDENTIAL_MATERIAL");

  const evidence = {
    codexVersion,
    initialized: Boolean(startedClient.initialized?.userAgent),
    account,
    catalog,
    rateLimitRead: "succeeded",
    rateLimits,
    signedOut,
    rawTokensObserved,
    normalCodexHomeUsed: false,
    exitCode: closed.code,
  };
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "capabilities-authenticated.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write("[PASS] APP_SERVER_AUTHENTICATED_CAPABILITIES\n");
} finally {
  await client?.close();
  await harness.cleanup();
}
