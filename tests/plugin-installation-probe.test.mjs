import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("plugin lifecycle probe uses only an isolated Codex home and scrubs credentials", async () => {
  const root = await mkdtemp(
    path.join(process.env.OPEN_DEUTSCH_DATA_ROOT, "plugin-installation-probe-"),
  );
  const learnerHome = path.join(root, "learner-home");
  const wrapper = path.join(root, "fake-codex");
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec "${process.execPath}" "${path.resolve(
      "tests/fixtures/fake-codex-plugin-cli.mjs",
    )}" "$@"\n`,
    { mode: 0o700 },
  );
  await chmod(wrapper, 0o700);

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/probe-plugin-installation.mjs"],
      {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          HOME: learnerHome,
          CODEX_HOME: path.join(learnerHome, ".codex"),
          XDG_CONFIG_HOME: path.join(learnerHome, "xdg-config"),
          XDG_DATA_HOME: path.join(learnerHome, "xdg-data"),
          XDG_STATE_HOME: path.join(learnerHome, "xdg-state"),
          XDG_CACHE_HOME: path.join(learnerHome, "xdg-cache"),
          XDG_RUNTIME_DIR: path.join(learnerHome, "xdg-runtime"),
          OPENAI_API_KEY: "poisoned-provider-key",
          CODEX_API_KEY: "poisoned-codex-key",
          CODEX_EXECUTABLE: wrapper,
        },
        timeout: 15_000,
      },
    );
    assert.match(stdout, /^\[PASS\] PLUGIN_INSTALLATION_PROBE: codex-cli 0\.146\.0;/);
    await assert.rejects(readdir(learnerHome), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fake CLI rejects unscoped plugin lifecycle command shapes", async () => {
  const root = await mkdtemp(
    path.join(process.env.OPEN_DEUTSCH_DATA_ROOT, "plugin-cli-scope-test-"),
  );
  const environment = {
    ...process.env,
    HOME: path.join(root, "home"),
    CODEX_HOME: path.join(root, "codex-home"),
    XDG_CONFIG_HOME: path.join(root, "xdg-config"),
    XDG_DATA_HOME: path.join(root, "xdg-data"),
    XDG_STATE_HOME: path.join(root, "xdg-state"),
    XDG_CACHE_HOME: path.join(root, "xdg-cache"),
    XDG_RUNTIME_DIR: path.join(root, "xdg-runtime"),
  };
  delete environment.OPENAI_API_KEY;
  delete environment.CODEX_API_KEY;
  delete environment.CODEX_REMOTE_TOKEN;
  const fixture = path.resolve("tests/fixtures/fake-codex-plugin-cli.mjs");

  try {
    for (const args of [
      ["plugin", "add", "other@open-deutsch-local", "--json"],
      ["plugin", "remove", "open-deutsch@other-marketplace", "--json"],
      ["plugin", "list", "--available"],
    ]) {
      await assert.rejects(
        execFileAsync(process.execPath, [fixture, ...args], { env: environment }),
        /FAKE_CODEX_COMMAND_UNEXPECTED/,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manifest exposes the supported skills and relative MCP components", async () => {
  const manifest = JSON.parse(
    await readFile("plugins/open-deutsch/.codex-plugin/plugin.json", "utf8"),
  );
  const mcp = JSON.parse(await readFile("plugins/open-deutsch/.mcp.json", "utf8"));
  assert.equal(manifest.name, "open-deutsch");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(manifest.skills, "./skills/");
  assert.deepEqual(Object.keys(mcp.mcpServers), ["open-deutsch"]);
  assert.equal(mcp.mcpServers["open-deutsch"].command, "open-deutsch-mcp");
});

test("scoped plugin lifecycle reports verified install, refresh, failure boundary, and uninstall", async () => {
  const root = await mkdtemp(
    path.join(process.env.OPEN_DEUTSCH_DATA_ROOT, "plugin-lifecycle-adapter-"),
  );
  const marketplaceRoot = path.join(root, "open-deutsch-test-data-marketplace");
  const wrapper = path.join(root, "fake-codex");
  await mkdir(path.join(marketplaceRoot, ".agents", "plugins"), { recursive: true, mode: 0o700 });
  await mkdir(path.join(marketplaceRoot, "plugins"), { recursive: true, mode: 0o700 });
  await cp("plugins/open-deutsch", path.join(marketplaceRoot, "plugins/open-deutsch"), {
    recursive: true,
  });
  await writeFile(
    path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"),
    `${JSON.stringify({
      name: "open-deutsch-local",
      interface: { displayName: "Open Deutsch Local" },
      plugins: [
        {
          name: "open-deutsch",
          source: { source: "local", path: "./plugins/open-deutsch" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Education",
        },
      ],
    })}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec "${process.execPath}" "${path.resolve("tests/fixtures/fake-codex-plugin-cli.mjs")}" "$@"\n`,
    { mode: 0o700 },
  );
  await chmod(wrapper, 0o700);
  const environment = {
    ...process.env,
    HOME: path.join(root, "home"),
    CODEX_HOME: path.join(root, "codex-home"),
    XDG_CONFIG_HOME: path.join(root, "xdg-config"),
    XDG_DATA_HOME: path.join(root, "xdg-data"),
    XDG_STATE_HOME: path.join(root, "xdg-state"),
    XDG_CACHE_HOME: path.join(root, "xdg-cache"),
    XDG_RUNTIME_DIR: path.join(root, "xdg-runtime"),
    CODEX_EXECUTABLE: wrapper,
    OPEN_DEUTSCH_PLUGIN_MARKETPLACE_ROOT: marketplaceRoot,
  };
  for (const directory of [
    environment.HOME,
    environment.CODEX_HOME,
    environment.XDG_CONFIG_HOME,
    environment.XDG_DATA_HOME,
    environment.XDG_STATE_HOME,
    environment.XDG_CACHE_HOME,
    environment.XDG_RUNTIME_DIR,
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  try {
    const run = async (action) => {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["plugins/open-deutsch/scripts/plugin-lifecycle.mjs", action],
        { cwd: path.resolve("."), env: environment, timeout: 15_000 },
      );
      return JSON.parse(stdout);
    };
    const installed = await run("install");
    assert.equal(installed.action, "install");
    assert.equal(installed.status.state, "installed");
    const refreshed = await run("refresh");
    assert.equal(refreshed.action, "refresh");
    assert.equal(refreshed.status.state, "installed");
    assert.equal((await run("status")).source.version, "0.1.0");
    assert.equal((await run("uninstall")).action, "uninstall");
    assert.equal((await run("status")).state, "missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
