#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { existsSync } from "node:fs";
import { readdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const budgetMilliseconds = 20_000;
const taskset =
  process.platform === "linux" &&
  ["/usr/bin/taskset", "/bin/taskset"].find((candidate) => existsSync(candidate));
const parallelism = os.availableParallelism?.() ?? os.cpus().length;
const canIsolateTestProcesses = Boolean(taskset) && parallelism >= 4;

function constrained(command, args, cpuRange) {
  return canIsolateTestProcesses
    ? { command: taskset, args: ["-c", cpuRange, command, ...args] }
    : { command, args };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`OD_TEST_FAST_SIGNAL:${signal}`));
      else if (code !== 0) reject(new Error(`OD_TEST_FAST_EXIT:${code}`));
      else resolve();
    });
  });
}

async function timedStage(name, command, args) {
  const started = performance.now();
  await run(command, args);
  const durationMilliseconds = Math.round(performance.now() - started);
  process.stdout.write(`[FAST_TEST_STAGE] ${JSON.stringify({ name, durationMilliseconds })}\n`);
  return durationMilliseconds;
}

async function nodeTestFiles() {
  return (await readdir(path.join(repositoryRoot, "tests")))
    .filter((file) => file.endsWith(".test.mjs"))
    .sort()
    .map((file) => path.join("tests", file));
}

async function main() {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), "open-deutsch-test-fast-"));
  const vitestReport = path.join(reportDirectory, "vitest.json");
  const stages = [];
  const started = performance.now();
  try {
    stages.push(
      await timedStage("mcp-build", process.execPath, [
        "node_modules/typescript/bin/tsc",
        "-b",
        "apps/mcp-server/tsconfig.json",
      ]),
    );
    const artifactValidation = timedStage("artifact-validation", process.execPath, [
      "scripts/validate-artifacts.mjs",
    ]);
    const nodeTestCommand = constrained(
      process.execPath,
      [
        "--test-global-setup=./tests/support/node-disposable-data.mjs",
        "--test",
        ...(await nodeTestFiles()),
      ],
      `0-${Math.floor(parallelism / 2) - 1}`,
    );
    const nodeTests = timedStage("node-tests", nodeTestCommand.command, nodeTestCommand.args);
    const vitestCommand = constrained(
      process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", "--reporter=json", `--outputFile=${vitestReport}`],
      `${Math.floor(parallelism / 2)}-${parallelism - 1}`,
    );
    const vitest = timedStage("vitest", vitestCommand.command, vitestCommand.args);
    stages.push(...(await Promise.all([artifactValidation, nodeTests, vitest])));

    const report = JSON.parse(await readFile(vitestReport, "utf8"));
    const slowFiles = report.testResults
      .map((result) => ({
        file: path.relative(repositoryRoot, result.name),
        durationMilliseconds: Math.round(result.endTime - result.startTime),
      }))
      .sort((left, right) => right.durationMilliseconds - left.durationMilliseconds)
      .slice(0, 5);
    const wallMilliseconds = Math.round(performance.now() - started);
    const cumulativeStageMilliseconds = stages.reduce((total, duration) => total + duration, 0);
    process.stdout.write(
      `[FAST_TEST_SLOW_FILES] ${JSON.stringify({ thresholdMilliseconds: 250, files: slowFiles })}\n`,
    );
    process.stdout.write(
      `[FAST_TEST_SUMMARY] ${JSON.stringify({
        schemaVersion: 1,
        wallMilliseconds,
        cumulativeStageMilliseconds,
        budgetMilliseconds,
        underWarmBudget: wallMilliseconds < budgetMilliseconds,
        electronExcluded: true,
        liveVerificationExcluded: true,
        cpuIsolation: canIsolateTestProcesses,
      })}\n`,
    );
    if (wallMilliseconds >= budgetMilliseconds) {
      throw new Error(`OD_TEST_FAST_BUDGET_EXCEEDED:${wallMilliseconds}`);
    }
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

await main();
