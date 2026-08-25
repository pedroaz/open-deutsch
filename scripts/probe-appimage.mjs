import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { createDisposableDataHarness } from "./lib/disposable-data.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const releaseDirectory = path.join(repositoryRoot, "release", "appimage");
const timeoutMilliseconds = 30_000;

async function sha256(target) {
  return createHash("sha256")
    .update(await readFile(target))
    .digest("hex");
}

async function findAppImage() {
  const candidates = (await readdir(releaseDirectory))
    .filter((entry) => /^Open-Deutsch-[^-]+-x86_64\.AppImage$/u.test(entry))
    .sort();
  if (candidates.length !== 1) {
    throw new Error(`OD_APPIMAGE_ARTIFACT_COUNT_INVALID:${candidates.length}`);
  }
  return path.join(releaseDirectory, candidates[0]);
}

export async function makeRuntimeEnvironment(harness, inherited = process.env) {
  const home = path.join(harness.sandboxRoot, "home");
  const temporary = path.join(harness.sandboxRoot, "tmp");
  const xdg = Object.fromEntries(
    ["data", "state", "cache", "runtime"].map((name) => [
      name,
      path.join(harness.sandboxRoot, "xdg", name),
    ]),
  );
  await Promise.all(
    [home, temporary, ...Object.values(xdg)].map((target) =>
      mkdir(target, { recursive: true, mode: 0o700 }),
    ),
  );
  return {
    ...harness.environment(inherited),
    HOME: home,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    XDG_CONFIG_HOME: harness.configRoot,
    XDG_DATA_HOME: xdg.data,
    XDG_STATE_HOME: xdg.state,
    XDG_CACHE_HOME: xdg.cache,
    XDG_RUNTIME_DIR: xdg.runtime,
  };
}

async function extractAppImage(installedArtifact, extractionParent, environment) {
  await rm(path.join(extractionParent, "squashfs-root"), { recursive: true, force: true });
  await execFileAsync(installedArtifact, ["--appimage-extract"], {
    cwd: extractionParent,
    env: environment,
    timeout: timeoutMilliseconds,
    maxBuffer: 16 * 1024 * 1024,
  });
  const appDir = path.join(extractionParent, "squashfs-root");
  const appRun = path.join(appDir, "AppRun");
  if (!(await stat(appRun)).isFile()) throw new Error("OD_APPIMAGE_APPRUN_MISSING");
  return appDir;
}

async function launchPackagedShell(appDir, environment, evidenceFile) {
  await execFileAsync("xvfb-run", ["-a", path.join(appDir, "AppRun"), "--ozone-platform=x11"], {
    cwd: path.dirname(appDir),
    env: {
      ...environment,
      APPDIR: appDir,
      OPEN_DEUTSCH_APPIMAGE_PROBE: "YES",
      OPEN_DEUTSCH_APPIMAGE_EVIDENCE_FILE: evidenceFile,
    },
    timeout: timeoutMilliseconds,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(await readFile(evidenceFile, "utf8"));
}

async function probePackagedHelper(appDir, environment) {
  const executable = path.join(appDir, "open-deutsch");
  const helper = path.join(appDir, "resources", "mcp-helper", "open-deutsch-mcp.cjs");
  const { stdout } = await execFileAsync(executable, [helper, "--probe"], {
    cwd: path.dirname(appDir),
    env: { ...environment, APPDIR: appDir, ELECTRON_RUN_AS_NODE: "1" },
    timeout: timeoutMilliseconds,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function cleanupDisposableHarness(harness) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await harness.cleanup();
      return;
    } catch (error) {
      if (error?.code !== "ENOTEMPTY" || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

function assertEvidence(shell, helper) {
  const expectedShell =
    shell.schemaVersion === 1 &&
    shell.packaged === true &&
    shell.dataRootResolved === true &&
    shell.curriculumReadOnlySnapshot === true &&
    shell.noticesPresent === true &&
    shell.pluginName === "open-deutsch" &&
    shell.helperRelativePath === path.join("mcp-helper", "open-deutsch-mcp") &&
    typeof shell.sqliteVersion === "string";
  const expectedHelper =
    helper.schemaVersion === 1 &&
    helper.dataRootResolved === true &&
    typeof helper.sqliteVersion === "string";
  if (!expectedShell || !expectedHelper) {
    throw new Error("OD_APPIMAGE_EVIDENCE_INVALID");
  }
}

async function main() {
  const sourceArtifact = await findAppImage();
  const harness = await createDisposableDataHarness();
  try {
    const environment = await makeRuntimeEnvironment(harness);
    const installationDirectory = path.join(harness.sandboxRoot, "installation");
    const extractionDirectory = path.join(harness.sandboxRoot, "extraction");
    await Promise.all([
      mkdir(installationDirectory, { mode: 0o700 }),
      mkdir(extractionDirectory, { mode: 0o700 }),
    ]);
    const installedArtifact = path.join(installationDirectory, "Open-Deutsch.AppImage");
    await copyFile(sourceArtifact, installedArtifact);
    await chmod(installedArtifact, 0o700);
    const sourceHash = await sha256(sourceArtifact);
    const bootstrapHash = await sha256(harness.bootstrapFile);

    let appDir = await extractAppImage(installedArtifact, extractionDirectory, environment);
    const firstShell = await launchPackagedShell(
      appDir,
      environment,
      path.join(harness.dataRoot, "first-launch.json"),
    );
    const helper = await probePackagedHelper(appDir, environment);
    assertEvidence(firstShell, helper);

    // Manual replacement is deliberately modeled as replacing the installed artifact,
    // not as an in-app updater. The selected data-root pointer must remain unchanged.
    await copyFile(sourceArtifact, installedArtifact);
    await chmod(installedArtifact, 0o700);
    appDir = await extractAppImage(installedArtifact, extractionDirectory, environment);
    const replacementShell = await launchPackagedShell(
      appDir,
      environment,
      path.join(harness.dataRoot, "replacement-launch.json"),
    );
    assertEvidence(replacementShell, helper);

    if (
      (await sha256(installedArtifact)) !== sourceHash ||
      (await sha256(harness.bootstrapFile)) !== bootstrapHash
    ) {
      throw new Error("OD_APPIMAGE_REPLACEMENT_BOUNDARY_VIOLATED");
    }

    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        artifact: path.basename(sourceArtifact),
        launchedOutsideCheckout: true,
        packagedShell: firstShell,
        packagedHelper: helper,
        manualReplacementPreservedBootstrap: true,
        automaticUpdaterIncluded: false,
      })}\n`,
    );
  } finally {
    await cleanupDisposableHarness(harness);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main();
}
