import { _electron as electron, test } from "@playwright/test";
import path from "node:path";

const desktopEntry = path.resolve("apps/desktop/dist/main/index.js");
const lessonRequest =
  "Create a short A2 German lesson about arranging a doctor's appointment. Include a clear explanation, two vocabulary foundations with examples, hints, guided practice, and at least one exercise.";

const labels = {
  en: {
    dashboard: "Keep your German moving",
    dashboardNav: "Dashboard",
    prepared: "Prepared activities",
    openActivity: "Open activity",
    vocabulary: "Vocabulary",
    candidates: "Candidates",
    confirmVocabulary: "Add to active review",
    practice: "Practice",
    customRequest: "What would you like to practise?",
    createLesson: "Create lesson",
    acknowledge: "I understand, continue",
    ready: "Practice set ready",
    deleteLesson: "Delete prepared lesson",
    settings: "Settings/Account",
    settingsHeading: "Settings and account",
    generationWorkload: "Exercise and lesson generation",
    model: "Model",
    effort: "Reasoning effort",
    saveSettings: "Save settings",
    settingsSaved: "Settings saved locally.",
    refreshDashboard: "Refresh dashboard",
    refreshVocabulary: "Refresh vocabulary",
  },
  de: {
    dashboard: "Bleib beim Deutschlernen in Bewegung",
    dashboardNav: "Übersicht",
    prepared: "Vorbereitete Aktivitäten",
    openActivity: "Aktivität öffnen",
    vocabulary: "Wortschatz",
    candidates: "Kandidaten",
    confirmVocabulary: "Aktive Wiederholung beginnen",
    practice: "Üben",
    customRequest: "Was möchtest du üben?",
    createLesson: "Lektion erstellen",
    acknowledge: "Verstanden, weiter",
    ready: "Übungsset bereit",
    deleteLesson: "Vorbereitete Lektion löschen",
    settings: "Einstellungen/Konto",
    settingsHeading: "Einstellungen und Konto",
    generationWorkload: "Übungs- und Lektionserstellung",
    model: "Modell",
    effort: "Denkaufwand",
    saveSettings: "Einstellungen speichern",
    settingsSaved: "Einstellungen lokal gespeichert.",
    refreshDashboard: "Übersicht aktualisieren",
    refreshVocabulary: "Wortschatz aktualisieren",
  },
};

function liveFailure(code) {
  return new Error(code);
}

async function liveAction(code, action) {
  try {
    return await action();
  } catch {
    throw liveFailure(code);
  }
}

async function waitForCount(locator, expected, code, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.count()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw liveFailure(code);
}

async function refreshSnapshot(window, buttonName, code) {
  const button = window.getByRole("button", { name: buttonName, exact: true });
  await liveAction(code, () => button.click());
  const busyRegion = window.locator('main [aria-busy="true"]').first();
  await busyRegion.waitFor({ timeout: 5_000 }).catch(() => undefined);
  await liveAction(code, () =>
    window.locator('main [aria-busy="false"]').first().waitFor({ timeout: 15_000 }),
  );
}

function productionEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (
      name.startsWith("OPEN_DEUTSCH_TEST_") ||
      name.startsWith("OPEN_DEUTSCH_APPIMAGE_") ||
      name === "OPEN_DEUTSCH_DATA_ROOT" ||
      name === "OPEN_DEUTSCH_BOOTSTRAP_FILE" ||
      name === "OPEN_DEUTSCH_RENDERER_URL" ||
      name === "OPEN_DEUTSCH_RUNTIME_DIR"
    ) {
      delete environment[name];
    }
  }
  return environment;
}

