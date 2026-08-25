import { DatabaseSync } from "node:sqlite";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  desktopIpcEventSchema,
  desktopIpcRequestSchema,
  desktopIpcResponseSchema,
} from "@open-deutsch/contracts";
import { OpenDeutschAppServerClient } from "@open-deutsch/codex-client";
import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";

import { DesktopBackend } from "./backend.js";
import { parseOpenDeutschActivityUrl } from "./deep-link.js";
import { appendDesktopLog } from "./logging.js";
import { publishRendererReadiness } from "./readiness.js";
import { attachNavigationPolicy, configureSessionSecurity } from "./security.js";

const rendererUrl = (() => {
  const url = new URL(
    process.env["OPEN_DEUTSCH_RENDERER_URL"] ?? new URL("../renderer/index.html", import.meta.url),
  );
  if (
    process.env["OPEN_DEUTSCH_TEST_MODE"] === "1" &&
    process.env["OPEN_DEUTSCH_DESKTOP_GALLERY"] === "1"
  ) {
    url.searchParams.set("gallery", "1");
  }
  return url.href;
})();
const preload = fileURLToPath(new URL("../preload/index.cjs", import.meta.url));
let backend: DesktopBackend | undefined;
let mainWindow: BrowserWindow | undefined;
let pendingActivityId: string | undefined;
let readinessPublished = false;
let shutdownStarted = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function verifyPackagedResources(): Promise<void> {
  const bootstrapFile = process.env["OPEN_DEUTSCH_BOOTSTRAP_FILE"];
  const dataRoot = process.env["OPEN_DEUTSCH_DATA_ROOT"];
  const evidenceFile = process.env["OPEN_DEUTSCH_APPIMAGE_EVIDENCE_FILE"];
  if (
    !bootstrapFile ||
    !path.isAbsolute(bootstrapFile) ||
    !dataRoot ||
    !path.isAbsolute(dataRoot)
  ) {
    throw new Error("OD_APPIMAGE_BOOTSTRAP_INVALID");
  }
  if (!evidenceFile || !path.isAbsolute(evidenceFile))
    throw new Error("OD_APPIMAGE_EVIDENCE_INVALID");
  const bootstrap: unknown = JSON.parse(await readFile(bootstrapFile, "utf8")) as unknown;
  if (!isRecord(bootstrap) || typeof bootstrap["dataRoot"] !== "string") {
    throw new Error("OD_APPIMAGE_BOOTSTRAP_INVALID");
  }
  const selectedRoot = await realpath(bootstrap["dataRoot"]);
  const expectedRoot = await realpath(dataRoot);
  const curriculum = path.join(process.resourcesPath, "curriculum", "README.md");
  const pluginManifest = path.join(process.resourcesPath, "plugin", ".codex-plugin", "plugin.json");
  const helper = path.join(process.resourcesPath, "mcp-helper", "open-deutsch-mcp");
  const thirdPartyNotices = path.join(process.resourcesPath, "notices", "THIRD-PARTY-NOTICES.md");
  const licensingNotice = path.join(process.resourcesPath, "notices", "OPEN-DEUTSCH-LICENSING.md");
  await Promise.all([
    stat(curriculum),
    stat(pluginManifest),
    stat(helper),
    stat(thirdPartyNotices),
    stat(licensingNotice),
  ]);
  const plugin: unknown = JSON.parse(await readFile(pluginManifest, "utf8")) as unknown;
  if (!isRecord(plugin) || typeof plugin["name"] !== "string") {
    throw new Error("OD_APPIMAGE_PLUGIN_INVALID");
  }
  const [thirdPartyNoticesText, licensingNoticeText] = await Promise.all([
    readFile(thirdPartyNotices, "utf8"),
    readFile(licensingNotice, "utf8"),
  ]);
  if (
    !thirdPartyNoticesText.includes("# Open Deutsch third-party notices") ||
    !licensingNoticeText.includes("# Open Deutsch licensing and attribution")
  ) {
    throw new Error("OD_APPIMAGE_NOTICES_INVALID");
  }
  const database = new DatabaseSync(":memory:");
  const sqliteRow = database.prepare("select sqlite_version() as version").get() as
    { version?: unknown } | undefined;
  if (!sqliteRow || typeof sqliteRow.version !== "string") {
    database.close();
    throw new Error("OD_APPIMAGE_SQLITE_UNAVAILABLE");
  }
  const sqliteVersion = sqliteRow.version;
  database.close();
  const evidence = {
    schemaVersion: 1,
    packaged: app.isPackaged,
    dataRootResolved: selectedRoot === expectedRoot,
    curriculumReadOnlySnapshot: (await readFile(curriculum, "utf8")).includes(
      "# Reviewed curriculum",
    ),
    noticesPresent: true,
    pluginName: plugin["name"],
    helperRelativePath: path.relative(process.resourcesPath, helper),
    sqliteVersion,
  };
  await writeFile(evidenceFile, `${JSON.stringify(evidence)}\n`, { mode: 0o600, flag: "wx" });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: "Open Deutsch",
    backgroundColor: "#f7f3ea",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload,
    },
  });
  attachNavigationPolicy(window, rendererUrl);
  window.once("ready-to-show", () => {
    window.show();
  });
  window.webContents.once("did-finish-load", () => {
    if (pendingActivityId) {
      const activityId = pendingActivityId;
      pendingActivityId = undefined;
      deliverActivity(activityId);
    }
  });
  void window.loadURL(rendererUrl);
  return window;
}

