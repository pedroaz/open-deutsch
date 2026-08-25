#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createDisposableDataHarness } from "./lib/disposable-data.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const execFile = promisify(execFileCallback);
const results = [];

function report(status, code, message) {
  results.push({ status, code, message });
  process.stdout.write(`[${status.toUpperCase()}] ${code}: ${message}\n`);
}

async function command(commandName, args, options = {}) {
  try {
    const result = await execFile(commandName, args, {
      cwd: repositoryRoot,
      env: process.env,
      timeout: options.timeout ?? 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      status: error.code === "ETIMEDOUT" ? "timeout" : (error.code ?? error.status ?? "failed"),
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

async function checkCommand(commandName, args, code, label, options = {}) {
  const result = await command(commandName, args, options);
  report(
    result.ok ? "pass" : options.warning ? "warn" : "fail",
    code,
    result.ok ? `${label} is available.` : `${label} is unavailable.`,
  );
  return result;
}

async function checkFilesystemCapability() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "open-deutsch-doctor-"));
  try {
    const directories = ["runtime", "logs", "data"].map((name) => path.join(parent, name));
    await writeFile(path.join(parent, ".ownership-marker"), "doctor", { mode: 0o600, flag: "wx" });
    await Promise.all(directories.map((directory) => mkdir(directory, { mode: 0o700 })));
    await writeFile(path.join(directories[0], "probe"), "ok", { mode: 0o600, flag: "wx" });
    const modes = await Promise.all(
      directories.map(async (directory) => (await stat(directory)).mode & 0o777),
    );
    if (modes.some((mode) => mode !== 0o700)) throw new Error("restrictive directory mode");
    report(
      "pass",
      "FILESYSTEM_OK",
      "Disposable runtime, log, temp, and restrictive data-root writes work.",
    );
  } catch {
    report(
      "fail",
      "FILESYSTEM_FAILED",
      "Disposable runtime, log, temp, or restrictive data-root writes failed.",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function checkSQLite() {
  try {
    const database = new DatabaseSync(":memory:");
    const row = database.prepare("select sqlite_version() as version").get();
    database.close();
    if (!row || typeof row.version !== "string") throw new Error("SQLite version unavailable");
    report("pass", "SQLITE_OK", `Built-in SQLite ${row.version} is available.`);
  } catch {
    report(
      "fail",
      "SQLITE_FAILED",
      "Node's built-in SQLite driver could not open an in-memory database.",
    );
  }
}

async function checkAssets() {
  try {
    const [english, german, icon] = await Promise.all([
      readFile(path.join(repositoryRoot, "apps/desktop/src/renderer/locales/en.json"), "utf8"),
      readFile(path.join(repositoryRoot, "apps/desktop/src/renderer/locales/de.json"), "utf8"),
      stat(path.join(repositoryRoot, "apps/desktop/assets/open-deutsch.svg")),
    ]);
    const enKeys = Object.keys(JSON.parse(english)).sort();
    const deKeys = Object.keys(JSON.parse(german)).sort();
    if (JSON.stringify(enKeys) !== JSON.stringify(deKeys) || !icon.isFile()) {
      throw new Error("locale or icon mismatch");
    }
    report("pass", "ASSETS_OK", "English/German assets and the OD mark are present and aligned.");
  } catch {
    report("fail", "ASSETS_FAILED", "English/German assets or the OD mark are missing or invalid.");
  }
}

async function seedDoctorRoot(harness) {
  const {
    inspectDataRootChoice,
    materializeDataRootSelection,
    openOpenDeutschDatabase,
    writeBootstrapPointer,
  } = await import("../packages/persistence/dist/index.js");
  const selection = await inspectDataRootChoice(harness.dataRoot);
  await materializeDataRootSelection(selection, {
    generation: 1,
    createdAt: "2026-08-20T10:00:00.000Z",
    testMode: true,
  });
  await rm(harness.bootstrapFile, { force: true });
  await writeBootstrapPointer({
    bootstrapFile: harness.bootstrapFile,
    dataRoot: harness.dataRoot,
    expectedGeneration: null,
    selectedAt: "2026-08-20T10:00:00.000Z",
  });
  const database = await openOpenDeutschDatabase({
    bootstrapFile: harness.bootstrapFile,
    dataRoot: harness.dataRoot,
    rootGeneration: 1,
  });
  database.close();
}

async function checkMcp() {
  const packagedHelper = path.join(repositoryRoot, "release/mcp-helper/open-deutsch-mcp.cjs");
  const sourceHelper = path.join(repositoryRoot, "plugins/open-deutsch/bin/open-deutsch-mcp.cjs");
  const serverEntry = path.join(repositoryRoot, "apps/mcp-server/dist/index.js");
  const persistenceEntry = path.join(repositoryRoot, "packages/persistence/dist/index.js");
  const helper = await realpath(packagedHelper).catch(() => sourceHelper);
  if (
    !(await stat(serverEntry).catch(() => undefined)) ||
    !(await stat(persistenceEntry).catch(() => undefined))
  ) {
    report(
      "warn",
      "MCP_NOT_BUILT",
      "MCP helper protocol check is deferred until the server is built.",
    );
    return;
  }
  const harness = await createDisposableDataHarness();
  const client = new Client({ name: "open-deutsch-doctor", version: "0.1.0" });
  let transport;
  let stderr = "";
  try {
    await seedDoctorRoot(harness);
    const environment = {
      ...harness.environment(process.env),
      OPEN_DEUTSCH_CURRICULUM_ROOT: path.join(repositoryRoot, "content/curriculum"),
      ...(helper === sourceHelper ? { OPEN_DEUTSCH_MCP_ENTRY: serverEntry } : {}),
    };
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [helper],
      cwd: repositoryRoot,
      env: environment,
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    await client.connect(transport);
    const { tools } = await client.listTools();
    if (tools.length !== 8) {
      throw new Error(
        `tool count mismatch (${tools.length}): ${tools.map(({ name }) => name).join(",")}`,
      );
    }
    report("pass", "MCP_OK", "MCP helper starts over STDIO and exposes the eight bounded tools.");
  } catch (error) {
    const detail = [
      error?.name,
      error?.code,
      typeof error?.message === "string" ? error.message.slice(0, 500) : undefined,
      stderr.trim().replace(/\s+/g, " ").slice(0, 240),
    ]
      .filter(Boolean)
      .join(" ");
    report(
      "warn",
      "MCP_FAILED",
      `MCP helper/protocol check did not complete${detail ? ` (${detail})` : ""}; run the focused MCP tests for detail.`,
    );
  } finally {
    await client.close().catch(() => undefined);
    await transport?.close().catch(() => undefined);
    await harness.cleanup().catch(() => undefined);
  }
}

async function checkPluginStatus() {
  const result = await command(process.execPath, [
    "plugins/open-deutsch/scripts/plugin-lifecycle.mjs",
    "status",
  ]);
  if (!result.ok) {
    report(
      "warn",
      "PLUGIN_STATUS_UNAVAILABLE",
      "Scoped plugin status could not be read without changing host state.",
    );
    return;
  }
  try {
    const status = JSON.parse(result.stdout);
    const label = status.state === "installed" ? "installed" : status.state;
    report(
      status.state === "failed-start" ? "warn" : "pass",
      "PLUGIN_STATUS_OK",
      `Scoped Open Deutsch plugin status: ${label}.`,
    );
  } catch {
    report("warn", "PLUGIN_STATUS_INVALID", "Scoped plugin status returned no bounded JSON state.");
  }
}

await checkCommand("make", ["--version"], "MAKE_OK", "Make");
await checkCommand("cc", ["--version"], "NATIVE_CC_OK", "C compiler", { warning: true });
await checkCommand("c++", ["--version"], "NATIVE_CXX_OK", "C++ compiler", { warning: true });
await checkCommand(
  process.execPath,
  ["scripts/check-toolchain.mjs"],
  "TOOLCHAIN_OK",
  "Pinned Node/pnpm/Codex diagnostic",
  { warning: true },
);
await checkCommand(
  "pnpm",
  ["list", "--recursive", "--depth", "-1"],
  "PNPM_GRAPH_OK",
  "Workspace dependency graph",
  { warning: true },
);
await checkCommand("pnpm", ["peers", "check"], "PNPM_PEERS_OK", "pnpm peer check", {
  warning: true,
});
await checkCommand("node_modules/.bin/electron", ["--version"], "ELECTRON_OK", "Electron", {
  warning: true,
});
await checkCommand("node_modules/.bin/playwright", ["--version"], "PLAYWRIGHT_OK", "Playwright", {
  warning: true,
});
await checkCommand("xvfb-run", ["--help"], "XVFB_OK", "Xvfb", { warning: true });
await checkSQLite();
await checkFilesystemCapability();
await checkAssets();
await checkMcp();
await checkPluginStatus();

process.exitCode = results.some(({ status }) => status === "fail") ? 1 : 0;
