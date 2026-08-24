import { _electron as electron } from "@playwright/test";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "./support/disposable-playwright.mjs";

const execFileAsync = promisify(execFile);

test("launches a secure Electron window and stubs the native folder dialog", async ({
  disposableData,
}, testInfo) => {
  const screenshotPath = testInfo.outputPath("electron-compatibility.png");
  const tracePath = testInfo.outputPath("electron-compatibility-trace.zip");
  const application = await electron.launch({
    args: [
      "--ozone-platform=x11",
      `--user-data-dir=${path.join(disposableData.sandboxRoot, "electron-profile")}`,
      path.resolve("tests/e2e/fixtures/electron-compatibility/main.mjs"),
    ],
    cwd: process.cwd(),
    env: disposableData.environment(process.env),
  });
  const applicationProcess = application.process();
  let tracingStarted = false;
  try {
    await application.evaluate(
      ({ dialog }, filePaths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
      },
      [disposableData.dataRoot],
    );

    const window = await application.firstWindow();
    const consoleErrors = [];
    window.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    window.on("pageerror", (error) => consoleErrors.push(error.message));

    await window.context().tracing.start({ screenshots: true, snapshots: true });
    tracingStarted = true;
    await expect(window).toHaveTitle("Open Deutsch runtime compatibility");
    await expect(window.getByRole("heading", { name: "Electron + Playwright" })).toBeVisible();

    const preferences = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences(),
    );
    expect(preferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    });

    await window.getByRole("button", { name: "Choose test folder" }).click();
    await expect(window.locator("#status")).toHaveText("Folder selection stub completed.");
    await execFileAsync(
      applicationProcess.spawnfile,
      [
        "--ozone-platform=x11",
        `--user-data-dir=${path.join(disposableData.sandboxRoot, "electron-profile")}`,
        path.resolve("tests/e2e/fixtures/electron-compatibility/main.mjs"),
        "open-deutsch://activity/speaking-a1-1",
      ],
      { cwd: process.cwd(), env: disposableData.environment(process.env), timeout: 10_000 },
    );
    await expect(window.locator("#route-status")).toHaveText("Opened activity speaking-a1-1.");
    await window.screenshot({ path: screenshotPath });
    await window.context().tracing.stop({ path: tracePath });
    tracingStarted = false;
    expect(consoleErrors).toEqual([]);
    expect((await stat(screenshotPath)).size).toBeGreaterThan(1000);
    expect((await stat(tracePath)).size).toBeGreaterThan(1000);
  } finally {
    if (tracingStarted) {
      await application
        .context()
        .tracing.stop({ path: tracePath })
        .catch(() => undefined);
    }
    await application.close();
  }
  expect(applicationProcess.exitCode).toBe(0);
});