function deliverActivity(activityId: string): void {
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    pendingActivityId = activityId;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("open-deutsch:event", {
    event: "prepared-activity-open",
    activityId,
    source: "url-scheme",
  });
}

function handleProtocolArguments(argumentsList: readonly string[]): void {
  const candidate = argumentsList.find((argument) => argument.startsWith("open-deutsch://"));
  if (!candidate) return;
  try {
    deliverActivity(parseOpenDeutschActivityUrl(candidate).activityId);
  } catch {
    // Invalid external arguments are ignored; no arbitrary command or path is opened.
  }
}

function installIpc(): void {
  ipcMain.handle("open-deutsch:invoke", async (_event, value: unknown) => {
    const parsedRequest = desktopIpcRequestSchema.safeParse(value);
    if (!parsedRequest.success) throw new Error("OD_IPC_REQUEST_INVALID");
    const response = await backend?.handle(parsedRequest.data);
    const parsedResponse = desktopIpcResponseSchema.safeParse(response);
    if (!parsedResponse.success) throw new Error("OD_IPC_RESPONSE_INVALID");
    return parsedResponse.data;
  });
  ipcMain.on("open-deutsch:renderer-ready", () => {
    if (readinessPublished) return;
    readinessPublished = true;
    void publishRendererReadiness().catch(() => {
      app.exit(1);
    });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName("Open Deutsch");
  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
    handleProtocolArguments(commandLine);
  });
  app.on("before-quit", (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    shutdownStarted = true;
    void (backend?.shutdown() ?? Promise.resolve()).finally(() => {
      app.quit();
    });
  });
  app.on("window-all-closed", () => {
    app.quit();
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      app.quit();
    });
  }
  void app.whenReady().then(() => {
    if (process.env["OPEN_DEUTSCH_APPIMAGE_PROBE"] === "YES") {
      void verifyPackagedResources()
        .then(() => {
          app.quit();
        })
        .catch((error: unknown) => {
          process.stderr.write(
            `OD_APPIMAGE_PACKAGE_VERIFY_FAILED: ${error instanceof Error ? error.message : "unknown"}\n`,
          );
          app.exit(1);
        });
      return;
    }
    if (process.platform === "linux") app.setAsDefaultProtocolClient("open-deutsch");
    handleProtocolArguments(process.argv);
    configureSessionSecurity(
      session.defaultSession,
      Boolean(process.env["OPEN_DEUTSCH_RENDERER_URL"]),
    );
    const userData = app.getPath("userData");
    const bootstrapFile = path.join(userData, "bootstrap.json");
    const knownInstallRoots = [app.getAppPath(), process.resourcesPath];
    const log = (record: Parameters<typeof appendDesktopLog>[1]) => {
      void appendDesktopLog(bootstrapFile, record).catch(() => undefined);
    };
    const appServer = new OpenDeutschAppServerClient({
      forbiddenRoots: [userData, ...knownInstallRoots, process.cwd()],
      openExternal: (url) => shell.openExternal(url),
      presentDeviceCode: async ({ verificationUrl, userCode }) => {
        await shell.openExternal(verificationUrl);
        await dialog.showMessageBox({
          type: "info",
          title: "Open Deutsch account connection",
          message: "Enter this one-time code in the browser window:",
          detail: userCode,
          buttons: ["Continue"],
          defaultId: 0,
          noLink: true,
        });
      },
      processOptions: {
        ...(process.env["OPEN_DEUTSCH_TEST_MODE"] === "1" &&
        process.env["OPEN_DEUTSCH_TEST_CODEX_EXECUTABLE"]
          ? { executable: process.env["OPEN_DEUTSCH_TEST_CODEX_EXECUTABLE"] }
          : {}),
        log,
      },
    });
    backend = new DesktopBackend({
      bootstrapFile,
      knownInstallRoots,
      appServer,
      log,
      emitEvent: (event) => {
        const safeEvent = desktopIpcEventSchema.parse(event);
        mainWindow?.webContents.send("open-deutsch:event", safeEvent);
      },
      exportDiagnostics: async (content) => {
        const result = await dialog.showSaveDialog({
          title: "Export redacted Open Deutsch diagnostics",
          defaultPath: path.join(app.getPath("documents"), "open-deutsch-diagnostics.json"),
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) return { status: "cancelled" };
        await writeFile(result.filePath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
        return { status: "exported", displayName: path.basename(result.filePath) };
      },
      chooseDirectory: async () => {
        const result = await dialog.showOpenDialog({
          defaultPath: path.join(app.getPath("documents"), "Open Deutsch"),
          title: "Choose Open Deutsch data folder",
          properties: ["openDirectory", "createDirectory"],
        });
        return result.canceled ? undefined : result.filePaths[0];
      },
    });
    installIpc();
    mainWindow = createWindow();
  });
}
