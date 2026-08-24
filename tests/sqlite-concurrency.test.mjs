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
});

test("the executable compatibility journey covers migration, WAL contention, and clean close", async () => {
  const main = await readFile("tests/e2e/fixtures/sqlite-concurrency/main.mjs", "utf8");
  const writer = await readFile(
    "tests/e2e/fixtures/sqlite-concurrency/external-writer.mjs",
    "utf8",
  );
  const journey = await readFile("tests/e2e/playwright-sqlite-concurrency.spec.mjs", "utf8");

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
