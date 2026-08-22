#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";

const [kind, scriptName] = process.argv.slice(2);
if (!kind || !scriptName || process.argv.length !== 4) {
  process.stderr.write("Usage: node scripts/confirm-and-run.mjs <kind> <internal-script>\n");
  process.exit(2);
}

process.stderr.write(
  `WARNING: ${kind} verification uses the managed personal Codex account and may consume usage. It must use disposable Open Deutsch data only.\n`,
);
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write("Confirmation requires an interactive terminal; no verification was run.\n");
  process.exit(2);
}

const readline = createInterface({ input: process.stdin, output: process.stdout });
const answer = await readline.question('Type "yes" to continue: ');
readline.close();
if (answer !== "yes") {
  process.stderr.write("Verification cancelled; no account-consuming command was run.\n");
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  ["scripts/run-required-workspace-script.mjs", scriptName, "--require-codex"],
  {
    stdio: "inherit",
    env: { ...process.env, OPEN_DEUTSCH_INTERACTIVE_CONFIRMATION: "yes" },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