test("user can create, open, and remove a live custom Practice", async () => {
  let application;
  let window;
  let text;
  let created = false;
  let cleaned = false;
  let settingsChanged = false;
  let originalModel;
  let originalEffort;
  let phase = "LIVE_PRACTICE_INTERACTION_FAILED";

  const openGenerationSettings = async () => {
    await window.getByRole("button", { name: text.settings, exact: true }).click();
    await window.getByRole("heading", { name: text.settingsHeading, exact: true }).waitFor();
    const group = window.getByRole("group", { name: text.generationWorkload, exact: true });
    await group.waitFor({ timeout: 30_000 });
    return group;
  };

  const restoreGenerationSettings = async () => {
    if (!settingsChanged || !originalModel || !originalEffort || !window || !text) return true;
    try {
      const group = await openGenerationSettings();
      await group.locator("select").nth(0).selectOption(originalModel);
      await group.locator("select").nth(1).selectOption(originalEffort);
      await window.getByRole("button", { name: text.saveSettings, exact: true }).click();
      await window.getByText(text.settingsSaved, { exact: true }).waitFor();
      settingsChanged = false;
      return true;
    } catch {
      return false;
    }
  };

  try {
    application = await liveAction("LIVE_PRACTICE_LAUNCH_FAILED", () =>
      electron.launch({
        args: ["--ozone-platform=x11", desktopEntry],
        cwd: process.cwd(),
        env: productionEnvironment(),
      }),
    );
    window = await liveAction("LIVE_PRACTICE_WINDOW_UNAVAILABLE", () =>
      application.firstWindow({ timeout: 15_000 }),
    );
    const language = await liveAction("LIVE_PRACTICE_LOCALE_UNAVAILABLE", () =>
      window.locator("html").getAttribute("lang"),
    );
    text = labels[language === "de" ? "de" : "en"];
    await liveAction("LIVE_PRACTICE_DASHBOARD_UNAVAILABLE", () =>
      window.getByRole("heading", { name: text.dashboard }).waitFor(),
    );

    const generationSettings = await liveAction("LIVE_PRACTICE_SETTINGS_UNAVAILABLE", () =>
      openGenerationSettings(),
    );
    phase = "LIVE_PRACTICE_SETTINGS_VALUES_FAILED";
    const modelSelect = generationSettings.locator("select").nth(0);
    const effortSelect = generationSettings.locator("select").nth(1);
    originalModel = await modelSelect.inputValue();
    originalEffort = await effortSelect.inputValue();
    const lunaOption = modelSelect.locator("option").filter({ hasText: /luna/iu }).first();
    await liveAction("LIVE_PRACTICE_LUNA_UNAVAILABLE", () =>
      lunaOption.waitFor({ state: "attached", timeout: 15_000 }),
    );
    const lunaValue = await lunaOption.getAttribute("value");
    if (!lunaValue) throw liveFailure("LIVE_PRACTICE_LUNA_UNAVAILABLE");
    phase = "LIVE_PRACTICE_LUNA_SELECTION_FAILED";
    await modelSelect.selectOption(lunaValue);
    await liveAction("LIVE_PRACTICE_MEDIUM_EFFORT_UNAVAILABLE", () =>
      effortSelect.locator('option[value="exact:medium"]').waitFor({ state: "attached" }),
    );
    phase = "LIVE_PRACTICE_MEDIUM_EFFORT_SELECTION_FAILED";
    await effortSelect.selectOption("exact:medium");
    if (originalModel !== lunaValue || originalEffort !== "exact:medium") {
      phase = "LIVE_PRACTICE_SETTINGS_SAVE_FAILED";
      await window.getByRole("button", { name: text.saveSettings, exact: true }).click();
      await window.getByText(text.settingsSaved, { exact: true }).waitFor();
      settingsChanged = true;
    }

    phase = "LIVE_PRACTICE_DASHBOARD_NAVIGATION_FAILED";
    await window.getByRole("button", { name: text.dashboardNav, exact: true }).click();
    await window.getByRole("heading", { name: text.dashboard }).waitFor();

    phase = "LIVE_PRACTICE_INITIAL_COUNTS_FAILED";
    await refreshSnapshot(window, text.refreshDashboard, "LIVE_PRACTICE_DASHBOARD_REFRESH_FAILED");
    const preparedCard = window
      .getByRole("article")
      .filter({ has: window.getByRole("heading", { name: text.prepared }) });
    const openActivityButtons = preparedCard.getByRole("button", { name: text.openActivity });
    const preparedBefore = await openActivityButtons.count();

    await liveAction("LIVE_PRACTICE_VOCABULARY_NAVIGATION_FAILED", () =>
      window.getByRole("button", { name: text.vocabulary, exact: true }).click(),
    );
    await liveAction("LIVE_PRACTICE_VOCABULARY_UNAVAILABLE", () =>
      window.getByRole("heading", { name: text.vocabulary, exact: true }).waitFor(),
    );
    await refreshSnapshot(
      window,
      text.refreshVocabulary,
      "LIVE_PRACTICE_VOCABULARY_REFRESH_FAILED",
    );
    phase = "LIVE_PRACTICE_CANDIDATE_COUNT_FAILED";
    await window.getByRole("button", { name: text.candidates, exact: true }).click();
    const vocabularyBefore = await window
      .getByRole("button", { name: text.confirmVocabulary, exact: true })
      .count();

    phase = "LIVE_PRACTICE_PRACTICE_NAVIGATION_FAILED";
    await window.getByRole("button", { name: text.practice, exact: true }).click();
    await window.getByRole("heading", { name: text.practice, exact: true }).waitFor();
    phase = "LIVE_PRACTICE_SUBMISSION_FAILED";
    await window.getByRole("textbox", { name: text.customRequest }).fill(lessonRequest);
    await window.getByRole("button", { name: text.createLesson, exact: true }).click();

    phase = "LIVE_PRACTICE_DISCLOSURE_FAILED";
    const acknowledgement = window.getByRole("button", { name: text.acknowledge, exact: true });
    const disclosureVisible = await acknowledgement
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (disclosureVisible) {
      await acknowledgement.click();
      await acknowledgement.waitFor({ state: "hidden" });
      await window.getByRole("button", { name: text.createLesson, exact: true }).click();
    }

    phase = "LIVE_PRACTICE_GENERATION_FAILED";
    await liveAction("LIVE_PRACTICE_GENERATION_FAILED", () =>
      window.getByRole("heading", { name: text.dashboard }).waitFor({ timeout: 90_000 }),
    );
    created = true;
    await refreshSnapshot(window, text.refreshDashboard, "LIVE_PRACTICE_DASHBOARD_REFRESH_FAILED");
    await waitForCount(
      openActivityButtons,
      preparedBefore + 1,
      "LIVE_PRACTICE_ACTIVITY_NOT_CREATED",
      30_000,
    );
    await liveAction("LIVE_PRACTICE_ACTIVITY_OPEN_FAILED", () =>
      openActivityButtons.first().click(),
    );
    await liveAction("LIVE_PRACTICE_EXERCISES_NOT_RENDERED", () =>
      window.getByRole("heading", { name: text.ready }).waitFor(),
    );
    phase = "LIVE_PRACTICE_LESSON_RENDER_CHECK_FAILED";
    const renderedCards = await window.locator("main article").count();
    if (renderedCards < 2) throw liveFailure("LIVE_PRACTICE_LESSON_NOT_RENDERED");
    const lessonHeading = await window.locator("main article").first().locator("h2").textContent();
    if (!lessonHeading?.trim()) throw liveFailure("LIVE_PRACTICE_LESSON_EMPTY");

    phase = "LIVE_PRACTICE_DELETE_TRIGGER_FAILED";
    await window.getByRole("button", { name: text.deleteLesson, exact: true }).click();
    const deleteDialog = window.getByRole("dialog");
    await liveAction("LIVE_PRACTICE_DELETE_DIALOG_UNAVAILABLE", () => deleteDialog.waitFor());
    phase = "LIVE_PRACTICE_DELETE_CONFIRM_FAILED";
    await deleteDialog.getByRole("button", { name: text.deleteLesson, exact: true }).click();
    await liveAction("LIVE_PRACTICE_DELETE_FAILED", () =>
      window.getByRole("heading", { name: text.dashboard }).waitFor(),
    );
    await refreshSnapshot(window, text.refreshDashboard, "LIVE_PRACTICE_DASHBOARD_REFRESH_FAILED");
    await waitForCount(openActivityButtons, preparedBefore, "LIVE_PRACTICE_ACTIVITY_RETAINED");

    phase = "LIVE_PRACTICE_CLEANUP_COUNT_FAILED";
    await window.getByRole("button", { name: text.vocabulary, exact: true }).click();
    await window.getByRole("heading", { name: text.vocabulary, exact: true }).waitFor();
    await refreshSnapshot(
      window,
      text.refreshVocabulary,
      "LIVE_PRACTICE_VOCABULARY_REFRESH_FAILED",
    );
    await window.getByRole("button", { name: text.candidates, exact: true }).click();
    await waitForCount(
      window.getByRole("button", { name: text.confirmVocabulary, exact: true }),
      vocabularyBefore,
      "LIVE_PRACTICE_VOCABULARY_RETAINED",
    );
    cleaned = true;
    phase = "LIVE_PRACTICE_SETTINGS_RESTORE_FAILED";
    if (!(await restoreGenerationSettings())) {
      throw liveFailure("LIVE_PRACTICE_SETTINGS_RESTORE_FAILED");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /^LIVE_PRACTICE_[A-Z0-9_]+$/u.test(message) ? message : phase;
    const settingsRestored = await restoreGenerationSettings();
    const suffixes = [
      ...(created && !cleaned ? ["MANUAL_CLEANUP_REQUIRED"] : []),
      ...(!settingsRestored ? ["SETTINGS_RESTORE_REQUIRED"] : []),
    ];
    throw liveFailure([code, ...suffixes].join(":"));
  } finally {
    await application?.close().catch(() => undefined);
  }
});
