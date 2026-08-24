import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("pins the Electron and Playwright pair behind the desktop Make journey", async () => {
  const rootManifest = await readJson("package.json");
  const desktopManifest = await readJson("apps/desktop/package.json");
  const workspace = await readFile("pnpm-workspace.yaml", "utf8");

  assert.equal(rootManifest.devDependencies["@playwright/test"], "1.62.1");
  assert.equal(rootManifest.devDependencies.electron, "42.7.1");
  assert.equal(desktopManifest.devDependencies.electron, "42.7.1");
  assert.match(workspace, /allowBuilds:\n\s+electron: true/);
  assert.match(desktopManifest.scripts["test:e2e"], /^xvfb-run -a /);
  assert.match(desktopManifest.scripts["test:e2e"], /playwright\.config\.mjs/);
});

test("keeps the compatibility shell secure and avoids a readiness deadlock", async () => {
  const main = await readFile("tests/e2e/fixtures/electron-compatibility/main.mjs", "utf8");
  const preload = await readFile("tests/e2e/fixtures/electron-compatibility/preload.cjs", "utf8");
  const journey = await readFile("tests/e2e/playwright-electron-compatibility.spec.mjs", "utf8");

  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.doesNotMatch(main, /await app\.whenReady\(\)/);
  assert.match(main, /app\.whenReady\(\)\.then\(createWindow\)/);
  assert.equal((preload.match(/contextBridge\.exposeInMainWorld/g) ?? []).length, 1);
  assert.match(journey, /dialog\.showOpenDialog = async/);
  assert.match(journey, /tracing\.stop\(\{ path: tracePath \}\)/);
  assert.match(journey, /applicationProcess\.exitCode/);
});
