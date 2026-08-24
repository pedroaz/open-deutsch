import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const pluginName = "open-deutsch";
const marketplaceName = "open-deutsch-local";
const pluginId = `${pluginName}@${marketplaceName}`;
const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const marketplaceRoot = path.resolve(
  process.env.OPEN_DEUTSCH_PLUGIN_MARKETPLACE_ROOT ?? repositoryRoot,
);
const codexExecutable = process.env.CODEX_EXECUTABLE ?? "codex";
const sourceManifestPath = path.join(
  repositoryRoot,
  "plugins",
  pluginName,
  ".codex-plugin",
  "plugin.json",
);

async function readSourceManifest() {
  return JSON.parse(await readFile(sourceManifestPath, "utf8"));
}

async function runCodex(args) {
  const result = await execFileAsync(codexExecutable, args, {
    cwd: repositoryRoot,
    env: process.env,
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function runJson(args) {
  const output = await runCodex([...args, "--json"]);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("OD_PLUGIN_CLI_JSON_INVALID");
  }
}

function installedEntry(list) {
  return Array.isArray(list?.installed)
    ? list.installed.find((entry) => entry?.pluginId === pluginId)
    : undefined;
}

function mcpEntry(list) {
  return Array.isArray(list) ? list.find((entry) => entry?.name === pluginName) : undefined;
}

export async function readPluginStatus() {
  const sourceManifest = await readSourceManifest();
  try {
    const [plugins, mcp] = await Promise.all([
      runJson(["plugin", "list"]),
      runJson(["mcp", "list"]),
    ]);
    const installed = installedEntry(plugins);
    const mcpServer = mcpEntry(mcp);
    let state = "missing";
    if (installed !== undefined && mcpServer === undefined) state = "failed-start";
    else if (installed !== undefined && installed.version !== sourceManifest.version)
      state = "stale";
    else if (installed !== undefined) state = "installed";
    return {
      schemaVersion: 1,
      pluginName,
      marketplaceName,
      state,
      source: { marketplaceRoot: "repository-scoped", version: sourceManifest.version },
      installed:
        installed === undefined
          ? null
          : { version: installed.version, enabled: installed.enabled === true },
      mcp:
        mcpServer === undefined
          ? null
          : {
              enabled: mcpServer.enabled === true,
              transport: mcpServer.transport?.type ?? "unknown",
            },
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      pluginName,
      marketplaceName,
      state: "failed-start",
      source: { marketplaceRoot: "repository-scoped", version: sourceManifest.version },
      installed: null,
      mcp: null,
      error: error instanceof Error ? error.message : "OD_PLUGIN_STATUS_FAILED",
    };
  }
}

async function ensureMarketplace() {
  return runJson(["plugin", "marketplace", "add", marketplaceRoot]);
}

export async function installPlugin({ refresh = false } = {}) {
  const marketplace = await ensureMarketplace();
  const installed = await runJson(["plugin", "add", pluginId]);
  const status = await readPluginStatus();
  if (status.state !== "installed")
    throw new Error(`OD_PLUGIN_INSTALL_NOT_VERIFIED:${status.state}`);
  return {
    schemaVersion: 1,
    action: refresh ? "refresh" : "install",
    source: { marketplace: marketplaceName, version: status.source.version },
    result: {
      marketplaceAdded: marketplace.alreadyAdded !== true,
      installedVersion: installed.version,
    },
    status,
  };
}

export async function uninstallPlugin() {
  const statusBefore = await readPluginStatus();
  if (statusBefore.state !== "missing") await runJson(["plugin", "remove", pluginId]);
  await runCodex(["plugin", "marketplace", "remove", marketplaceName, "--json"]);
  const status = await readPluginStatus();
  if (status.state !== "missing" && status.state !== "failed-start") {
    throw new Error(`OD_PLUGIN_UNINSTALL_NOT_VERIFIED:${status.state}`);
  }
  return { schemaVersion: 1, action: "uninstall", status };
}

const action = process.argv[2];
try {
  const result =
    action === "status"
      ? await readPluginStatus()
      : action === "install"
        ? await installPlugin()
        : action === "refresh"
          ? await installPlugin({ refresh: true })
          : action === "uninstall"
            ? await uninstallPlugin()
            : null;
  if (result === null) throw new Error("OD_PLUGIN_ACTION_INVALID");
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "OD_PLUGIN_ACTION_FAILED"}\n`);
  process.exitCode = 1;
}
