import { _electron as electron } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test } from "./support/disposable-playwright.mjs";

function observeChild(child) {
  let stdout = "";
  let stderr = "";
  const locked = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`External SQLite writer did not lock the database: ${stderr}`)),
      5_000,
    );
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/^LOCKED (\{.+\})$/m);
      if (match) {
        clearTimeout(timeout);
        resolve(JSON.parse(match[1]));
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completed = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { locked, completed };
}

test("shares a migrated WAL database between Electron and a second Node process", async ({
  disposableData,
}, testInfo) => {
  const databasePath = path.join(disposableData.dataRoot, "sqlite-concurrency.db");
  const versionOneDatabase = new DatabaseSync(databasePath);
  versionOneDatabase.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE concurrency_events (
      id INTEGER PRIMARY KEY,
      writer TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    PRAGMA user_version = 1;
  `);
  versionOneDatabase.close();

  const application = await electron.launch({
    args: [
      "--ozone-platform=x11",
      `--user-data-dir=${path.join(disposableData.sandboxRoot, "electron-profile")}`,
      path.resolve("tests/e2e/fixtures/sqlite-concurrency/main.mjs"),
    ],
    cwd: process.cwd(),
    env: disposableData.environment({
      ...process.env,
      OPEN_DEUTSCH_SQLITE_CONCURRENCY_DB: databasePath,
    }),
  });
  const applicationProcess = application.process();
  try {
    const info = await application.evaluate(() => globalThis.openDeutschSqliteConcurrency.info());
    expect(info).toMatchObject({
      electron: "42.7.1",
      node: "24.18.0",
      sqlite: "3.53.1",
      journalMode: "wal",
      foreignKeys: 1,
      schemaVersion: 2,
    });
    expect(
      await application.evaluate(() => globalThis.openDeutschSqliteConcurrency.foreignKeyProbe()),
    ).toEqual({ rejected: true, code: "ERR_SQLITE_ERROR" });

    const child = spawn(
      process.execPath,
      [path.resolve("tests/e2e/fixtures/sqlite-concurrency/external-writer.mjs"), databasePath],
      {
        cwd: process.cwd(),
        env: disposableData.environment(process.env),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const observed = observeChild(child);
    const externalInfo = await observed.locked;
    expect(externalInfo).toEqual({
      node: "26.5.0",
      sqlite: "3.53.3",
      foreignKeys: 1,
      foreignKeyRejected: true,
    });

    const startedAt = Date.now();
    await application.evaluate(() =>
      globalThis.openDeutschSqliteConcurrency.insert("electron-main"),
    );
    const lockWaitMilliseconds = Date.now() - startedAt;

    const result = await observed.completed;
    expect(result).toMatchObject({ code: 0, signal: null, stderr: "" });
    expect(lockWaitMilliseconds).toBeGreaterThanOrEqual(150);
    const rows = await application.evaluate(() => globalThis.openDeutschSqliteConcurrency.rows());
    expect(rows).toEqual([
      { writer: "external-node", source: "legacy" },
      { writer: "electron-main", source: "electron-main" },
    ]);
    const evidencePath = testInfo.outputPath("sqlite-concurrency-evidence.json");
    await writeFile(
      evidencePath,
      `${JSON.stringify({ info, externalInfo, lockWaitMilliseconds, rows }, null, 2)}\n`,
      "utf8",
    );
    await testInfo.attach("sqlite-concurrency-evidence", {
      path: evidencePath,
      contentType: "application/json",
    });
    await application.evaluate(() => globalThis.openDeutschSqliteConcurrency.close());
  } finally {
    await application.close();
  }
  expect(applicationProcess.exitCode).toBe(0);
});
