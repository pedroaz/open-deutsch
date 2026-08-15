#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import {
  clearLifecycleLogs,
  killMode,
  lifecycleModes,
  lifecyclePaths,
  startMode,
  statusMode,
} from "./lib/lifecycle.mjs";

const root = path.resolve(import.meta.dirname, "..");
const invalidRuntimeOverride =
  process.env.OPEN_DEUTSCH_RUNTIME_DIR && process.env.OPEN_DEUTSCH_TEST_MODE !== "1";
const runtimeRoot = path.resolve(
  process.env.OPEN_DEUTSCH_RUNTIME_DIR || path.join(root, ".runtime"),
);
const [action, mode, ...flags] = process.argv.slice(2);

function assertNoUnknownFlags(allowed) {
  const unknown = flags.filter((flag) => !allowed.includes(flag));
  if (unknown.length > 0) throw new Error(`Unknown lifecycle flag: ${unknown.join(", ")}`);
}

async function status() {
  for (const lifecycleMode of lifecycleModes) {
    const result = await statusMode({ mode: lifecycleMode, runtimeRoot });
    process.stdout.write(
      `${result.mode}: ${result.status}${result.pid ? ` pid=${result.pid}` : ""}${result.reason ? ` reason=${result.reason}` : ""}\n`,
    );
  }
}

async function kill() {
  let incomplete = false;
  for (const lifecycleMode of lifecycleModes) {
    const result = await killMode({ mode: lifecycleMode, runtimeRoot });
    process.stdout.write(
      `${result.mode}: ${result.status}${result.reason ? ` reason=${result.reason}` : ""}\n`,
    );
    if (result.status === "unsafe-state-retained") incomplete = true;
  }
  if (incomplete) process.exitCode = 1;
}

async function printLog(log, errorsOnly, offset = 0) {
  try {
    const contents = await readFile(log, "utf8");
    const next = Buffer.byteLength(contents);
    const fresh = Buffer.from(contents).subarray(offset).toString("utf8");
    for (const line of fresh.split("\n")) {
      if (line && (!errorsOnly || /\s(?:WARN|ERROR)\s/.test(line)))
        process.stdout.write(`${line}\n`);
    }
    return next;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

async function logs() {
  const follow = mode === "--follow" || flags.includes("--follow");
  const errorsOnly = mode === "--errors" || flags.includes("--errors");
  const unknown = [mode, ...flags].filter(
    (value) => value && value !== "--follow" && value !== "--errors",
  );
  if (unknown.length > 0) throw new Error(`Unknown logs flag: ${unknown.join(", ")}`);
  const positions = new Map();
  for (const lifecycleMode of lifecycleModes) {
    const log = lifecyclePaths(runtimeRoot, lifecycleMode).log;
    positions.set(log, await printLog(log, errorsOnly));
  }
  if (!follow) return;
  process.stdout.write("Following Open Deutsch lifecycle logs. Press Ctrl-C to stop.\n");
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const [log, position] of positions) {
      try {
        const info = await stat(log);
        const offset = info.size < position ? 0 : position;
        positions.set(log, await printLog(log, errorsOnly, offset));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
}

async function logsClear() {
  const logsDirectory = path.join(runtimeRoot, "logs");
  process.stdout.write(`Resolved Open Deutsch log directory: ${logsDirectory}\n`);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Log clearing requires an interactive terminal confirmation.");
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question('Type "clear" to remove only these lifecycle logs: ');
  readline.close();
  if (answer !== "clear") throw new Error("Log clearing cancelled.");
  const removed = await clearLifecycleLogs(runtimeRoot);
  process.stdout.write(`Removed ${removed.length} Open Deutsch lifecycle log file(s).\n`);
}

try {
  if (invalidRuntimeOverride) {
    throw new Error("OPEN_DEUTSCH_RUNTIME_DIR is accepted only with OPEN_DEUTSCH_TEST_MODE=1.");
  }
  if (action === "start") {
    if (!lifecycleModes.includes(mode)) throw new Error("Start requires mode dev or prd.");
    assertNoUnknownFlags([]);
    const state = await startMode({
      mode,
      runtimeRoot,
      cwd: root,
      command: ["pnpm", "run", `service:${mode}`],
    });
    process.stdout.write(`${mode}: ready pid=${state.pid}\n`);
  } else if (action === "status") {
    if (mode) throw new Error("Status does not accept arguments.");
    await status();
  } else if (action === "kill") {
    if (mode) throw new Error("Kill does not accept arguments.");
    await kill();
  } else if (action === "logs") {
    await logs();
  } else if (action === "logs-clear") {
    if (mode) throw new Error("logs-clear does not accept arguments.");
    await logsClear();
  } else {
    throw new Error(
      "Usage: lifecycle.mjs start <dev|prd> | status | kill | logs [--follow] [--errors] | logs-clear",
    );
  }
} catch (error) {
  process.stderr.write(`[LIFECYCLE_ERROR] ${error.message}\n`);
  process.exitCode = 1;
}
