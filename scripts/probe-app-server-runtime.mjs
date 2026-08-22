import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildIsolatedCodexEnvironment,
  createInitializedAppServerClient,
  managedLoginParams,
  projectAccountState,
  readSupportedCodexVersion,
} from "./lib/app-server-probe.mjs";
import { createDisposableDataHarness } from "../tests/support/disposable-data.mjs";

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

async function startClient() {
  return createInitializedAppServerClient(codexExecutable, {
    cwd: process.cwd(),
    env: codexEnvironment,
  });
}

async function startAndCancelLogin(client, type) {
  const started = await client.request("account/login/start", managedLoginParams(type), 20_000);
  const completed = client.waitForNotification(
    "account/login/completed",
    ({ loginId }) => loginId === started.loginId,
    20_000,
  );
  await client.request("account/login/cancel", { loginId: started.loginId });
  const notification = await completed;
  return {
    type: started.type,
    hasLoginId: typeof started.loginId === "string" && started.loginId.length > 0,
    hasBrowserUrl: type === "chatgpt" ? /^https:\/\//.test(started.authUrl) : undefined,
    hasDeviceUrl:
      type === "chatgptDeviceCode" ? /^https:\/\//.test(started.verificationUrl) : undefined,
    hasUserCode: type === "chatgptDeviceCode" ? typeof started.userCode === "string" : undefined,
    cancelled: notification.params.success === false,
  };
}

let first;
let second;
try {
  await mkdir(codexHome, { mode: 0o700 });
  await mkdir(isolatedHome, { mode: 0o700 });
  const codexVersion = await readSupportedCodexVersion(codexExecutable, {
    env: codexEnvironment,
  });

  const firstRun = await startClient();
  first = firstRun.client;
  const before = projectAccountState(await first.request("account/read", { refreshToken: false }));
  if (before.status !== "signedOut") throw new Error("ISOLATED_CODEX_HOME_NOT_SIGNED_OUT");

  const browser = await startAndCancelLogin(first, "chatgpt");
  const device = await startAndCancelLogin(first, "chatgptDeviceCode");
  const accountUpdated = first.waitForNotification("account/updated", () => true, 10_000);
  await first.request("account/logout");
  const logout = await accountUpdated;
  const firstClose = await first.close();
  const firstCredentialMaterialObserved = first.credentialMaterialObserved();
  first = undefined;

  const secondRun = await startClient();
  second = secondRun.client;
  const restored = projectAccountState(
    await second.request("account/read", { refreshToken: false }),
  );
  const secondClose = await second.close();
  const secondCredentialMaterialObserved = second.credentialMaterialObserved();
  second = undefined;

  const evidence = {
    codexVersion,
    initialization: {
      first: Boolean(firstRun.initialized?.userAgent),
      second: Boolean(secondRun.initialized?.userAgent),
    },
    accountBefore: before,
    browser,
    device,
    logout: {
      responseReceived: true,
      authMode: logout.params.authMode ?? null,
      planType: logout.params.planType ?? null,
    },
    restored,
    exits: { first: firstClose.code, second: secondClose.code },
    rawTokensObserved: firstCredentialMaterialObserved || secondCredentialMaterialObserved,
    apiKeyPathExposed: false,
  };
  if (evidence.exits.first !== 0 || evidence.exits.second !== 0) {
    throw new Error("APP_SERVER_DID_NOT_EXIT_CLEANLY");
  }
  if (evidence.rawTokensObserved) throw new Error("APP_SERVER_EXPOSED_CREDENTIAL_MATERIAL");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "signed-out-runtime.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write("[PASS] APP_SERVER_SIGNED_OUT_RUNTIME\n");
} finally {
  await first?.close();
  await second?.close();
  await harness.cleanup();
}
