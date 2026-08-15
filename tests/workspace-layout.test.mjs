import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

const packages = new Map([
  ["apps/desktop", "@open-deutsch/desktop"],
  ["apps/mcp-server", "@open-deutsch/mcp-server"],
  ["packages/contracts", "@open-deutsch/contracts"],
  ["packages/domain", "@open-deutsch/domain"],
  ["packages/persistence", "@open-deutsch/persistence"],
  ["packages/codex-client", "@open-deutsch/codex-client"],
  ["plugins/open-deutsch", "@open-deutsch/plugin"],
]);

const allowedInternalDependencies = {
  "@open-deutsch/contracts": [],
  "@open-deutsch/domain": ["@open-deutsch/contracts"],
  "@open-deutsch/persistence": ["@open-deutsch/contracts", "@open-deutsch/domain"],
  "@open-deutsch/codex-client": ["@open-deutsch/contracts"],
  "@open-deutsch/desktop": [
    "@open-deutsch/codex-client",
    "@open-deutsch/contracts",
    "@open-deutsch/domain",
    "@open-deutsch/persistence",
  ],
  "@open-deutsch/mcp-server": [
    "@open-deutsch/contracts",
    "@open-deutsch/domain",
    "@open-deutsch/persistence",
  ],
  "@open-deutsch/plugin": [],
};

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("declares every architectural workspace with a unique package name", async () => {
  const names = [];
  for (const [path, expectedName] of packages) {
    const manifest = await readJson(`${path}/package.json`);
    assert.equal(manifest.name, expectedName, path);
    assert.equal(manifest.private, true, path);
    names.push(manifest.name);
  }
  assert.equal(new Set(names).size, packages.size);
});

test("keeps internal dependency direction aligned with component ownership", async () => {
  for (const [path, expectedName] of packages) {
    const manifest = await readJson(`${path}/package.json`);
    const internalDependencies = Object.keys(manifest.dependencies ?? {})
      .filter((name) => name.startsWith("@open-deutsch/"))
      .sort();
    assert.deepEqual(
      internalDependencies,
      [...allowedInternalDependencies[expectedName]].sort(),
      path,
    );
    for (const name of internalDependencies) {
      assert.equal(manifest.dependencies[name], "workspace:*", `${path} -> ${name}`);
    }
  }
});

test("includes reviewed curriculum and shared fixture/support roots", async () => {
  for (const path of [
    "content/curriculum/README.md",
    "tests/fixtures/README.md",
    "tests/support/README.md",
  ]) {
    const contents = await readFile(new URL(path, root), "utf8");
    assert.ok(contents.length > 20, path);
  }
});

test("workspace globs include apps, shared packages, and the plugin payload", async () => {
  const workspace = await readFile(new URL("pnpm-workspace.yaml", root), "utf8");
  for (const pattern of ["apps/*", "packages/*", "plugins/*"]) {
    assert.match(workspace, new RegExp(`- ${pattern.replace("*", "\\*")}`));
  }
});
