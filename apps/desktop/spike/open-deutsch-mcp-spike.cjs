#!/usr/bin/env node
const { readFileSync, realpathSync } = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

if (process.argv[2] !== "--probe") {
  process.stderr.write("OD_MCP_PACKAGED_SPIKE_PROBE_ONLY\n");
  process.exitCode = 2;
} else {
  const bootstrapFile = process.env.OPEN_DEUTSCH_BOOTSTRAP_FILE;
  const dataRoot = process.env.OPEN_DEUTSCH_DATA_ROOT;
  if (
    !bootstrapFile ||
    !dataRoot ||
    !path.isAbsolute(bootstrapFile) ||
    !path.isAbsolute(dataRoot)
  ) {
    throw new Error("OD_MCP_PACKAGED_BOOTSTRAP_INVALID");
  }
  const bootstrap = JSON.parse(readFileSync(bootstrapFile, "utf8"));
  const database = new DatabaseSync(":memory:");
  const sqliteVersion = database.prepare("select sqlite_version() as version").get().version;
  database.close();
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: 1,
      dataRootResolved: realpathSync(bootstrap.dataRoot) === realpathSync(dataRoot),
      sqliteVersion,
    })}\n`,
  );
}
