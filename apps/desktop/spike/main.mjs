import { app, BrowserWindow } from "electron";
import { DatabaseSync } from "node:sqlite";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

async function verifyPackagedResources() {
  const bootstrapFile = process.env.OPEN_DEUTSCH_BOOTSTRAP_FILE;
  if (!bootstrapFile || !path.isAbsolute(bootstrapFile)) {
    throw new Error("OD_APPIMAGE_BOOTSTRAP_INVALID");
  }
  const bootstrap = JSON.parse(await readFile(bootstrapFile, "utf8"));
  const dataRoot = await realpath(bootstrap.dataRoot);
  const curriculum = path.join(process.resourcesPath, "curriculum", "README.md");
  const pluginManifest = path.join(process.resourcesPath, "plugin", ".codex-plugin", "plugin.json");
  const helper = path.join(process.resourcesPath, "bin", "open-deutsch-mcp-spike.cjs");
  const database = new DatabaseSync(":memory:");
  const sqliteVersion = database.prepare("select sqlite_version() as version").get().version;
  database.close();
  const [curriculumText, plugin] = await Promise.all([
    readFile(curriculum, "utf8"),
    readFile(pluginManifest, "utf8").then((value) => JSON.parse(value)),
    readFile(helper, "utf8"),
  ]);
  const evidence = {
    schemaVersion: 1,
    packaged: app.isPackaged,
    dataRootResolved: dataRoot === (await realpath(process.env.OPEN_DEUTSCH_DATA_ROOT)),
    curriculumReadOnlySnapshot: curriculumText.includes("# Reviewed curriculum"),
    pluginName: plugin.name,
    helperRelativePath: path.relative(process.resourcesPath, helper),
    sqliteVersion,
  };
  const evidenceFile = process.env.OPEN_DEUTSCH_APPIMAGE_EVIDENCE_FILE;
  if (!evidenceFile || !path.isAbsolute(evidenceFile)) {
    throw new Error("OD_APPIMAGE_EVIDENCE_INVALID");
  }
  await writeFile(evidenceFile, `${JSON.stringify(evidence)}\n`, { mode: 0o600, flag: "wx" });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 760,
    height: 520,
    backgroundColor: "#f7f4ed",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  void window.loadFile(path.join(import.meta.dirname, "index.html"));
}

void app
  .whenReady()
  .then(async () => {
    if (process.env.OPEN_DEUTSCH_APPIMAGE_SPIKE === "YES") {
      await verifyPackagedResources();
      app.quit();
      return;
    }
    createWindow();
  })
  .catch((error) => {
    process.stderr.write(`OD_APPIMAGE_SPIKE_FAILED: ${error.message}\n`);
    app.exit(1);
  });

app.on("window-all-closed", () => app.quit());
