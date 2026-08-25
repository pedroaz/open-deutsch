#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import path from "node:path";

import { lifecycleModes, statusMode } from "./lib/lifecycle.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const runtimeRoot = path.join(repositoryRoot, ".runtime");

async function run(command, args, environment = process.env) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(`LIVE_TEST_COMMAND_FAILED:${String(code)}${signal ? `:${signal}` : ""}`);
  }
}

for (const mode of lifecycleModes) {
  const state = await statusMode({ mode, runtimeRoot });
  if (state.status === "running" || state.status === "ready") {
    throw new Error(`LIVE_TEST_APP_ALREADY_RUNNING:${mode}`);
  }
}

process.stderr.write(
  [
    "WARNING: this live journey launches the production Electron app.",
    "It uses the connected Codex account, may consume usage, and reads and writes the selected real learner dataset.",
    "On success it deletes the generated lesson and its unconfirmed vocabulary through the UI.",
    "On failure it may leave the generated record for manual cleanup.",
    "Starting the live Practice journey now.",
  ].join("\n") + "\n",
);

await run(process.execPath, ["scripts/check-toolchain.mjs", "--require-codex"]);
await run("pnpm", ["--filter", "@open-deutsch/desktop", "run", "build"]);
const playwrightOutput = "/tmp/open-deutsch-live-playwright";
try {
  await run(
    "xvfb-run",
    [
      "-a",
      "pnpm",
      "--workspace-root",
      "exec",
      "playwright",
      "test",
      "--config",
      "playwright.live.config.mjs",
    ],
    {
      ...process.env,
      PLAYWRIGHT_NO_COPY_PROMPT: "1",
    },
  );
} finally {
  await rm(playwrightOutput, { recursive: true, force: true });
}
