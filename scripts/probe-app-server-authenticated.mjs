import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildIsolatedCodexEnvironment,
  createInitializedAppServerClient,
  managedLoginParams,
  projectAccountState,
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
const evidenceDirectory = path.join(repositoryRoot, "test-results/app-server-spike");
const codexEnvironment = buildIsolatedCodexEnvironment(harness.environment(process.env), {
  codexHome,
  home: isolatedHome,
});
let client;

async function startClient() {
  const started = await createInitializedAppServerClient(codexExecutable, {
    cwd: process.cwd(),
    env: codexEnvironment,
  });
  return started.client;
}

try {
  await mkdir(codexHome, { mode: 0o700 });
  await mkdir(isolatedHome, { mode: 0o700 });
  const codexVersion = await readSupportedCodexVersion(codexExecutable, {
    env: codexEnvironment,
  });

  client = await startClient();
  const initial = projectAccountState(
    await client.request("account/read", { refreshToken: false }),
  );
  if (initial.status !== "signedOut") throw new Error("ISOLATED_CODEX_HOME_NOT_SIGNED_OUT");

  const started = await client.request(
    "account/login/start",
    managedLoginParams("chatgptDeviceCode"),
    20_000,
  );
  process.stdout.write(`\nOpen ${started.verificationUrl}\nEnter code: ${started.userCode}\n\n`);
  const completed = await client.waitForNotification(
    "account/login/completed",
    ({ loginId }) => loginId === started.loginId,
    600_000,
  );
  if (!completed.params.success) throw new Error("MANAGED_CHATGPT_LOGIN_FAILED");

  await client.waitForNotification(
    "account/updated",
    ({ authMode }) => authMode === "chatgpt",
    30_000,
  );

  const signedIn = await waitForProjectedAccountState(client, "signedIn", {
    timeoutMilliseconds: 30_000,
  });
  const firstClose = await client.close();
  const firstCredentialMaterialObserved = client.credentialMaterialObserved();
  client = undefined;

  client = await startClient();
  const restored = await waitForProjectedAccountState(client, "signedIn", {
    timeoutMilliseconds: 30_000,
  });

  const updated = client.waitForNotification(
    "account/updated",
    ({ authMode }) => authMode === null,
  );
  await client.request("account/logout");
  await updated;
  const signedOut = await waitForProjectedAccountState(client, "signedOut", {
    timeoutMilliseconds: 30_000,
  });
  const secondClose = await client.close();
  const secondCredentialMaterialObserved = client.credentialMaterialObserved();
  client = undefined;

  const evidence = {
    codexVersion,
    initial,
    signedIn,
    restored,
    signedOut,
    loginCompleted: true,
    logoutNotification: true,
    exits: { first: firstClose.code, second: secondClose.code },
    rawTokensObserved: firstCredentialMaterialObserved || secondCredentialMaterialObserved,
    normalCodexHomeUsed: false,
  };
  if (evidence.exits.first !== 0 || evidence.exits.second !== 0) {
    throw new Error("APP_SERVER_DID_NOT_EXIT_CLEANLY");
  }
  if (evidence.rawTokensObserved) throw new Error("APP_SERVER_EXPOSED_CREDENTIAL_MATERIAL");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "authenticated-runtime.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write("[PASS] APP_SERVER_AUTHENTICATED_RUNTIME\n");
} finally {
  await client?.close();
  await harness.cleanup();
}
