#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(desktopRoot, "../..");
const configuration = process.argv[2];
if (configuration !== "playwright.config.mjs") {
  throw new Error("OD_DESKTOP_E2E_CONFIGURATION_INVALID");
}

async function run(arguments_) {
  const child = spawn("pnpm", arguments_, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(
      `Desktop E2E command failed with ${String(code)}${signal ? ` (${signal})` : ""}.`,
    );
  }
}

await run(["--filter", "@open-deutsch/desktop", "run", "build"]);
await run(["--workspace-root", "exec", "playwright", "test", "--config", configuration]);
