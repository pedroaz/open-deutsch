import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  clearLifecycleLogs,
  killMode,
  lifecyclePaths,
  startMode,
  statusMode,
} from "../scripts/lib/lifecycle.mjs";

const fixture = path.resolve("tests/fixtures/lifecycle-service.mjs");

async function temporaryRuntime() {
  return mkdtemp(path.join(tmpdir(), "open-deutsch-lifecycle-test-"));
}

test("starts in the background, waits for readiness, reports status, and stops exactly", async () => {
  const runtimeRoot = await temporaryRuntime();
  const state = await startMode({
    mode: "dev",
    runtimeRoot,
    cwd: process.cwd(),
    command: [process.execPath, fixture, "ready"],
    timeoutMs: 2_000,
  });
  assert.equal(state.status, "ready");
  assert.equal((await statusMode({ mode: "dev", runtimeRoot })).status, "ready");
  await assert.rejects(
    startMode({
      mode: "dev",
      runtimeRoot,
      cwd: process.cwd(),
      command: [process.execPath, fixture, "ready"],
      timeoutMs: 500,
    }),
    /already running/,
  );
  assert.equal((await killMode({ mode: "dev", runtimeRoot })).status, "stopped");
  assert.equal((await killMode({ mode: "dev", runtimeRoot })).status, "already-stopped");
});

test("cleans state when a service exits before readiness", async () => {
  const runtimeRoot = await temporaryRuntime();
  await assert.rejects(
    startMode({
      mode: "prd",
      runtimeRoot,
      cwd: process.cwd(),
      command: [process.execPath, fixture, "exit"],
      timeoutMs: 1_000,
    }),
    /exited before reporting readiness/,
  );
  assert.equal((await statusMode({ mode: "prd", runtimeRoot })).status, "stopped");
});

test("stops a service that emits an invalid or stale readiness signal", async () => {
  const runtimeRoot = await temporaryRuntime();
  await assert.rejects(
    startMode({
      mode: "prd",
      runtimeRoot,
      cwd: process.cwd(),
      command: [process.execPath, fixture, "invalid-ready"],
      timeoutMs: 1_000,
    }),
    /invalid or stale readiness signal/,
  );
  assert.equal((await statusMode({ mode: "prd", runtimeRoot })).status, "stopped");
});

test("terminates the complete owned process group and escalates for a stubborn descendant", async () => {
  const runtimeRoot = await temporaryRuntime();
  await startMode({
    mode: "dev",
    runtimeRoot,
    cwd: process.cwd(),
    command: [process.execPath, fixture, "stubborn"],
    timeoutMs: 2_000,
  });
  const childPid = Number(
    await readFile(`${lifecyclePaths(runtimeRoot, "dev").ready}.child-pid`, "utf8"),
  );
  assert.equal(process.kill(childPid, 0), true);
  assert.equal((await killMode({ mode: "dev", runtimeRoot, graceMs: 200 })).status, "stopped");

  let alive = true;
  for (let attempt = 0; attempt < 20 && alive; attempt += 1) {
    try {
      process.kill(childPid, 0);
      await new Promise((resolve) => setTimeout(resolve, 25));
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
      else throw error;
    }
  }
  assert.equal(alive, false, `stubborn descendant ${childPid} survived group termination`);
});

test("cleans stubborn descendants when startup readiness times out", async () => {
  const runtimeRoot = await temporaryRuntime();
  await assert.rejects(
    startMode({
      mode: "prd",
      runtimeRoot,
      cwd: process.cwd(),
      command: [process.execPath, fixture, "stubborn-timeout"],
      timeoutMs: 100,
    }),
    /did not become ready/,
  );
  const childPid = Number(
    await readFile(`${lifecyclePaths(runtimeRoot, "prd").ready}.child-pid`, "utf8"),
  );
  assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
  assert.equal((await statusMode({ mode: "prd", runtimeRoot })).status, "stopped");
});

test("retains ownership state when a leader exits but its process group survives", async () => {
  const runtimeRoot = await temporaryRuntime();
  const state = await startMode({
    mode: "dev",
    runtimeRoot,
    cwd: process.cwd(),
    command: [process.execPath, fixture, "orphan"],
    timeoutMs: 2_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const status = await statusMode({ mode: "dev", runtimeRoot });
  assert.equal(status.status, "orphaned");
  assert.equal(status.reason, "orphaned-process-group");

  const stopped = await killMode({ mode: "dev", runtimeRoot, graceMs: 100 });
  assert.equal(stopped.status, "unsafe-state-retained");
  assert.equal(stopped.reason, "orphaned-process-group");
  await assert.rejects(
    startMode({
      mode: "dev",
      runtimeRoot,
      cwd: process.cwd(),
      command: [process.execPath, fixture, "ready"],
      timeoutMs: 500,
    }),
    /retained lifecycle state \(orphaned-process-group\)/,
  );

  process.kill(-state.processGroupId, "SIGKILL");
});

test("reports a missing service executable without an unhandled child error", async () => {
  const runtimeRoot = await temporaryRuntime();
  await assert.rejects(
    startMode({
      mode: "dev",
      runtimeRoot,
      cwd: process.cwd(),
      command: [path.join(runtimeRoot, "missing-executable")],
      timeoutMs: 500,
    }),
    /Could not start dev/,
  );
});

test("never signals a PID whose Linux start identity does not match", async () => {
  const runtimeRoot = await temporaryRuntime();
  const paths = lifecyclePaths(runtimeRoot, "dev");
  await writeFile(
    paths.state,
    `${JSON.stringify({ pid: process.pid, startTicks: "not-this-process", mode: "dev" })}\n`,
    { recursive: true },
  ).catch(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      paths.state,
      `${JSON.stringify({ pid: process.pid, startTicks: "not-this-process", mode: "dev" })}\n`,
    );
  });
  const result = await killMode({ mode: "dev", runtimeRoot });
  assert.equal(result.status, "unsafe-state-retained");
  assert.equal(result.reason, "pid-reused");
  assert.equal(process.kill(process.pid, 0), true);
});

test("clears only known lifecycle log files", async () => {
  const runtimeRoot = await temporaryRuntime();
  const paths = lifecyclePaths(runtimeRoot, "dev");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(paths.logs, { recursive: true });
  await writeFile(paths.log, "known\n");
  const unrelated = path.join(paths.logs, "unrelated.log");
  await writeFile(unrelated, "keep\n");
  const removed = await clearLifecycleLogs(runtimeRoot);
  assert.deepEqual(removed, [paths.log]);
  assert.equal(await readFile(unrelated, "utf8"), "keep\n");
});
