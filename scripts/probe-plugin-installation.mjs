import { execFile } from "node:child_process";
import { cp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  buildIsolatedCodexEnvironment,
  readSupportedCodexVersion,
} from "./lib/app-server-probe.mjs";
import { createDisposableDataHarness } from "../tests/support/disposable-data.mjs";

const execFileAsync = promisify(execFile);
const marketplaceName = "open-deutsch-local";
const pluginName = "open-deutsch";
const refreshedVersion = "0.1.0+codex.probe-refresh";
const repositoryRoot = path.resolve(import.meta.dirname, "..");

function assertCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function parseJson(output, code) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(code);
  }
}

function containsPath(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function runCodex(codexExecutable, args, environment) {
  const { stdout } = await execFileAsync(codexExecutable, args, {
    cwd: repositoryRoot,
    env: environment,
    timeout: 15_000,
    killSignal: "SIGKILL",
  });
  return stdout;
}

const harness = await createDisposableDataHarness();
try {
  const codexExecutable = process.env.CODEX_EXECUTABLE ?? "codex";
  const marketplaceRoot = path.join(harness.sandboxRoot, "plugin-marketplace");
  const marketplaceManifest = path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
  const sourcePlugin = path.join(repositoryRoot, "plugins", pluginName);
  const marketplacePlugin = path.join(marketplaceRoot, "plugins", pluginName);
  const codexHome = path.join(harness.sandboxRoot, "codex-home");
  const xdgRoot = path.join(harness.sandboxRoot, "xdg");
  const xdgConfigHome = path.join(xdgRoot, "config");
  const xdgDataHome = path.join(xdgRoot, "data");
  const xdgStateHome = path.join(xdgRoot, "state");
  const xdgCacheHome = path.join(xdgRoot, "cache");
  const xdgRuntimeDirectory = path.join(xdgRoot, "runtime");
  await mkdir(path.dirname(marketplaceManifest), { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(marketplacePlugin), { recursive: true, mode: 0o700 });
  await mkdir(codexHome, { mode: 0o700 });
  for (const directory of [
    xdgConfigHome,
    xdgDataHome,
    xdgStateHome,
    xdgCacheHome,
    xdgRuntimeDirectory,
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  await cp(sourcePlugin, marketplacePlugin, { recursive: true, force: false });
  await writeFile(
    marketplaceManifest,
    `${JSON.stringify(
      {
        name: marketplaceName,
        interface: { displayName: "Open Deutsch Local" },
        plugins: [
          {
            name: pluginName,
            source: { source: "local", path: `./plugins/${pluginName}` },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Education",
          },
        ],
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );

  const environment = {
    ...buildIsolatedCodexEnvironment(process.env, {
      codexHome,
      home: harness.configRoot,
    }),
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_DATA_HOME: xdgDataHome,
    XDG_STATE_HOME: xdgStateHome,
    XDG_CACHE_HOME: xdgCacheHome,
    XDG_RUNTIME_DIR: xdgRuntimeDirectory,
  };
  delete environment.CODEX_EXECUTABLE;
  const codexVersion = await readSupportedCodexVersion(codexExecutable, { env: environment });

  const marketplaceAdd = parseJson(
    await runCodex(
      codexExecutable,
      ["plugin", "marketplace", "add", marketplaceRoot, "--json"],
      environment,
    ),
    "PLUGIN_MARKETPLACE_ADD_INVALID",
  );
  assertCondition(
    marketplaceAdd.marketplaceName === marketplaceName &&
      marketplaceAdd.alreadyAdded === false &&
      containsPath(harness.sandboxRoot, marketplaceAdd.installedRoot),
    "PLUGIN_MARKETPLACE_ADD_INVALID",
  );

  const available = parseJson(
    await runCodex(codexExecutable, ["plugin", "list", "--available", "--json"], environment),
    "PLUGIN_AVAILABLE_LIST_INVALID",
  );
  assertCondition(
    available.installed.length === 0 &&
      available.available.length === 1 &&
      available.available[0].pluginId === `${pluginName}@${marketplaceName}` &&
      available.available[0].installed === false,
    "PLUGIN_AVAILABLE_LIST_INVALID",
  );

  const installed = parseJson(
    await runCodex(
      codexExecutable,
      ["plugin", "add", `${pluginName}@${marketplaceName}`, "--json"],
      environment,
    ),
    "PLUGIN_INSTALL_INVALID",
  );
  const canonicalCodexHome = await realpath(codexHome);
  const canonicalInstalledPath = await realpath(installed.installedPath);
  assertCondition(
    installed.version === "0.1.0" && containsPath(canonicalCodexHome, canonicalInstalledPath),
    "PLUGIN_INSTALL_INVALID",
  );
  const cachedManifest = parseJson(
    await readFile(path.join(canonicalInstalledPath, ".codex-plugin", "plugin.json"), "utf8"),
    "PLUGIN_CACHED_MANIFEST_INVALID",
  );
  const cachedMcp = parseJson(
    await readFile(path.join(canonicalInstalledPath, ".mcp.json"), "utf8"),
    "PLUGIN_CACHED_MCP_INVALID",
  );
  assertCondition(
    cachedManifest.name === pluginName &&
      cachedMcp.mcpServers?.[pluginName]?.command === "open-deutsch-mcp",
    "PLUGIN_CACHED_COMPONENT_INVALID",
  );

  const discoveredMcp = parseJson(
    await runCodex(codexExecutable, ["mcp", "list", "--json"], environment),
    "PLUGIN_MCP_DISCOVERY_INVALID",
  );
  assertCondition(
    discoveredMcp.length === 1 &&
      discoveredMcp[0].name === pluginName &&
      discoveredMcp[0].enabled === true &&
      discoveredMcp[0].transport?.type === "stdio" &&
      discoveredMcp[0].transport?.command === "open-deutsch-mcp",
    "PLUGIN_MCP_DISCOVERY_INVALID",
  );

  const marketplacePluginManifestPath = path.join(
    marketplacePlugin,
    ".codex-plugin",
    "plugin.json",
  );
  const marketplacePluginManifest = parseJson(
    await readFile(marketplacePluginManifestPath, "utf8"),
    "PLUGIN_SOURCE_MANIFEST_INVALID",
  );
  await writeFile(
    marketplacePluginManifestPath,
    `${JSON.stringify({ ...marketplacePluginManifest, version: refreshedVersion }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  const refreshedMcpPath = path.join(marketplacePlugin, ".mcp.json");
  const refreshedMcp = parseJson(
    await readFile(refreshedMcpPath, "utf8"),
    "PLUGIN_SOURCE_MCP_INVALID",
  );
  refreshedMcp.mcpServers[pluginName].command = "open-deutsch-mcp-refresh";
  await writeFile(refreshedMcpPath, `${JSON.stringify(refreshedMcp, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  const refreshed = parseJson(
    await runCodex(
      codexExecutable,
      ["plugin", "add", `${pluginName}@${marketplaceName}`, "--json"],
      environment,
    ),
    "PLUGIN_REFRESH_INVALID",
  );
  assertCondition(
    refreshed.version === refreshedVersion &&
      containsPath(canonicalCodexHome, await realpath(refreshed.installedPath)),
    "PLUGIN_REFRESH_INVALID",
  );
  const refreshedStatus = parseJson(
    await runCodex(codexExecutable, ["plugin", "list", "--json"], environment),
    "PLUGIN_REFRESH_STATUS_INVALID",
  );
  assertCondition(
    refreshedStatus.installed.length === 1 &&
      refreshedStatus.installed[0].version === refreshedVersion &&
      refreshedStatus.installed[0].enabled === true,
    "PLUGIN_REFRESH_STATUS_INVALID",
  );
  const refreshedDiscovery = parseJson(
    await runCodex(codexExecutable, ["mcp", "list", "--json"], environment),
    "PLUGIN_REFRESH_DISCOVERY_INVALID",
  );
  assertCondition(
    refreshedDiscovery[0]?.transport?.command === "open-deutsch-mcp-refresh",
    "PLUGIN_REFRESH_DISCOVERY_INVALID",
  );

  parseJson(
    await runCodex(
      codexExecutable,
      ["plugin", "remove", `${pluginName}@${marketplaceName}`, "--json"],
      environment,
    ),
    "PLUGIN_REMOVE_INVALID",
  );
  const afterRemove = parseJson(
    await runCodex(codexExecutable, ["plugin", "list", "--json"], environment),
    "PLUGIN_REMOVE_STATUS_INVALID",
  );
  const afterRemoveMcp = parseJson(
    await runCodex(codexExecutable, ["mcp", "list", "--json"], environment),
    "PLUGIN_REMOVE_MCP_INVALID",
  );
  assertCondition(
    afterRemove.installed.length === 0 && afterRemoveMcp.length === 0,
    "PLUGIN_REMOVE_INVALID",
  );

  parseJson(
    await runCodex(
      codexExecutable,
      ["plugin", "marketplace", "remove", marketplaceName, "--json"],
      environment,
    ),
    "PLUGIN_MARKETPLACE_REMOVE_INVALID",
  );
  const marketplaceList = await runCodex(
    codexExecutable,
    ["plugin", "marketplace", "list"],
    environment,
  );
  assertCondition(!marketplaceList.includes(marketplaceName), "PLUGIN_MARKETPLACE_REMOVE_INVALID");

  process.stdout.write(
    `[PASS] PLUGIN_INSTALLATION_PROBE: ${codexVersion}; install, refresh, status, MCP discovery, uninstall, cleanup\n`,
  );
} finally {
  await harness.cleanup();
}
