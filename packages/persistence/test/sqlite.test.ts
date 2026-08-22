import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { dataRootGenerationSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  inspectDataRootChoice,
  assertOpenDeutschDatabaseLease,
  materializeDataRootSelection,
  openDataRootDatabase,
  resetDisposableDataRootDatabase,
  resolveDataRootLayout,
  writeBootstrapPointer,
  type DatabaseMigration,
} from "../src/index.js";

const factory = createDeterministicContractFactory();
const migrations = [
  {
    version: 1,
    name: "create-example-records",
    sql: `
      CREATE TABLE example_records (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: "add-example-source",
    sql: `ALTER TABLE example_records ADD COLUMN source TEXT NOT NULL DEFAULT 'migration';`,
  },
] as const satisfies readonly DatabaseMigration[];

async function prepareRoot(disposableData: {
  dataRoot: string;
  configRoot: string;
}): Promise<{ bootstrapFile: string; databasePath: string }> {
  const plan = await inspectDataRootChoice(disposableData.dataRoot);
  await materializeDataRootSelection(plan, {
    generation: dataRootGenerationSchema.parse(1),
    createdAt: factory.nextInstant(),
    testMode: true,
  });
  const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "sqlite.json");
  await writeBootstrapPointer({
    bootstrapFile,
    dataRoot: disposableData.dataRoot,
    expectedGeneration: null,
    selectedAt: factory.nextInstant(),
  });
  return {
    bootstrapFile,
    databasePath: resolveDataRootLayout(disposableData.dataRoot).database,
  };
}

describe("SQLite connection and migration runner", () => {
  it("opens the selected leased database with the accepted connection policy", async ({
    disposableData,
  }) => {
    const { bootstrapFile, databasePath } = await prepareRoot(disposableData);
    const database = await openDataRootDatabase({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      rootGeneration: dataRootGenerationSchema.parse(1),
      migrations,
    });
    expect(database).toMatchObject({
      schemaVersion: 2,
      journalMode: "wal",
      foreignKeysEnabled: true,
      busyTimeoutMilliseconds: 2_000,
      closed: false,
    });
    database.close();
    database.close();
    expect(database.closed).toBe(true);
    expect((await stat(databasePath)).mode & 0o777).toBe(0o600);

    const inspection = new DatabaseSync(databasePath);
    expect(inspection.prepare("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    expect(inspection.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(
      inspection
        .prepare("PRAGMA table_info(example_records)")
        .all()
        .map((row) => row["name"]),
    ).toEqual(["id", "value", "source"]);
    inspection.close();
  });

  it("rolls back a failed migration without advancing schema version", async ({
    disposableData,
  }) => {
    const { bootstrapFile, databasePath } = await prepareRoot(disposableData);
    const first = await openDataRootDatabase({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      rootGeneration: dataRootGenerationSchema.parse(1),
      migrations: migrations.slice(0, 1),
    });
    first.close();

    const failing = [
      migrations[0],
      {
        version: 2,
        name: "fail-after-table-create",
        sql: `
          CREATE TABLE must_roll_back (id INTEGER PRIMARY KEY) STRICT;
          INSERT INTO missing_table (id) VALUES (1);
        `,
      },
    ] satisfies readonly DatabaseMigration[];
    await expect(
      openDataRootDatabase({
        bootstrapFile,
        dataRoot: disposableData.dataRoot,
        rootGeneration: dataRootGenerationSchema.parse(1),
        migrations: failing,
      }),
    ).rejects.toThrow("OD_DATABASE_MIGRATION_FAILED:2");

    const inspection = new DatabaseSync(databasePath);
    expect(inspection.prepare("PRAGMA user_version").get()).toEqual({ user_version: 1 });
    expect(
      inspection
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get("must_roll_back"),
    ).toBeUndefined();
    inspection.close();
  });

  it("refuses a database newer than the supported migration set", async ({ disposableData }) => {
    const { bootstrapFile, databasePath } = await prepareRoot(disposableData);
    const future = new DatabaseSync(databasePath);
    future.exec("PRAGMA user_version = 99;");
    future.close();
    await expect(
      openDataRootDatabase({
        bootstrapFile,
        dataRoot: disposableData.dataRoot,
        rootGeneration: dataRootGenerationSchema.parse(1),
        migrations,
      }),
    ).rejects.toThrow("OD_DATABASE_SCHEMA_NEWER");
    const inspection = new DatabaseSync(databasePath);
    expect(inspection.prepare("PRAGMA user_version").get()).toEqual({ user_version: 99 });
    inspection.close();
  });

  it("rejects every operation after the selected root generation changes", async ({
    disposableData,
  }) => {
    const { bootstrapFile } = await prepareRoot(disposableData);
    const database = await openDataRootDatabase({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      rootGeneration: dataRootGenerationSchema.parse(1),
      migrations,
    });
    const secondRoot = path.join(disposableData.sandboxRoot, "replacement-data");
    await mkdir(secondRoot, { mode: 0o700 });
    const next = await inspectDataRootChoice(secondRoot);
    await materializeDataRootSelection(next, {
      generation: dataRootGenerationSchema.parse(2),
      createdAt: factory.nextInstant(),
      testMode: true,
    });
    await writeBootstrapPointer({
      bootstrapFile,
      dataRoot: secondRoot,
      expectedGeneration: 1,
      selectedAt: factory.nextInstant(),
    });
    await expect(assertOpenDeutschDatabaseLease(database)).rejects.toThrow("OD_DATA_ROOT_STALE");
    database.close();
  });

  it("rejects invalid migration ledgers and unsafe database paths", async ({ disposableData }) => {
    const { bootstrapFile, databasePath } = await prepareRoot(disposableData);
    await expect(
      openDataRootDatabase({
        bootstrapFile,
        dataRoot: disposableData.dataRoot,
        rootGeneration: dataRootGenerationSchema.parse(1),
        migrations: [{ version: 2, name: "starts-at-two", sql: "SELECT 1;" }],
      }),
    ).rejects.toThrow("OD_DATABASE_MIGRATION_SET_INVALID");

    await resetDisposableDataRootDatabase(disposableData.dataRoot);
    const outside = path.join(disposableData.sandboxRoot, "outside.sqlite3");
    await writeFile(outside, "untouched\n", { mode: 0o600 });
    await symlink(outside, databasePath);
    await expect(
      openDataRootDatabase({
        bootstrapFile,
        dataRoot: disposableData.dataRoot,
        rootGeneration: dataRootGenerationSchema.parse(1),
        migrations,
      }),
    ).rejects.toThrow("OD_DATABASE_PATH_UNSAFE");
    expect(await readFile(outside, "utf8")).toBe("untouched\n");
  });

  it("exposes reset only for the exact owned disposable root", async ({ disposableData }) => {
    const { bootstrapFile, databasePath } = await prepareRoot(disposableData);
    const database = await openDataRootDatabase({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      rootGeneration: dataRootGenerationSchema.parse(1),
      migrations,
    });
    database.close();
    await resetDisposableDataRootDatabase(disposableData.dataRoot);
    await expect(stat(databasePath)).rejects.toMatchObject({ code: "ENOENT" });

    const sibling = path.join(disposableData.sandboxRoot, "not-owned-data");
    await mkdir(sibling, { mode: 0o700 });
    const sentinel = path.join(sibling, "open-deutsch.sqlite3");
    await writeFile(sentinel, "keep\n", { mode: 0o600 });
    await expect(resetDisposableDataRootDatabase(sibling)).rejects.toThrow(
      "OD_DATABASE_RESET_ROOT_UNOWNED",
    );
    expect(await readFile(sentinel, "utf8")).toBe("keep\n");
  });
});
