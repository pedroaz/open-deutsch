import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("the Node test runner receives an automatic disposable bootstrap environment", async () => {
  const dataRoot = process.env.OPEN_DEUTSCH_DATA_ROOT;
  const bootstrapFile = process.env.OPEN_DEUTSCH_BOOTSTRAP_FILE;
  const configRoot = process.env.XDG_CONFIG_HOME;
  assert.match(path.basename(path.dirname(dataRoot ?? "")), /^open-deutsch-test-data-/);
  assert.ok(["/tmp", "/var/tmp"].includes(path.dirname(path.dirname(dataRoot ?? ""))));
  assert.ok(bootstrapFile?.startsWith(path.dirname(dataRoot)));
  assert.ok(configRoot?.startsWith(path.dirname(dataRoot)));

  const bootstrap = JSON.parse(await readFile(bootstrapFile, "utf8"));
  assert.equal(bootstrap.dataRoot, dataRoot);
  assert.equal(bootstrap.testRunId, process.env.OPEN_DEUTSCH_TEST_RUN_ID);
  assert.equal((await stat(dataRoot)).mode & 0o777, 0o700);
});

test("a poisoned learner environment is replaced before Vitest code runs", async () => {
  const apparentLearnerRoot = await mkdtemp(path.join(tmpdir(), "open-deutsch-real-looking-"));
  const sentinel = path.join(apparentLearnerRoot, "do-not-touch.txt");
  try {
    await writeFile(sentinel, "learner-owned\n", { mode: 0o600 });
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "tests/vitest/import-time-data-environment.test.ts",
        "--project",
        "test-support",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          OPEN_DEUTSCH_DATA_ROOT: apparentLearnerRoot,
          OPEN_DEUTSCH_BOOTSTRAP_FILE: path.join(apparentLearnerRoot, "bootstrap.json"),
          XDG_CONFIG_HOME: apparentLearnerRoot,
          OPEN_DEUTSCH_TEST_POISON_ROOT: apparentLearnerRoot,
          TMPDIR: apparentLearnerRoot,
          TEMP: apparentLearnerRoot,
          TMP: apparentLearnerRoot,
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(await readFile(sentinel, "utf8"), "learner-owned\n");
    assert.deepEqual(await readdir(apparentLearnerRoot), ["do-not-touch.txt"]);
    await assert.rejects(stat(path.join(apparentLearnerRoot, "bootstrap.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(apparentLearnerRoot, { recursive: true });
  }
});
