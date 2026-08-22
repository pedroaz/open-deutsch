import { createDisposableDataHarness } from "./disposable-data.mjs";

let harness;
let inheritedEnvironment;

export async function globalSetup() {
  inheritedEnvironment = { ...process.env };
  harness = await createDisposableDataHarness();
  Object.assign(process.env, harness.environment(process.env));
}

export async function globalTeardown() {
  if (!harness || !inheritedEnvironment) return;
  await harness.cleanup();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, inheritedEnvironment);
}
