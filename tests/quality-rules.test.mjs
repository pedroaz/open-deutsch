import assert from "node:assert/strict";
import { Linter } from "eslint";
import test from "node:test";

import openDeutsch from "../scripts/eslint-rules/open-deutsch.mjs";

function messagesFor(code, filename, rules) {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,ts,tsx}"],
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      plugins: { "open-deutsch": openDeutsch },
      rules,
    },
    { filename },
  );
}

const boundaryRule = { "open-deutsch/enforce-package-boundaries": "error" };
const electronRules = {
  "open-deutsch/no-electron-remote": "error",
  "open-deutsch/secure-electron-preferences": "error",
};

test("allows declared package dependencies", () => {
  const messages = messagesFor(
    'import { example } from "@open-deutsch/contracts";',
    "packages/domain/src/example.js",
    boundaryRule,
  );
  assert.deepEqual(messages, []);
});

test("rejects forbidden renderer package and Node imports", () => {
  const messages = messagesFor(
    'import db from "@open-deutsch/persistence"; import fs from "node:fs";',
    "apps/desktop/src/renderer/example.js",
    boundaryRule,
  );
  assert.deepEqual(
    messages.map(({ ruleId }) => ruleId),
    ["open-deutsch/enforce-package-boundaries", "open-deutsch/enforce-package-boundaries"],
  );
});

test("rejects relative imports that cross an undeclared workspace boundary", () => {
  const messages = messagesFor(
    'export * from "../../persistence/src/index.js";',
    "packages/domain/src/example.js",
    boundaryRule,
  );
  assert.equal(messages[0]?.ruleId, "open-deutsch/enforce-package-boundaries");
});

test("rejects insecure Electron preferences and remote APIs", () => {
  const messages = messagesFor(
    'import { remote } from "electron"; const options = { nodeIntegration: true, contextIsolation: false };',
    "apps/desktop/src/main/window.js",
    electronRules,
  );
  assert.deepEqual(
    messages.map(({ ruleId }) => ruleId),
    [
      "open-deutsch/no-electron-remote",
      "open-deutsch/secure-electron-preferences",
      "open-deutsch/secure-electron-preferences",
    ],
  );
});

test("requires explicit safe literals for sensitive Electron preferences", () => {
  const unsafe = messagesFor(
    "const enabled = true; const disabled = false; const options = { nodeIntegration: enabled, contextIsolation: disabled };",
    "apps/desktop/src/main/window.js",
    electronRules,
  );
  assert.deepEqual(
    unsafe.map(({ ruleId }) => ruleId),
    ["open-deutsch/secure-electron-preferences", "open-deutsch/secure-electron-preferences"],
  );

  const safe = messagesFor(
    "const options = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true };",
    "apps/desktop/src/main/window.js",
    electronRules,
  );
  assert.deepEqual(safe, []);
});

test("rejects dynamic, required, destructured, and computed Electron remote access", () => {
  const cases = [
    'const { remote } = require("electron");',
    'const remoteModule = require("@electron/remote");',
    'const electronModule = await import("electron");',
    'const remoteModule = await import("@electron/remote");',
    'electron["remote"].getCurrentWindow();',
    "const { remote: remoteApi } = electron;",
    'const electronApi = require("electron"); electronApi.remote.getCurrentWindow();',
    'const electronApi = require("electron"); const alias = electronApi; alias.remote.getCurrentWindow();',
    'let alias; alias = require("electron"); alias.remote.getCurrentWindow();',
    'require("electron")["remote"].getCurrentWindow();',
    'import * as electronApi from "electron"; electronApi.remote.getCurrentWindow();',
    'import * as electronApi from "electron"; const alias = electronApi; alias.remote.getCurrentWindow();',
  ];

  for (const code of cases) {
    const messages = messagesFor(code, "apps/desktop/src/main/window.js", electronRules);
    assert.ok(
      messages.some(({ ruleId }) => ruleId === "open-deutsch/no-electron-remote"),
      code,
    );
  }
});

test("allows the sandboxed preload to require narrow Electron bridges", () => {
  const messages = messagesFor(
    'const { contextBridge, ipcRenderer } = require("electron"); contextBridge.exposeInMainWorld("app", { invoke: () => ipcRenderer.invoke("safe") });',
    "apps/desktop/src/preload/index.cjs",
    electronRules,
  );
  assert.deepEqual(messages, []);
});
