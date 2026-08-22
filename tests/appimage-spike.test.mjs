import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { makeRuntimeEnvironment } from "../scripts/probe-appimage.mjs";
import { createDisposableDataHarness } from "./support/disposable-data.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("AppImage configuration pins the package boundary and read-only resources", async () => {
  const config = await readFile(
    path.join(repositoryRoot, "apps/desktop/electron-builder.spike.yml"),
    "utf8",
  );
  assert.match(config, /^appId: dev\.opendeutsch\.app$/mu);
  assert.match(config, /^npmRebuild: false$/mu);
  assert.match(config, /^\s*appimage: 1\.0\.3$/mu);
  assert.match(config, /^\s*app: apps\/desktop$/mu);
  assert.match(config, /^\s*- spike\/\*\*$/mu);
  assert.match(config, /^\s*to: curriculum$/mu);
  assert.match(config, /^\s*to: plugin$/mu);
  assert.match(config, /^\s*to: bin\/open-deutsch-mcp-spike\.cjs$/mu);
  assert.doesNotMatch(config, /publish|updater/iu);
  const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  assert.match(rootPackage.scripts.package, /package:appimage.*spike:appimage/u);
});

test("source helper contract resolves the disposable data root and built-in SQLite", async () => {
  const helper = path.join(repositoryRoot, "apps/desktop/spike/open-deutsch-mcp-spike.cjs");
  const harness = await createDisposableDataHarness();
  try {
    const environment = await makeRuntimeEnvironment(harness);
    const { stdout } = await execFileAsync(process.execPath, [helper, "--probe"], {
      cwd: path.parse(repositoryRoot).root,
      env: environment,
      timeout: 5_000,
    });
    const evidence = JSON.parse(stdout);
    assert.equal(evidence.schemaVersion, 1);
    assert.equal(evidence.dataRootResolved, true);
    assert.match(evidence.sqliteVersion, /^\d+\.\d+\.\d+$/u);
  } finally {
    await harness.cleanup();
  }
});

test("runtime environment replaces poisoned host temp roots", async () => {
  const harness = await createDisposableDataHarness();
  try {
    const poisoned = path.join(harness.dataRoot, "poisoned-host-temp");
    await mkdir(poisoned, { mode: 0o700 });
    const environment = await makeRuntimeEnvironment(harness, {
      ...process.env,
      TMPDIR: poisoned,
      TMP: poisoned,
      TEMP: poisoned,
    });
    for (const name of ["TMPDIR", "TMP", "TEMP"]) {
      assert.notEqual(environment[name], poisoned);
      assert.equal(path.dirname(environment[name]), harness.sandboxRoot);
    }
  } finally {
    await harness.cleanup();
  }
});

test("packaged helper rejects non-probe execution", async () => {
  const helper = path.join(repositoryRoot, "apps/desktop/spike/open-deutsch-mcp-spike.cjs");
  await assert.rejects(
    execFileAsync(process.execPath, [helper], {
      cwd: path.parse(repositoryRoot).root,
      env: process.env,
      timeout: 5_000,
    }),
    (error) => error.code === 2 && error.stderr.includes("OD_MCP_PACKAGED_SPIKE_PROBE_ONLY"),
  );
});
