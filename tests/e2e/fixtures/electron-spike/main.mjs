import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";

import { parseOpenDeutschActivityUrl } from "../../../../scripts/lib/cross-surface-handoff.mjs";

let mainWindow;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function routeActivity(value) {
  try {
    const route = parseOpenDeutschActivityUrl(value);
    mainWindow?.webContents.send("spike:activity-route", route.activityId);
  } catch {
    // Unsupported or malformed external routes are ignored by this compatibility spike.
  }
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("open-url", (event, value) => {
    event.preventDefault();
    routeActivity(value);
  });

  app.on("second-instance", (_event, argv) => {
    const value = argv.find((argument) => argument.startsWith("open-deutsch://"));
    if (value) routeActivity(value);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 520,
    show: false,
    backgroundColor: "#f7f4ed",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(import.meta.dirname, "preload.cjs"),
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadFile(path.join(import.meta.dirname, "index.html"));
}

ipcMain.handle("spike:choose-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose a disposable Open Deutsch test folder",
    properties: ["openDirectory", "createDirectory"],
  });
  return { selected: !result.canceled, count: result.filePaths.length };
});

if (hasSingleInstanceLock) void app.whenReady().then(createWindow);

app.on("window-all-closed", () => app.quit());
