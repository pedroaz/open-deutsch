import { app } from "electron";
import { DatabaseSync } from "node:sqlite";

const databasePath = process.env.OPEN_DEUTSCH_SQLITE_CONCURRENCY_DB;
if (!databasePath) throw new Error("OPEN_DEUTSCH_SQLITE_CONCURRENCY_DB is required.");

const database = new DatabaseSync(databasePath, { timeout: 2_000 });
database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;");

let schemaVersion = database.prepare("PRAGMA user_version").get().user_version;
if (schemaVersion > 2) throw new Error(`Unsupported SQLite schema version ${schemaVersion}.`);
if (schemaVersion === 0) {
  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE concurrency_events (
      id INTEGER PRIMARY KEY,
      writer TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    PRAGMA user_version = 1;
    COMMIT;
  `);
  schemaVersion = 1;
}
if (schemaVersion === 1) {
  database.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE concurrency_events ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy';
    CREATE TABLE concurrency_parents (name TEXT PRIMARY KEY) STRICT;
    CREATE TABLE concurrency_children (
      id INTEGER PRIMARY KEY,
      parent_name TEXT NOT NULL REFERENCES concurrency_parents(name)
    ) STRICT;
    PRAGMA user_version = 2;
    COMMIT;
  `);
}

let closed = false;
globalThis.openDeutschSqliteConcurrency = {
  info() {
    return {
      electron: process.versions.electron,
      node: process.versions.node,
      sqlite: process.versions.sqlite,
      journalMode: database.prepare("PRAGMA journal_mode").get().journal_mode,
      foreignKeys: database.prepare("PRAGMA foreign_keys").get().foreign_keys,
      schemaVersion: database.prepare("PRAGMA user_version").get().user_version,
    };
  },
  foreignKeyProbe() {
    try {
      database
        .prepare("INSERT INTO concurrency_children (parent_name) VALUES (?)")
        .run("missing-parent");
      return { rejected: false };
    } catch (error) {
      return { rejected: true, code: error.code };
    }
  },
  insert(writer) {
    database
      .prepare("INSERT INTO concurrency_events (writer, source) VALUES (?, ?)")
      .run(writer, "electron-main");
  },
  rows() {
    return database.prepare("SELECT writer, source FROM concurrency_events ORDER BY id").all();
  },
  close() {
    if (closed) return;
    database.close();
    closed = true;
  },
};

app.on("before-quit", () => globalThis.openDeutschSqliteConcurrency.close());
