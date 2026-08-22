import { DatabaseSync } from "node:sqlite";

const [databasePath] = process.argv.slice(2);
if (!databasePath) throw new Error("Database path argument is required.");

const database = new DatabaseSync(databasePath, { timeout: 2_000 });
database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;");
let foreignKeyRejected = false;
try {
  database.prepare("INSERT INTO spike_children (parent_name) VALUES (?)").run("missing-parent");
} catch (error) {
  if (error.code !== "ERR_SQLITE_ERROR") throw error;
  foreignKeyRejected = true;
}
database.exec("BEGIN IMMEDIATE;");
database.prepare("INSERT INTO spike_events (writer) VALUES (?)").run("external-node");
process.stdout.write(
  `LOCKED ${JSON.stringify({
    node: process.versions.node,
    sqlite: process.versions.sqlite,
    foreignKeys: database.prepare("PRAGMA foreign_keys").get().foreign_keys,
    foreignKeyRejected,
  })}\n`,
);

setTimeout(() => {
  database.exec("COMMIT");
  database.close();
}, 300);
