import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(".");
const requiredTargets = [
  "help",
  "setup",
  "dev",
  "prd",
  "start",
  "status",
  "kill",
  "logs",
  "logs-errors",
  "logs-clear",
  "typecheck",
  "lint",
  "lint-fix",
  "format",
  "format-check",
  "check",
  "test-fast",
  "test",
  "test-e2e",
  "test-plugin",
  "test-all",
  "doctor",
  "package",
  "verify-live",
  "verify-plugin",
  "install-plugin",
  "refresh-plugin",
  "plugin-status",
  "uninstall-plugin",
];

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
}

test("documents every public Make target in English help", () => {
  const result = run("make", ["help"]);
  assert.equal(result.status, 0, result.stderr);
  for (const target of requiredTargets) assert.match(result.stdout, new RegExp(`\\b${target}\\b`));
});

test("keeps start and test as exact Make aliases", () => {
  const makefile = run("make", ["-n", "test-fast"]);
  const alias = run("make", ["-n", "test"]);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(alias.stdout, makefile.stdout);

  return readFile("Makefile", "utf8").then((contents) => {
    assert.match(contents, /^start: prd ##/m);
    assert.match(contents, /^test: test-fast ##/m);
  });
});

test("delegates every public workflow to a complete pnpm script", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  for (const script of [
    "setup",
    "dev",
    "prd",
    "status",
    "kill",
    "logs",
    "logs:errors",
    "logs:clear",
    "typecheck",
    "lint",
    "lint:fix",
    "format",
    "format:check",
    "check",
    "test:fast",
    "test:e2e",
    "test:plugin",
    "test:all",
    "doctor",
    "package",
    "verify:live",
    "verify:plugin",
    "plugin:install",
    "plugin:refresh",
    "plugin:status",
    "plugin:uninstall",
  ]) {
    assert.equal(typeof manifest.scripts[script], "string", script);
    assert.ok(manifest.scripts[script].length > 4, script);
  }
});

test("never includes live verification in deterministic aggregate scripts", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  for (const script of ["check", "test:fast", "test:e2e", "test:plugin", "test:all"]) {
    assert.doesNotMatch(manifest.scripts[script], /verify:(?:live|plugin)/, script);
  }
});

test("refuses live verification without an interactive confirmation", () => {
  const result = run(process.execPath, ["scripts/confirm-and-run.mjs", "live", "verify:live:run"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /may consume usage/);
  assert.match(result.stderr, /requires an interactive terminal/);
});

test("fails unavailable later-owned workflows clearly instead of reporting false success", () => {
  const result = run(process.execPath, [
    "scripts/run-required-workspace-script.mjs",
    "not-implemented-test-script",
  ]);
  assert.equal(result.status, 78);
  assert.match(result.stderr, /\[UNAVAILABLE\]/);
});

test("status and idempotent kill are safe with an empty disposable runtime", async () => {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), "open-deutsch-make-test-"));
  const env = {
    ...process.env,
    OPEN_DEUTSCH_RUNTIME_DIR: runtimeRoot,
    OPEN_DEUTSCH_TEST_MODE: "1",
  };
  const status = run(process.execPath, ["scripts/lifecycle.mjs", "status"], { env });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /dev: stopped/);
  assert.match(status.stdout, /prd: stopped/);
  const kill = run(process.execPath, ["scripts/lifecycle.mjs", "kill"], { env });
  assert.equal(kill.status, 0, kill.stderr);
  assert.match(kill.stdout, /already-stopped/);
});
