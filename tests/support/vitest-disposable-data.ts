import { afterAll, afterEach, beforeEach } from "vitest";

import { createDisposableDataHarness, type DisposableDataHarness } from "./disposable-data.mjs";

const isolatedEnvironmentKeys = [
  "OPEN_DEUTSCH_TEST_MODE",
  "OPEN_DEUTSCH_TEST_RUN_ID",
  "OPEN_DEUTSCH_DATA_ROOT",
  "OPEN_DEUTSCH_BOOTSTRAP_FILE",
  "XDG_CONFIG_HOME",
] as const;

const inheritedEnvironment = new Map(
  isolatedEnvironmentKeys.map((key) => [key, process.env[key]] as const),
);
const workerHarness = await createDisposableDataHarness();

function installEnvironment(harness: DisposableDataHarness): void {
  const environment = harness.environment(process.env);
  for (const key of isolatedEnvironmentKeys) {
    const value = environment[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

function restoreInheritedEnvironment(): void {
  for (const [key, value] of inheritedEnvironment) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

installEnvironment(workerHarness);

declare module "vitest" {
  export interface TestContext {
    disposableData: DisposableDataHarness;
  }
}

beforeEach(async (context) => {
  context.disposableData = await createDisposableDataHarness();
  installEnvironment(context.disposableData);
});

afterEach(async ({ disposableData }) => {
  try {
    await disposableData.cleanup();
  } finally {
    installEnvironment(workerHarness);
  }
});

afterAll(async () => {
  try {
    await workerHarness.cleanup();
  } finally {
    restoreInheritedEnvironment();
  }
});
