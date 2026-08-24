import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { _electron as electron } from "@playwright/test";

import {
  initializeOpenDeutschDataRoot,
  inspectDataRootChoice,
  OpenDeutschRepository,
} from "../packages/persistence/dist/index.js";
import {
  createInitialLearnerProfile,
  defaultModelPreferences,
} from "../packages/domain/dist/index.js";
import { createDisposableDataHarness } from "../tests/support/disposable-data.mjs";

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

async function preparePackagedLearner(harness) {
  const profile = path.join(harness.sandboxRoot, "packaged-profile");
  const bootstrapFile = path.join(profile, "bootstrap.json");
  await mkdir(profile, { mode: 0o700 });
  const selection = await inspectDataRootChoice(harness.dataRoot);
  const database = await initializeOpenDeutschDataRoot({
    bootstrapFile,
    selection,
    selectedAt: "2026-08-20T12:00:00.000Z",
    createdAt: "2026-08-20T12:00:00.000Z",
    testMode: true,
  });
  const repository = new OpenDeutschRepository(database);
  await repository.createLearnerSettings({
    profile: createInitialLearnerProfile({
      schemaVersion: 1,
      learnerId: "learner_0123456789abcdefgh",
      levelEstimate: {
        currentLevel: "a2",
        targetLevel: "b1",
        basis: "self-reported",
        updatedAt: "2026-08-20T12:00:00.000Z",
      },
      everydayGermanyGoal: "Handle everyday appointments in German.",
      motivation: "Handle everyday appointments in German.",
      interests: [],
      preferredTopics: [],
      availableStudyMinutesPerWeek: 90,
      correctionPreferences: {
        timing: "immediate",
        coverage: "all-meaningful",
        showConciseExplanation: true,
        showNaturalAlternative: true,
      },
      onboardingState: "complete",
      inferredStrengths: [],
      inferredWeaknesses: [],
      teachingLanguage: "en",
      defaultTeachingProfileId: "conversation-partner",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    }),
    modelPreferences: defaultModelPreferences,
  });
  await repository.acknowledgeFirstAiDisclosure("2026-08-20T12:00:00.000Z");
  database.close();
  return { profile, bootstrapFile };
}

async function launchPackagedDesktop(appDir, profile, environment, controlFile) {
  return electron.launch({
    executablePath: path.join(appDir, "open-deutsch"),
    args: ["--ozone-platform=x11", `--user-data-dir=${profile}`],
    cwd: path.dirname(appDir),
    env: {
      ...environment,
      OPEN_DEUTSCH_TEST_CODEX_EXECUTABLE: path.resolve(
        repositoryRoot,
        "packages/codex-client/test/fixtures/fake-codex.mjs",
      ),
      OPEN_DEUTSCH_FAKE_CONTROL_FILE: controlFile,
    },
  });
}

async function probePackagedDesktop(appDir, harness, environment) {
  const { profile } = await preparePackagedLearner(harness);
  const controlFile = path.join(harness.sandboxRoot, "packaged-fake-codex.json");
  await writeFile(
    controlFile,
    `${JSON.stringify({ scenario: "standard", account: { planType: "plus" } })}\n`,
    { mode: 0o600, flag: "wx" },
  );
  const firstLaunch = await launchPackagedDesktop(appDir, profile, environment, controlFile);
  try {
    const window = await firstLaunch.firstWindow();
    if ((await window.title()) !== "Open Deutsch") throw new Error("OD_APPIMAGE_TITLE_INVALID");
    await window.getByRole("button", { name: "Writing", exact: true }).click();
    await window
      .getByRole("button", { name: "Write without a generated prompt", exact: true })
      .click();
    const writing = window.getByRole("textbox", { name: "Your German text" });
    await writing.fill("Ich brauche ein Termin.");
    await window.getByRole("button", { name: "Correct now" }).click();
    try {
      await window
        .getByRole("heading", { name: "Annotated correction" })
        .waitFor({ timeout: 5_000 });
    } catch {
      const references = await window
        .locator('[data-testid="diagnostic-reference"]')
        .allTextContents();
      const stages = await window.getByRole("status").allTextContents();
      const dialogs = await window.getByRole("dialog").allTextContents();
      const headings = await window.getByRole("heading").allTextContents();
      const correctionButtons = await window
        .getByRole("button", { name: "Correct now", exact: true })
        .evaluateAll((buttons) => buttons.map((button) => button.disabled));
      throw new Error(
        `OD_APPIMAGE_CORRECTION_FAILED:references=${references.join(",").slice(0, 160)}:stages=${stages.join(",").slice(0, 160)}:dialogs=${dialogs.join(",").slice(0, 160)}:headings=${headings.join(",").slice(0, 240)}:correctionButtons=${correctionButtons.join(",")}`,
      );
    }
  } finally {
    await firstLaunch.close();
  }

  const restarted = await launchPackagedDesktop(appDir, profile, environment, controlFile);
  try {
    const window = await restarted.firstWindow();
    await window.getByRole("button", { name: "History", exact: true }).click();
    await window.getByRole("heading", { name: "History", exact: true }).waitFor();
    await window
      .getByRole("heading", { name: "Learner original" })
      .locator("..")
      .getByText("Ich brauche ein Termin.", { exact: true })
      .waitFor();
    await window
      .getByRole("heading", { name: "Model correction" })
      .locator("..")
      .getByText("Ich gehe morgen zum Arzt.", { exact: true })
      .waitFor();
  } finally {
    await restarted.close();
  }
  return { firstLaunchCorrection: true, restartHistory: true, sameProfile: true };
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

function assertEvidence(shell, helper, packagedDesktop) {
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
  const expectedDesktop =
    packagedDesktop.firstLaunchCorrection === true &&
    packagedDesktop.restartHistory === true &&
    packagedDesktop.sameProfile === true;
  if (!expectedShell || !expectedHelper || !expectedDesktop) {
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
    const packagedDesktop = await probePackagedDesktop(appDir, harness, environment);
    assertEvidence(firstShell, helper, packagedDesktop);

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
    assertEvidence(replacementShell, helper, packagedDesktop);

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
        packagedDesktop,
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
