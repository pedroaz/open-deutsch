import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("adopts the built-in SQLite driver without a native addon dependency", async () => {
  for (const manifestPath of [
    "package.json",
    "apps/desktop/package.json",
    "packages/persistence/package.json",
  ]) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const nativeDriver of ["better-sqlite3", "sqlite3"]) {
      assert.equal(dependencies[nativeDriver], undefined, `${manifestPath}: ${nativeDriver}`);
    }
  }

  const adr = await readFile("docs/adr/ADR-0004-node-sqlite-baseline.md", "utf8");
  assert.match(adr, /node:sqlite/);
  assert.match(adr, /Electron 42\.7\.1/);
  assert.match(adr, /Node\.js 24\.18\.1/);
  assert.match(adr, /SQLite 3\.53\.1/);
});

test("the executable spike covers migration, WAL contention, and clean close", async () => {
  const main = await readFile("tests/e2e/fixtures/sqlite-spike/main.mjs", "utf8");
  const writer = await readFile("tests/e2e/fixtures/sqlite-spike/external-writer.mjs", "utf8");
  const journey = await readFile("tests/e2e/playwright-sqlite-spike.spec.mjs", "utf8");

  assert.match(main, /from "node:sqlite"/);
  assert.match(main, /PRAGMA journal_mode = WAL/);
  assert.match(main, /PRAGMA foreign_keys = ON/);
  assert.match(main, /PRAGMA user_version = 2/);
  assert.match(main, /BEGIN IMMEDIATE/);
  assert.match(writer, /BEGIN IMMEDIATE/);
  assert.match(writer, /PRAGMA foreign_keys = ON/);
  assert.match(journey, /foreignKeyRejected: true/);
  assert.match(journey, /schemaVersion: 2/);
  assert.match(journey, /lockWaitMilliseconds/);
  assert.match(journey, /applicationProcess\.exitCode/);
});

test("records driver alternatives, AppImage impact, exact commands, and cleanup", async () => {
  const report = await readFile("docs/spikes/SPIKE-IMP-014-sqlite-electron-node.md", "utf8");
  for (const required of [
    "better-sqlite3",
    "sqlite3",
    "sql.js",
    "AppImage",
    "xvfb-run -a",
    "Cleanup verification",
    "exit code zero",
  ]) {
    assert.match(report, new RegExp(required.replace(".", "\\."), "i"), required);
  }
});
