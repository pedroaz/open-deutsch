import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function fail(code) {
  process.stderr.write(`${code}\n`);
  process.exit(1);
}

for (const name of ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_REMOTE_TOKEN"]) {
  if (process.env[name]) fail("FAKE_CODEX_CREDENTIAL_LEAK");
}

const codexHome = process.env.CODEX_HOME;
const home = process.env.HOME;
for (const [name, value] of Object.entries({
  HOME: home,
  CODEX_HOME: codexHome,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  XDG_STATE_HOME: process.env.XDG_STATE_HOME,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
})) {
  if (!value || !value.includes("open-deutsch-test-data-")) {
    fail(`FAKE_CODEX_HOST_PATH_USED:${name}`);
  }
}

const args = process.argv.slice(2);
const hasExactArgs = (...expected) =>
  args.length === expected.length && args.every((value, index) => value === expected[index]);
if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("codex-cli 0.146.0\n");
  process.exit(0);
}

const statePath = path.join(codexHome, "fake-plugin-cli-state.json");
await mkdir(codexHome, { recursive: true, mode: 0o700 });
let state = { marketplaceRoot: null, installedPath: null, version: null };
try {
  state = JSON.parse(await readFile(statePath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

async function saveState() {
  await writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

if (
  args.length === 5 &&
  args[0] === "plugin" &&
  args[1] === "marketplace" &&
  args[2] === "add" &&
  args[4] === "--json"
) {
  const marketplaceRoot = path.resolve(args[3]);
  const marketplace = JSON.parse(
    await readFile(path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"), "utf8"),
  );
  if (
    !marketplaceRoot.includes("open-deutsch-test-data-") ||
    marketplace.name !== "open-deutsch-local" ||
    marketplace.plugins?.length !== 1 ||
    marketplace.plugins[0]?.name !== "open-deutsch" ||
    marketplace.plugins[0]?.source?.source !== "local" ||
    marketplace.plugins[0]?.source?.path !== "./plugins/open-deutsch"
  ) {
    fail("FAKE_CODEX_MARKETPLACE_SCOPE_INVALID");
  }
  const installedRoot = path.join(codexHome, "plugins", "marketplaces", marketplace.name);
  await mkdir(installedRoot, { recursive: true, mode: 0o700 });
  state.marketplaceRoot = marketplaceRoot;
  await saveState();
  process.stdout.write(
    `${JSON.stringify({ marketplaceName: marketplace.name, alreadyAdded: false, installedRoot })}\n`,
  );
  process.exit(0);
}

if (
  hasExactArgs("plugin", "list", "--json") ||
  hasExactArgs("plugin", "list", "--available", "--json")
) {
  const installed = state.installedPath
    ? [{ pluginId: "open-deutsch@open-deutsch-local", version: state.version, enabled: true }]
    : [];
  const available = state.marketplaceRoot
    ? [
        {
          pluginId: "open-deutsch@open-deutsch-local",
          installed: Boolean(state.installedPath),
        },
      ]
    : [];
  process.stdout.write(`${JSON.stringify({ installed, available })}\n`);
  process.exit(0);
}

if (hasExactArgs("plugin", "add", "open-deutsch@open-deutsch-local", "--json")) {
  if (!state.marketplaceRoot) fail("FAKE_CODEX_MARKETPLACE_MISSING");
  const source = path.join(state.marketplaceRoot, "plugins", "open-deutsch");
  const manifest = JSON.parse(
    await readFile(path.join(source, ".codex-plugin", "plugin.json"), "utf8"),
  );
  const installedPath = path.join(codexHome, "plugins", "cache", "open-deutsch");
  await rm(installedPath, { recursive: true, force: true });
  await mkdir(path.dirname(installedPath), { recursive: true, mode: 0o700 });
  await cp(source, installedPath, { recursive: true });
  state.installedPath = installedPath;
  state.version = manifest.version;
  await saveState();
  process.stdout.write(`${JSON.stringify({ version: manifest.version, installedPath })}\n`);
  process.exit(0);
}

if (hasExactArgs("mcp", "list", "--json")) {
  if (!state.installedPath) {
    process.stdout.write("[]\n");
    process.exit(0);
  }
  const mcp = JSON.parse(await readFile(path.join(state.installedPath, ".mcp.json"), "utf8"));
  const server = mcp.mcpServers["open-deutsch"];
  process.stdout.write(
    `${JSON.stringify([
      {
        name: "open-deutsch",
        enabled: true,
        transport: { type: "stdio", command: server.command },
      },
    ])}\n`,
  );
  process.exit(0);
}

if (hasExactArgs("plugin", "remove", "open-deutsch@open-deutsch-local", "--json")) {
  await rm(state.installedPath, { recursive: true, force: true });
  state.installedPath = null;
  state.version = null;
  await saveState();
  process.stdout.write("{}\n");
  process.exit(0);
}

if (hasExactArgs("plugin", "marketplace", "remove", "open-deutsch-local", "--json")) {
  state.marketplaceRoot = null;
  await saveState();
  process.stdout.write("{}\n");
  process.exit(0);
}

if (hasExactArgs("plugin", "marketplace", "list")) {
  process.stdout.write(state.marketplaceRoot ? "open-deutsch-local\n" : "");
  process.exit(0);
}

fail("FAKE_CODEX_COMMAND_UNEXPECTED");
