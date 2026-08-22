import { _electron as electron } from "@playwright/test";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test } from "./support/disposable-playwright.mjs";
import {
  initializeOpenDeutschDataRoot,
  inspectDataRootChoice,
  OpenDeutschRepository,
  resolveDataRootLayout,
} from "../../packages/persistence/dist/index.js";
import {
  createInitialLearnerProfile,
  defaultModelPreferences,
} from "../../packages/domain/dist/index.js";

const desktopEntry = path.resolve("apps/desktop/dist/main/index.js");
const fakeCodex = path.resolve("packages/codex-client/test/fixtures/fake-codex.mjs");

async function launchDesktop(disposableData, name, overrides = {}, options = {}) {
  const profile = path.join(disposableData.sandboxRoot, `profile-${name}`);
  const controlFile = path.join(disposableData.sandboxRoot, `fake-codex-${name}.json`);
  const fakeAccount =
    overrides.OPEN_DEUTSCH_DESKTOP_SCENARIO === "signed-out" ? null : { planType: "plus" };
  await mkdir(profile, { mode: 0o700 });
  if (options.realDataRoot) {
    const selection = await inspectDataRootChoice(disposableData.dataRoot);
    const database = await initializeOpenDeutschDataRoot({
      bootstrapFile: path.join(profile, "bootstrap.json"),
      selection,
      selectedAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
      testMode: true,
    });
    const repository = new OpenDeutschRepository(database);
    const timestamp = "2026-08-20T12:00:00.000Z";
    await repository.createLearnerSettings({
      profile: createInitialLearnerProfile({
        schemaVersion: 1,
        learnerId: "learner_0123456789abcdefgh",
        levelEstimate: {
          currentLevel: "a2",
          targetLevel: "b1",
          basis: "self-reported",
          updatedAt: timestamp,
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
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      modelPreferences: defaultModelPreferences,
    });
    database.close();
  }
  await writeFile(
    controlFile,
    `${JSON.stringify({ scenario: "standard", account: fakeAccount })}\n`,
    { mode: 0o600 },
  );
  return electron.launch({
    args: ["--ozone-platform=x11", `--user-data-dir=${profile}`, desktopEntry],
    cwd: process.cwd(),
    env: {
      ...disposableData.environment(process.env),
      ...(options.realDataRoot ? {} : { OPEN_DEUTSCH_DESKTOP_SCENARIO: "ready" }),
      OPEN_DEUTSCH_TEST_CODEX_EXECUTABLE: fakeCodex,
      OPEN_DEUTSCH_FAKE_CONTROL_FILE: controlFile,
      ...overrides,
    },
  });
}

function collectWindowErrors(window) {
  const errors = [];
  window.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  window.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("launches the production shell with hardened Electron preferences and responsive navigation", async ({
  disposableData,
}, testInfo) => {
  test.setTimeout(60_000);
  const application = await launchDesktop(
    disposableData,
    "foundation",
    { OPENAI_API_KEY: "PRIVATE_PROVIDER_TOKEN_CANARY" },
    { realDataRoot: true },
  );
  const process = application.process();
  let mainProcessOutput = "";
  process.stdout?.on("data", (chunk) => {
    mainProcessOutput += String(chunk);
  });
  process.stderr?.on("data", (chunk) => {
    mainProcessOutput += String(chunk);
  });
  try {
    const window = await application.firstWindow();
    const errors = collectWindowErrors(window);
    await expect(window).toHaveTitle("Open Deutsch");
    await expect(window.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(window.getByRole("heading", { name: "Weekly plan" })).toBeVisible();
    await expect(window.getByRole("heading", { name: "Prepared activities" })).toBeVisible();
    await window.getByRole("button", { name: "Refresh dashboard" }).click();
    await expect(window.getByText(/Updated at/u)).toBeVisible();

    const preferences = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences(),
    );
    expect(preferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    });
    expect(
      await window.evaluate(() => ({
        bridgeFrozen: Object.isFrozen(window.openDeutsch),
        processType: typeof globalThis.process,
        requireType: typeof globalThis.require,
      })),
    ).toEqual({ bridgeFrozen: true, processType: "undefined", requireType: "undefined" });
    expect(
      await window.evaluate(async () => {
        try {
          await globalThis.openDeutsch.invoke({});
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    expect(await window.evaluate(() => globalThis.open("https://example.com") === null)).toBe(true);

    const navButtons = window.getByRole("navigation").getByRole("button");
    await navButtons.first().focus();
    await window.keyboard.press("ArrowDown");
    await expect(window.getByRole("button", { name: "Practice", exact: true })).toBeFocused();
    await window.keyboard.press("Enter");
    await expect(window.getByRole("heading", { name: "Practice" })).toBeVisible();

    await window.setViewportSize({ width: 820, height: 720 });
    expect(
      await window.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
    ).toBe(true);
    await expect(window.getByRole("button", { name: "Open helper" })).toBeVisible();
    await window.getByRole("button", { name: "Open helper" }).click();
    await expect(window.getByRole("complementary", { name: "Context helper" })).toBeVisible();
    await window.getByRole("button", { name: "Close helper" }).click();
    await window.getByRole("button", { name: "Writing", exact: true }).click();
    await window.getByRole("button", { name: "Generate a writing prompt" }).click();
    await expect(window.getByRole("dialog", { name: "Before the first AI action" })).toBeVisible();
    await window.getByRole("button", { name: "I understand, continue" }).click();
    await window.getByRole("button", { name: "Generate a writing prompt" }).click();
    await expect(window.getByRole("heading", { name: "Einen Termin verschieben" })).toBeVisible();
    await expect(window.getByText("verschieben", { exact: true })).toBeVisible();
    for (const [size, viewport] of [
      ["standard", { width: 1280, height: 820 }],
      ["narrow", { width: 820, height: 760 }],
    ]) {
      await window.setViewportSize(viewport);
      const screenshot = testInfo.outputPath(`writing-prompt-en-${size}.png`);
      await window.screenshot({ path: screenshot, fullPage: true });
      expect((await stat(screenshot)).size).toBeGreaterThan(1_000);
    }
    await window.getByRole("button", { name: "Deutsch" }).click();
    await expect(window.locator("html")).toHaveAttribute("lang", "de");
    for (const [size, viewport] of [
      ["standard", { width: 1280, height: 820 }],
      ["narrow", { width: 820, height: 760 }],
    ]) {
      await window.setViewportSize(viewport);
      const screenshot = testInfo.outputPath(`writing-prompt-de-${size}.png`);
      await window.screenshot({ path: screenshot, fullPage: true });
      expect((await stat(screenshot)).size).toBeGreaterThan(1_000);
    }
    await window.getByRole("button", { name: "English" }).click();
    await expect(window.locator("html")).toHaveAttribute("lang", "en");
    await window.getByRole("button", { name: "Write without a generated prompt" }).click();
    await expect(window.getByRole("heading", { name: "Einen Termin verschieben" })).toHaveCount(0);
    const writing = window.getByRole("textbox", { name: "Your German text" });
    await writing.fill("Ich brauche ein Termin.");
    await window.getByRole("button", { name: "Correct now" }).click();
    await expect(window.getByRole("heading", { name: "Annotated correction" })).toBeVisible();
    await expect(window.getByRole("heading", { name: "Original text" })).toBeVisible();
    await expect(window.getByRole("heading", { level: 2, name: "Corrected text" })).toBeVisible();
    await expect(window.getByRole("heading", { level: 4, name: "Corrected text" })).toBeVisible();
    const firstChange = window.getByRole("button", { name: "Show change 1" });
    await expect(firstChange).toHaveCount(3);
    await expect(firstChange.first()).toHaveAttribute("aria-pressed", "true");
    const secondChange = window.getByRole("button", { name: "Show change 2" });
    await secondChange.first().click();
    await expect(
      window.getByText("The corrected sentence uses a complete destination phrase."),
    ).toBeVisible();
    await expect(secondChange).toHaveCount(3);
    for (const change of await secondChange.all())
      await expect(change).toHaveAttribute("aria-pressed", "true");
    await expect(window.getByText("A natural alternative")).toBeVisible();
    await expect(window.getByText("1 vocabulary candidate")).toBeVisible();
    await expect(window.getByText("Suggested follow-up practice")).toBeVisible();
    await expect(window.getByText("Uncertainty and caveats")).toBeVisible();
    await window.getByText("1 vocabulary candidate").click();
    await expect(window.getByText("Useful for everyday appointments.")).toBeVisible();
    await expect(writing).toHaveValue("Ich brauche ein Termin.");
    expect(application.windows()).toHaveLength(1);
    for (const [size, viewport] of [
      ["standard", { width: 1280, height: 820 }],
      ["narrow", { width: 820, height: 760 }],
    ]) {
      await window.setViewportSize(viewport);
      const screenshot = testInfo.outputPath(`writing-correction-en-${size}.png`);
      await window.screenshot({ path: screenshot, fullPage: true });
      expect((await stat(screenshot)).size).toBeGreaterThan(1_000);
    }
    await window.getByRole("button", { name: "Deutsch" }).click();
    await expect(window.locator("html")).toHaveAttribute("lang", "de");
    for (const [size, viewport] of [
      ["standard", { width: 1280, height: 820 }],
      ["narrow", { width: 820, height: 760 }],
    ]) {
      await window.setViewportSize(viewport);
      const screenshot = testInfo.outputPath(`writing-correction-de-${size}.png`);
      await window.screenshot({ path: screenshot, fullPage: true });
      expect((await stat(screenshot)).size).toBeGreaterThan(1_000);
    }
    await window.getByRole("button", { name: "English" }).click();
    await expect(window.locator("html")).toHaveAttribute("lang", "en");
    await writing.focus();
    await window.keyboard.press("Home");
    await window.keyboard.press("Shift+ArrowRight");
    await window.keyboard.press("Shift+ArrowRight");
    await window.keyboard.press("Shift+ArrowRight");
    await window.keyboard.press("Shift+ArrowRight");
    await expect(window.getByText("4 characters selected")).toBeVisible();
    await window.getByRole("button", { name: "Open helper" }).click();
    const helper = window.getByRole("complementary", { name: "Context helper" });
    await expect(helper.getByText("Ich", { exact: true })).toBeVisible();
    const helperQuestion = helper.getByRole("textbox", {
      name: "What would you like explained?",
    });
    await helperQuestion.fill("Why is this the subject?");
    await helper.getByRole("button", { name: "Ask helper" }).click();
    await expect(helper.getByText("The preposition mit takes the dative case.")).toBeVisible();
    await expect(helper.getByRole("heading", { name: "Alternatives" })).toBeVisible();
    await expect(helper.getByText("Ich nehme den Bus.")).toBeVisible();
    await expect(helper.getByRole("heading", { name: "Translations" })).toBeVisible();
    await expect(helper.getByText(/by bus/u)).toBeVisible();
    await expect(helper.getByRole("heading", { name: "Mini-exercises" })).toBeVisible();
    await helper.getByText("Complete: mit ___ Bus").click();
    await expect(helper.locator("details").getByText("mit dem Bus", { exact: true })).toBeVisible();
    await expect(helper.getByRole("heading", { name: "Follow-up ideas" })).toBeVisible();
    await expect(helper.getByRole("button", { name: /apply|replace|insert/u })).toHaveCount(0);
    await helperQuestion.fill("Can you give me an example?");
    await helper.getByRole("button", { name: "Ask helper" }).click();
    await expect(helper.getByText("Why is this the subject?")).toBeVisible();
    await expect(helper.getByText("Can you give me an example?")).toBeVisible();
    await window.setViewportSize({ width: 1280, height: 820 });
    const helperEnglish = testInfo.outputPath("contextual-helper-en-standard.png");
    await window.screenshot({ path: helperEnglish, fullPage: true });
    expect((await stat(helperEnglish)).size).toBeGreaterThan(1_000);
    await window.getByRole("button", { name: "Deutsch" }).click();
    await window.setViewportSize({ width: 820, height: 760 });
    const helperGerman = testInfo.outputPath("contextual-helper-de-narrow.png");
    await window.screenshot({ path: helperGerman, fullPage: true });
    expect((await stat(helperGerman)).size).toBeGreaterThan(1_000);
    await window.getByRole("button", { name: "English" }).click();
    await window.getByRole("button", { name: "Close helper" }).click();
    await writeFile(
      path.join(disposableData.sandboxRoot, "fake-codex-foundation.json"),
      `${JSON.stringify({ scenario: "hung-turn", account: { planType: "plus" } })}\n`,
      { mode: 0o600 },
    );
    await writing.fill("PRIVATE_WRITING_CANARY Ich brauche noch einen Termin.");
    await window.getByRole("button", { name: "Correct now" }).click();
    await window.getByRole("button", { name: "Cancel correction" }).click();
    await expect(window.getByText("Correction cancelled. Your text is still here.")).toBeVisible();
    await expect(writing).toHaveValue("PRIVATE_WRITING_CANARY Ich brauche noch einen Termin.");
    expect(mainProcessOutput).not.toContain("PRIVATE_WRITING_CANARY");
    expect(mainProcessOutput).not.toContain("PRIVATE_PROVIDER_TOKEN_CANARY");
    await writeFile(
      path.join(disposableData.sandboxRoot, "fake-codex-foundation.json"),
      `${JSON.stringify({ scenario: "standard", account: { planType: "plus" } })}\n`,
      { mode: 0o600 },
    );
    await window.getByRole("button", { name: "Dashboard" }).click();
    await expect(window.getByRole("dialog", { name: "Leave this writing draft?" })).toBeVisible();
    await window.getByRole("button", { name: "Keep editing" }).click();
    await expect(writing).toHaveValue("PRIVATE_WRITING_CANARY Ich brauche noch einen Termin.");
    await window.getByRole("button", { name: "Dashboard" }).click();
    await window.getByRole("button", { name: "Discard and leave" }).click();
    await expect(window.getByRole("heading", { name: "Keep your German moving" })).toBeVisible();
    await expect(window.getByText(/changed segment/u)).toBeVisible();
    const generatedEvidenceDatabase = new DatabaseSync(
      resolveDataRootLayout(disposableData.dataRoot).database,
    );
    const generatedEvidenceCount = Number(
      generatedEvidenceDatabase.prepare("SELECT count(*) AS count FROM mistake_occurrences").get()
        .count,
    );
    expect(
      generatedEvidenceDatabase
        .prepare("SELECT count(*) AS count FROM vocabulary_entries WHERE status = 'candidate'")
        .get(),
    ).toEqual({ count: 1 });
    generatedEvidenceDatabase.close();
    expect(generatedEvidenceCount).toBeGreaterThan(0);
    await window.getByRole("button", { name: "History", exact: true }).click();
    await expect(window.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    const originalPane = window.getByRole("heading", { name: "Learner original" }).locator("..");
    await expect(originalPane.getByText("Ich brauche ein Termin.", { exact: true })).toBeVisible();
    const correctionPane = window.getByRole("heading", { name: "Model correction" }).locator("..");
    await expect(
      correctionPane.getByText("Ich gehe morgen zum Arzt.", { exact: true }),
    ).toBeVisible();
    await expect(window.getByRole("heading", { name: "Saved feedback" })).toBeVisible();
    await expect(window.getByText(/One observation only—not a recurring pattern/u)).toBeVisible();
    await expect(window.getByText("Vocabulary candidates")).toBeVisible();
    await expect(window.getByText(/Useful for everyday appointments/u)).toBeVisible();
    for (const [locale, switcher] of [
      ["en", null],
      ["de", "Deutsch"],
    ]) {
      if (switcher) await window.getByRole("button", { name: switcher }).click();
      for (const [size, viewport] of [
        ["standard", { width: 1280, height: 820 }],
        ["narrow", { width: 820, height: 760 }],
      ]) {
        await window.setViewportSize(viewport);
        const historyScreenshot = testInfo.outputPath(`history-${locale}-${size}.png`);
        await window.screenshot({ path: historyScreenshot, fullPage: true });
        expect((await stat(historyScreenshot)).size).toBeGreaterThan(1_000);
      }
    }
    await window.getByRole("button", { name: "English" }).click();
    const generatedPattern = window
      .getByRole("button", { name: "Practice this" })
      .first()
      .locator("xpath=ancestor::article");
    await generatedPattern.getByRole("button", { name: "Practice this" }).click();
    await expect(
      window.getByText("Targeted practice is ready in your prepared activities."),
    ).toBeVisible();
    const targetedDatabase = new DatabaseSync(
      resolveDataRootLayout(disposableData.dataRoot).database,
    );
    targetedDatabase.exec("PRAGMA foreign_keys = ON;");
    try {
      expect(
        targetedDatabase.prepare("SELECT count(*) AS count FROM generated_activity_payloads").get(),
      ).toEqual({ count: 1 });
      expect(
        targetedDatabase.prepare("SELECT count(*) AS count FROM targeted_practice_links").get(),
      ).toEqual({ count: 1 });
      expect(
        targetedDatabase.prepare("SELECT count(*) AS count FROM mistake_occurrences").get(),
      ).toEqual({ count: generatedEvidenceCount });
    } finally {
      targetedDatabase.close();
    }
    await window.getByRole("button", { name: "Dashboard" }).click();
    await window.getByRole("button", { name: "Open activity" }).click();
    await expect(
      window.getByRole("heading", { name: "Appointments in everyday German", exact: true }).first(),
    ).toBeVisible();
    await expect(window.getByRole("heading", { name: "Practice set ready" })).toBeVisible();
    await window.getByRole("button", { name: "Start practice" }).click();
    await expect(window.getByText("Wann gehst du zum Arzt?")).toBeVisible();
    await window.getByRole("textbox", { name: "Your answer" }).fill("Ich gehe morgen zu Arzt.");
    await window.getByRole("button", { name: "Submit answer" }).click();
    await expect(
      window.getByText("The answer communicates the main idea and needs one small correction."),
    ).toBeVisible();
    await expect(window.getByText("Suggested answer:").locator("..")).toContainText(
      "Ich gehe morgen zum Arzt.",
    );
    await expect(window.getByRole("heading", { name: "Practice complete" })).toBeVisible();
    const startedDatabase = new DatabaseSync(
      resolveDataRootLayout(disposableData.dataRoot).database,
    );
    try {
      expect(startedDatabase.prepare("SELECT count(*) AS count FROM exercises").get()).toEqual({
        count: 2,
      });
      expect(startedDatabase.prepare("SELECT count(*) AS count FROM attempts").get()).toEqual({
        count: 2,
      });
      expect(
        startedDatabase
          .prepare("SELECT count(*) AS count FROM attempts WHERE status = 'completed'")
          .get(),
      ).toEqual({ count: 2 });
      expect(
        startedDatabase
          .prepare(
            "SELECT count(*) AS count FROM attempts WHERE json_extract(feedback_json, '$.source.kind') = 'ai'",
          )
          .get(),
      ).toEqual({ count: 2 });
    } finally {
      startedDatabase.close();
    }
    await window.getByRole("button", { name: "Practice", exact: true }).click();
    await window
      .getByRole("textbox", { name: "What would you like to practise?" })
      .fill("Create an A2 lesson about making a doctor appointment with useful vocabulary.");
    await window.getByRole("button", { name: "Create lesson" }).click();
    await expect(window.getByRole("heading", { name: "Keep your German moving" })).toBeVisible();
    await window.getByRole("button", { name: "Open activity" }).click();
    await expect(
      window.getByRole("heading", { name: "Appointments in everyday German", exact: true }).first(),
    ).toBeVisible();
    await expect(window.getByRole("heading", { name: "Useful pattern" })).toBeVisible();
    await expect(window.getByRole("heading", { name: "Vocabulary foundations" })).toBeVisible();
    const generatedOnlyDatabase = new DatabaseSync(
      resolveDataRootLayout(disposableData.dataRoot).database,
    );
    try {
      expect(
        generatedOnlyDatabase.prepare("SELECT count(*) AS count FROM exercises").get(),
      ).toEqual({
        count: 2,
      });
      expect(
        generatedOnlyDatabase
          .prepare("SELECT count(*) AS count FROM prepared_activities WHERE status = 'prepared'")
          .get(),
      ).toEqual({ count: 1 });
      expect(
        generatedOnlyDatabase
          .prepare("SELECT count(*) AS count FROM vocabulary_entries WHERE status = 'candidate'")
          .get(),
      ).toEqual({ count: 3 });
    } finally {
      generatedOnlyDatabase.close();
    }
    await window.getByRole("button", { name: "Start practice" }).click();
    await window.reload();
    await expect(window.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
    await window.getByRole("button", { name: "Open activity" }).click();
    await expect(
      window.getByRole("heading", { name: "An earlier practice set is still active" }),
    ).toBeVisible();
    await window.getByRole("button", { name: "Abandon interrupted set" }).click();
    await expect(window.getByRole("heading", { name: "Practice set ready" })).toBeVisible();
    const abandonedDatabase = new DatabaseSync(
      resolveDataRootLayout(disposableData.dataRoot).database,
    );
    try {
      expect(
        abandonedDatabase
          .prepare("SELECT count(*) AS count FROM attempts WHERE status = 'abandoned'")
          .get(),
      ).toEqual({ count: 1 });
      expect(
        abandonedDatabase
          .prepare("SELECT count(*) AS count FROM prepared_activities WHERE status = 'prepared'")
          .get(),
      ).toEqual({ count: 1 });
    } finally {
      abandonedDatabase.close();
    }
    await window.getByRole("button", { name: "History", exact: true }).click();
    const exerciseHistory = window
      .getByRole("heading", { name: "Exercise", exact: true })
      .locator("xpath=ancestor::article");
    await expect(
      exerciseHistory.getByText("Ich gehe morgen zu Arzt.", { exact: true }),
    ).toBeVisible();
    await expect(
      exerciseHistory.getByText("Ich gehe morgen zum Arzt.", { exact: true }),
    ).toBeVisible();
    await exerciseHistory.getByRole("button", { name: "Practice this again" }).click();
    await expect(window.getByRole("heading", { name: "Practice set ready" })).toBeVisible();
    await window.getByRole("button", { name: "Start practice" }).click();
    await window.getByRole("button", { name: "Abandon set" }).click();
    await expect(window.getByRole("heading", { name: "Practice set abandoned" })).toBeVisible();
    await window.getByRole("button", { name: "History", exact: true }).click();
    const writingHistory = window
      .getByText("Ich brauche ein Termin.", { exact: true })
      .locator("xpath=ancestor::article");
    await writingHistory.getByRole("button", { name: "Practice this again" }).click();
    await expect(window.getByRole("textbox", { name: "Your German text" })).toHaveValue(
      "Ich brauche ein Termin.",
    );
    await window.getByRole("button", { name: "History", exact: true }).click();
    await window.getByRole("button", { name: "Discard and leave" }).click();
    for (let remaining = 2; remaining > 0; remaining -= 1) {
      await window.getByRole("button", { name: "Delete this record" }).first().click();
      await expect(
        window.getByRole("dialog", { name: "Delete this history record?" }),
      ).toBeVisible();
      await window.getByRole("dialog").getByRole("button", { name: "Delete record" }).click();
    }
    await expect(window.getByText("No saved activity matches these filters.")).toBeVisible();
    expect(errors).toEqual([]);

    const screenshot = testInfo.outputPath("desktop-foundation-narrow.png");
    await window.screenshot({ path: screenshot });
    expect((await stat(screenshot)).size).toBeGreaterThan(1_000);
  } finally {
    await application.close();
  }
  expect(process.exitCode).toBe(0);
});

test("reopens a persisted writing correction after an Electron restart", async ({
  disposableData,
}) => {
  const name = "writing-restart";
  const profile = path.join(disposableData.sandboxRoot, `profile-${name}`);
  const controlFile = path.join(disposableData.sandboxRoot, `fake-codex-${name}.json`);
  const application = await launchDesktop(disposableData, name, {}, { realDataRoot: true });
  try {
    const window = await application.firstWindow();
    await window.getByRole("button", { name: "Writing", exact: true }).click();
    const writing = window.getByRole("textbox", { name: "Your German text" });
    await writing.fill("Ich brauche ein Termin.");
    await window.getByRole("button", { name: "Correct now" }).click();
    await window.getByRole("button", { name: "I understand, continue" }).click();
    await window.getByRole("button", { name: "Correct now" }).click();
    await expect(window.getByRole("heading", { name: "Annotated correction" })).toBeVisible();
  } finally {
    await application.close();
  }

  const restarted = await electron.launch({
    args: ["--ozone-platform=x11", `--user-data-dir=${profile}`, desktopEntry],
    cwd: process.cwd(),
    env: {
      ...disposableData.environment(process.env),
      OPEN_DEUTSCH_TEST_CODEX_EXECUTABLE: fakeCodex,
      OPEN_DEUTSCH_FAKE_CONTROL_FILE: controlFile,
    },
  });
  try {
    const window = await restarted.firstWindow();
    const errors = collectWindowErrors(window);
    await window.getByRole("button", { name: "History", exact: true }).click();
    await expect(window.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    await expect(
      window
        .getByRole("heading", { name: "Learner original" })
        .locator("..")
        .getByText("Ich brauche ein Termin.", { exact: true }),
    ).toBeVisible();
    await expect(
      window
        .getByRole("heading", { name: "Model correction" })
        .locator("..")
        .getByText("Ich gehe morgen zum Arzt.", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await restarted.close();
  }
});

test("renders every startup recovery class with a safe action and diagnostic", async ({
  disposableData,
}) => {
  const cases = [
    ["missing-root", "The selected folder is unavailable"],
    ["stale-root", "The selected folder changed"],
    ["newer-schema", "This learning folder needs a newer Open Deutsch"],
    ["locked-database", "The learning database is busy"],
    ["missing-codex", "Codex is not installed"],
    ["unsupported-codex", "This Codex version is unsupported"],
    ["signed-out", "Connect your Codex account"],
  ];
  for (const [scenario, text] of cases) {
    const application = await launchDesktop(disposableData, scenario, {
      OPEN_DEUTSCH_DESKTOP_SCENARIO: scenario,
    });
    try {
      const window = await application.firstWindow();
      await expect(window.getByText(text, { exact: false })).toBeVisible();
      if (!["missing-codex", "unsupported-codex", "signed-out"].includes(scenario)) {
        await expect(window.getByTestId("diagnostic-reference")).toContainText("correlation_");
        await expect(window.getByRole("button", { name: "Try again" })).toBeVisible();
        await expect(window.getByRole("button", { name: "Choose another folder" })).toBeVisible();
        if (scenario === "stale-root") {
          const recoveryRoot = path.join(disposableData.sandboxRoot, "recovered-data-root");
          await mkdir(recoveryRoot, { mode: 0o700 });
          await application.evaluate(({ dialog }, selectedPath) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
          }, recoveryRoot);
          await window.getByRole("button", { name: "Choose another folder" }).click();
          await window.getByRole("button", { name: "Choose folder" }).click();
          await window.getByRole("checkbox").check();
          await window.getByRole("button", { name: "Confirm folder" }).click();
          await expect(
            window.getByRole("heading", { name: "A useful starting point" }),
          ).toBeVisible();
          await window
            .getByRole("textbox", { name: "Everyday-life goal in Germany" })
            .fill("Recover my German learning setup");
          await window.getByRole("button", { name: "Finish setup" }).click();
          await expect(window.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
        }
      } else {
        await expect(window.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      }
    } finally {
      await application.close();
    }
  }
});

test("completes the accessible local reading journey and reconstructs its History evidence", async ({
  disposableData,
}, testInfo) => {
  test.setTimeout(60_000);
  const application = await launchDesktop(disposableData, "reading", {}, { realDataRoot: true });
  try {
    const window = await application.firstWindow();
    await window.getByRole("button", { name: "Practice", exact: true }).click();
    await expect(window.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
    await window.getByRole("button", { name: "Prepare listening activity" }).click();
    await expect(
      window.getByText(/Exact Codex Voice session handoff is unavailable/u).first(),
    ).toBeVisible();
    await window.getByRole("button", { name: "Prepare speaking scenario" }).click();
    await expect(window.getByRole("button", { name: "Speaking scenario prepared" })).toBeVisible();
    await window.getByRole("button", { name: "Start reading practice" }).click();
    await expect(window.getByRole("heading", { name: "Reading material" })).toBeVisible();
    await expect(window.getByText("Source: Open Deutsch starter notice")).toBeVisible();
    await window.getByText("Show a progressive hint", { exact: true }).click();
    await expect(window.getByText(/First find the who/u)).toBeVisible();
    await window.getByText("Reveal translation", { exact: true }).click();
    await expect(window.getByText(/Die Arztpraxis bittet/u)).toBeVisible();
    for (const [size, viewport] of [
      ["standard", { width: 1280, height: 820 }],
      ["narrow", { width: 820, height: 760 }],
    ]) {
      await window.setViewportSize(viewport);
      const screenshot = testInfo.outputPath(`reading-en-${size}.png`);
      await window.screenshot({ path: screenshot, fullPage: true });
      expect((await stat(screenshot)).size).toBeGreaterThan(1_000);
    }
    await window.getByRole("combobox", { name: /Comprehension:/u }).selectOption("10");
    await window
      .getByRole("combobox", { name: /Vocabulary in context:/u })
      .selectOption("appointment");
    await window
      .getByRole("textbox", { name: "Summarize the notice in your own words" })
      .fill("The notice gives the appointment time and room.");
    await window.getByRole("combobox", { name: /Inference:/u }).selectOption("appointment");
    await window.getByRole("button", { name: "Save reading evidence" }).click();
    await expect(window.getByText("Reading evidence saved to History.")).toBeVisible();
    await expect(window.locator("audio, video")).toHaveCount(0);
    await window.getByRole("button", { name: "History", exact: true }).click();
    await expect(window.getByTestId("reading-detail")).toBeVisible();
    await expect(window.getByRole("heading", { name: "Reading material" })).toBeVisible();
    await expect(window.getByText("Difficult words: Termin")).toBeVisible();
    await expect(
      window.getByText(/Imported text was treated strictly as untrusted data/u),
    ).toBeVisible();
    await window.getByRole("button", { name: "Deutsch" }).click();
    await expect(window.locator("html")).toHaveAttribute("lang", "de");
    await expect(window.getByRole("heading", { name: "Lesematerial" })).toBeVisible();
    await window.setViewportSize({ width: 820, height: 760 });
    const germanScreenshot = testInfo.outputPath("reading-de-narrow.png");
    await window.screenshot({ path: germanScreenshot, fullPage: true });
    expect((await stat(germanScreenshot)).size).toBeGreaterThan(1_000);
  } finally {
    await application.close();
  }
});

test("accepts representative pages in both locales at standard and narrow widths", async ({
  disposableData,
}, testInfo) => {
  test.setTimeout(60_000);
  const application = await launchDesktop(
    disposableData,
    "page-acceptance",
    {},
    { realDataRoot: true },
  );
  try {
    const window = await application.firstWindow();
    const errors = collectWindowErrors(window);
    const pages = [
      ["Keep your German moving", 0],
      ["Practice", 1],
      ["Write in German", 2],
      ["Vocabulary", 3],
      ["History", 4],
      ["Progress without a score", 5],
      ["Weekly plan", 6],
      ["Settings and account", 7],
    ];
    const navigation = window.getByRole("navigation", { name: "Main navigation" });
    for (const [heading, position] of pages) {
      await navigation.getByRole("button").nth(position).click();
      await expect(window.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await window.setViewportSize({ width: 1280, height: 820 });
      const englishScreenshot = testInfo.outputPath(`page-${position}-en-standard.png`);
      await window.screenshot({ path: englishScreenshot, fullPage: true });
      expect((await stat(englishScreenshot)).size).toBeGreaterThan(1_000);
      expect(
        await window.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
        ),
      ).toBe(true);

      await window.getByRole("button", { name: "Deutsch" }).click();
      await expect(window.locator("html")).toHaveAttribute("lang", "de");
      await window.setViewportSize({ width: 820, height: 760 });
      const germanScreenshot = testInfo.outputPath(`page-${position}-de-narrow.png`);
      await window.screenshot({ path: germanScreenshot, fullPage: true });
      expect((await stat(germanScreenshot)).size).toBeGreaterThan(1_000);
      expect(
        await window.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
        ),
      ).toBe(true);
      await window.getByRole("button", { name: "English" }).click();
      await expect(window.locator("html")).toHaveAttribute("lang", "en");
    }
    expect(errors).toEqual([]);
  } finally {
    await application.close();
  }
});

test("confirms a disposable data folder and persists the first-AI disclosure", async ({
  disposableData,
}) => {
  const application = await launchDesktop(disposableData, "onboarding", {
    OPEN_DEUTSCH_DESKTOP_SCENARIO: "first-run",
  });
  const profile = path.join(disposableData.sandboxRoot, "profile-onboarding");
  try {
    await application.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
    }, disposableData.dataRoot);
    const window = await application.firstWindow();
    await window.getByRole("button", { name: "Choose folder" }).click();
    await expect(window.getByRole("heading", { name: "Local learning records" })).toBeVisible();
    await expect(window.getByRole("heading", { name: "OpenAI processing" })).toBeVisible();
    await window.getByRole("checkbox").check();
    await window.getByRole("button", { name: "Confirm folder" }).click();
    await expect(window.getByRole("heading", { name: "A useful starting point" })).toBeVisible();
    await window
      .getByRole("textbox", { name: "Everyday-life goal in Germany" })
      .fill("Handle appointments in German");
    await window.getByRole("button", { name: "Finish setup" }).click();
    await expect(window.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    const ai = window.getByRole("button", { name: "Try an AI writing check" });
    await ai.click();
    await expect(window.getByRole("dialog")).toBeVisible();
    await window.getByRole("button", { name: "Cancel" }).click();
    await ai.click();
    await window.getByRole("button", { name: "I understand, continue" }).click();
    await expect(window.getByRole("dialog")).toBeHidden();
  } finally {
    await application.close();
  }

  const restarted = await electron.launch({
    args: ["--ozone-platform=x11", `--user-data-dir=${profile}`, desktopEntry],
    cwd: process.cwd(),
    env: disposableData.environment({
      ...process.env,
      OPEN_DEUTSCH_TEST_CODEX_EXECUTABLE: fakeCodex,
    }),
  });
  try {
    const window = await restarted.firstWindow();
    const ai = window.getByRole("button", { name: "Try an AI writing check" });
    await expect(ai).toBeVisible();
    await ai.click();
    await expect(window.getByRole("dialog")).toHaveCount(0);
  } finally {
    await restarted.close();
  }
});

test("captures the development gallery in English and German at standard and narrow widths", async ({
  disposableData,
}, testInfo) => {
  const application = await launchDesktop(disposableData, "gallery", {
    OPEN_DEUTSCH_DESKTOP_GALLERY: "1",
  });
  try {
    const window = await application.firstWindow();
    const errors = collectWindowErrors(window);
    await window.context().tracing.start({ screenshots: true, snapshots: true });
    await expect(window.getByRole("heading", { name: "Component gallery" })).toBeVisible();

    for (const [locale, languageAction] of [
      ["en", "Deutsch"],
      ["de", "English"],
    ]) {
      for (const [size, viewport] of [
        ["standard", { width: 1280, height: 820 }],
        ["narrow", { width: 820, height: 760 }],
      ]) {
        await window.setViewportSize(viewport);
        expect(
          await window.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
          ),
        ).toBe(true);
        const screenshot = testInfo.outputPath(`gallery-${locale}-${size}.png`);
        await window.screenshot({ path: screenshot, fullPage: true });
        expect((await stat(screenshot)).size).toBeGreaterThan(1_000);
      }
      if (locale === "en") {
        await window.getByRole("button", { name: languageAction }).click();
        await expect(window.locator("html")).toHaveAttribute("lang", "de");
      }
    }
    await window.context().tracing.stop({ path: testInfo.outputPath("gallery-trace.zip") });
    expect(errors).toEqual([]);
  } finally {
    await application.close();
  }
});
