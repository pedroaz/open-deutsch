import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("enables the strict shared compiler and source-map baseline", async () => {
  const config = await readJson("tsconfig.base.json");
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noImplicitAny, true);
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(config.compilerOptions.exactOptionalPropertyTypes, true);
  assert.equal(config.compilerOptions.useUnknownInCatchVariables, true);
  assert.equal(config.compilerOptions.composite, true);
  assert.equal(config.compilerOptions.sourceMap, true);
  assert.equal(config.compilerOptions.declarationMap, true);
});

test("separates Node and renderer ambient environments", async () => {
  const node = await readJson("tsconfig.node.json");
  const renderer = await readJson("tsconfig.renderer.json");
  assert.deepEqual(node.compilerOptions.types, ["node"]);
  assert.equal(node.compilerOptions.moduleResolution, "NodeNext");
  assert.deepEqual(renderer.compilerOptions.types, []);
  assert.ok(renderer.compilerOptions.lib.includes("DOM"));
  assert.equal(renderer.compilerOptions.moduleResolution, "Bundler");
});

test("keeps Electron main, preload, and renderer as distinct projects", async () => {
  const desktop = await readJson("apps/desktop/tsconfig.json");
  assert.deepEqual(
    desktop.references.map(({ path }) => path),
    ["./tsconfig.main.json", "./tsconfig.preload.json", "./tsconfig.renderer.json"],
  );

  const renderer = await readJson("apps/desktop/tsconfig.renderer.json");
  const rendererReferences = renderer.references.map(({ path }) => path);
  assert.ok(rendererReferences.includes("../../packages/contracts"));
  assert.ok(!rendererReferences.includes("../../packages/persistence"));
  assert.ok(!rendererReferences.includes("../../packages/codex-client"));
});

test("root references every TypeScript application and shared package", async () => {
  const config = await readJson("tsconfig.json");
  assert.deepEqual(
    config.references.map(({ path }) => path),
    [
      "./packages/contracts",
      "./packages/domain",
      "./packages/persistence",
      "./packages/codex-client",
      "./apps/mcp-server",
      "./apps/desktop",
    ],
  );
});

test("every leaf project discovers future source files", async () => {
  for (const path of [
    "packages/contracts/tsconfig.json",
    "packages/domain/tsconfig.json",
    "packages/persistence/tsconfig.json",
    "packages/codex-client/tsconfig.json",
    "apps/mcp-server/tsconfig.json",
    "apps/desktop/tsconfig.main.json",
    "apps/desktop/tsconfig.preload.json",
    "apps/desktop/tsconfig.renderer.json",
  ]) {
    const config = await readJson(path);
    assert.ok(config.include?.some((pattern) => pattern.includes("**/*.ts")), path);
    assert.equal(config.files, undefined, path);
  }
});
