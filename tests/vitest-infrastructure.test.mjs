import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  allowsNoTestsForEmptyProject,
  assertVitestProjectReady,
} from "../scripts/lib/vitest-projects.mjs";

const projectPackages = [
  ["apps/desktop/package.json", "desktop"],
  ["apps/mcp-server/package.json", "mcp-server"],
  ["packages/contracts/package.json", "contracts"],
  ["packages/domain/package.json", "domain"],
  ["packages/persistence/package.json", "persistence"],
  ["packages/codex-client/package.json", "codex-client"],
];

test("root Vitest invocation uses named monorepo projects and critical-domain coverage", async () => {
  const config = await readFile("vitest.config.mjs", "utf8");
  for (const [, project] of projectPackages) {
    assert.match(config, new RegExp(`nodeProject\\("${project}"`));
  }
  assert.match(config, /nodeProject\("test-support"/);
  assert.match(config, /tests\/support\/vitest-disposable-data\.ts/);
  assert.match(config, /concurrent:\s*false/);
  assert.match(config, /packages\/domain\/src\/\*\*\/\*\.ts/);
  assert.match(config, /thresholds:[\s\S]*lines: 100,[\s\S]*functions: 100/);
  assert.match(config, /assertVitestProjectReady/);
  assert.match(config, /passWithNoTests:\s*true/);
});

test("every code package exposes its named local Vitest project", async () => {
  for (const [manifestPath, project] of projectPackages) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.match(manifest.scripts.test, new RegExp(`--project ${project}(?: |$)`), manifestPath);
    assert.doesNotMatch(manifest.scripts.test, /--passWithNoTests/, manifestPath);
  }
});

test("no-test opt-outs stop as soon as a skeleton gains runnable source", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "open-deutsch-vitest-project-"));
  const sourceRoot = path.join(projectRoot, "src", "nested");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(path.join(sourceRoot, "environment.d.ts"), "export {};\n");
  assert.equal(allowsNoTestsForEmptyProject(projectRoot), true);
  assert.deepEqual(assertVitestProjectReady(projectRoot, { allowEmptySkeleton: true }), {
    hasSource: false,
    hasTests: false,
  });
  await writeFile(path.join(sourceRoot, "feature.ts"), "export const feature = true;\n");
  assert.equal(allowsNoTestsForEmptyProject(projectRoot), false);
  assert.throws(
    () => assertVitestProjectReady(projectRoot, { allowEmptySkeleton: true }),
    /VITEST_PROJECT_MISSING_TESTS/,
  );
  const testRoot = path.join(projectRoot, "test", "nested");
  await mkdir(testRoot, { recursive: true });
  await writeFile(path.join(testRoot, "feature.test.ts"), "export {};\n");
  assert.deepEqual(assertVitestProjectReady(projectRoot, { allowEmptySkeleton: true }), {
    hasSource: true,
    hasTests: true,
  });
});

test("the root unit and coverage scripts execute Vitest without live verification", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(manifest.scripts["test:unit"], "vitest run");
  assert.equal(manifest.scripts["test:coverage"], "vitest run --coverage");
  assert.match(manifest.scripts["test:fast"], /run-test-fast\.mjs/);
  assert.match(manifest.scripts.typecheck, /tsc -p tsconfig\.test\.json --noEmit/);
  assert.doesNotMatch(manifest.scripts["test:fast"], /verify:/);
  for (const script of ["test:toolchain", "test:workspace"]) {
    assert.match(
      manifest.scripts[script],
      /--test-global-setup=\.\/tests\/support\/node-disposable-data\.mjs/,
      script,
    );
  }
});

test("a package-local test command selects only its project", () => {
  const result = spawnSync(
    "pnpm",
    ["--config.production=false", "--filter", "@open-deutsch/domain", "test"],
    {
      encoding: "utf8",
      env: process.env,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /\|domain\| test\/clock\.test\.ts/);
  assert.doesNotMatch(result.stdout, /tests\/vitest\/determinism\.test\.ts/);
});

test("Vitest cases cannot opt into unsafe ambient-environment concurrency", async () => {
  const concurrentDeclaration = /\b(?:describe|it|test)\s*\.\s*concurrent\b/;
  for (const unsafeSource of [
    ["test", "concurrent(cases)"].join("."),
    ["it", "concurrent", "each(cases)(callback)"].join("."),
    ["describe", "concurrent", "each(cases)(callback)"].join("."),
  ]) {
    assert.match(unsafeSource, concurrentDeclaration);
  }
  const testRoots = [
    "tests",
    ...projectPackages.map(([manifest]) => path.join(path.dirname(manifest), "test")),
  ];
  for (const root of testRoots) {
    let entries;
    try {
      entries = await readdir(root, { recursive: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!/\.test\.tsx?$/.test(entry)) continue;
      const testFile = path.join(root, entry);
      const source = await readFile(testFile, "utf8");
      assert.doesNotMatch(
        source,
        concurrentDeclaration,
        `${testFile} must remain sequential because each case installs an ambient disposable-data environment`,
      );
    }
  }
});
