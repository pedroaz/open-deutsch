import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildIsolatedCodexEnvironment,
  createInitializedAppServerClient,
  projectAccountState,
  projectRateLimits,
  readProjectedModelCatalog,
  readSupportedCodexVersion,
} from "./lib/app-server-probe.mjs";
import { createDisposableDataHarness } from "./lib/disposable-data.mjs";

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
  const started = await createInitializedAppServerClient(codexExecutable, {
    cwd: repositoryRoot,
    env: codexEnvironment,
  });
  client = started.client;

  const account = projectAccountState(
    await client.request("account/read", { refreshToken: false }),
  );
  if (account.status !== "signedOut") throw new Error("ISOLATED_CODEX_HOME_NOT_SIGNED_OUT");

  const catalog = await readProjectedModelCatalog(client);
  if (catalog.models.length === 0) throw new Error("APP_SERVER_MODEL_CATALOG_EMPTY");
  if (
    !catalog.models.some(
      (model) => model.defaultReasoningEffort && model.supportedReasoningEfforts.length > 0,
    )
  ) {
    throw new Error("APP_SERVER_REASONING_METADATA_UNAVAILABLE");
  }

  let rateLimits;
  let rateLimitRead;
  try {
    rateLimits = projectRateLimits(await client.request("account/rateLimits/read"));
    rateLimitRead = "succeeded";
  } catch (error) {
    if (!error.message?.startsWith("APP_SERVER_ERROR: account/rateLimits/read")) throw error;
    rateLimits = projectRateLimits({});
    rateLimitRead = "requiresManagedAccount";
  }

  const closed = await client.close();
  const rawTokensObserved = client.credentialMaterialObserved();
  client = undefined;
  if (closed.code !== 0) throw new Error("APP_SERVER_DID_NOT_EXIT_CLEANLY");
  if (rawTokensObserved) throw new Error("APP_SERVER_EXPOSED_CREDENTIAL_MATERIAL");

  const evidence = {
    codexVersion,
    initialized: Boolean(started.initialized?.userAgent),
    account,
    catalog,
    rateLimitRead,
    rateLimits,
    rawTokensObserved,
    exitCode: closed.code,
  };
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "capabilities-signed-out.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write("[PASS] APP_SERVER_SIGNED_OUT_CAPABILITIES\n");
} finally {
  await client?.close();
  await harness.cleanup();
}
