import { _electron as electron, test } from "@playwright/test";
import path from "node:path";

const desktopEntry = path.resolve("apps/desktop/dist/main/index.js");
const lessonRequest =
  "Create an A2 German quiz about ordering food in a restaurant, with hints and varied question formats.";

const labels = {
  en: {
    dashboard: "Keep your German moving",
    mainNavigation: "Main navigation",
    openActivity: /^Open .+/u,
    vocabulary: "Vocabulary",
    candidates: "Candidates",
    confirmVocabulary: "Add to active review",
    practice: "Practice",
    customRequest: "What would you like to practise?",
    quizLength: "3 exercises",
    createQuiz: "Create quiz",
    acknowledge: "I understand, continue",
    ready: "Practice set ready",
    deleteTrigger: "Delete",
    deleteConfirm: "Delete quiz",
    library: "Your generated exercises",
    refreshVocabulary: "Refresh vocabulary",
  },
  de: {
    dashboard: "Bleib beim Deutschlernen in Bewegung",
    mainNavigation: "Hauptnavigation",
    openActivity: /.+ öffnen$/u,
    vocabulary: "Wortschatz",
    candidates: "Kandidaten",
    confirmVocabulary: "Aktive Wiederholung beginnen",
    practice: "Üben",
    customRequest: "Was möchtest du üben?",
    quizLength: "3 Übungen",
    createQuiz: "Quiz erstellen",
    acknowledge: "Verstanden, weiter",
    ready: "Übungsset bereit",
    deleteTrigger: "Löschen",
    deleteConfirm: "Quiz löschen",
    library: "Deine erstellten Übungen",
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
  let phase = "LIVE_PRACTICE_INTERACTION_FAILED";

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
      window.getByRole("heading", { level: 1, name: text.dashboard }).waitFor(),
    );
    const navigation = window.getByRole("navigation", {
      name: text.mainNavigation,
      exact: true,
    });
    const navigationList = navigation.getByRole("list");

    await liveAction("LIVE_PRACTICE_VOCABULARY_NAVIGATION_FAILED", () =>
      navigationList.getByRole("button", { name: text.vocabulary, exact: true }).click(),
    );
    await liveAction("LIVE_PRACTICE_VOCABULARY_UNAVAILABLE", () =>
      window.getByRole("heading", { level: 1, name: text.vocabulary, exact: true }).waitFor(),
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
    await liveAction("LIVE_PRACTICE_NAVIGATION_CLICK_FAILED", () =>
      navigationList.getByRole("button", { name: text.practice, exact: true }).click(),
    );
    await liveAction("LIVE_PRACTICE_PAGE_UNAVAILABLE", () =>
      window
        .getByRole("heading", { level: 1, name: text.practice, exact: true })
        .waitFor(),
    );
    const library = window
      .locator('main section[aria-busy]')
      .filter({ has: window.getByRole("heading", { name: text.library, exact: true }) });
    await liveAction("LIVE_PRACTICE_LIBRARY_UNAVAILABLE", async () => {
      await library.waitFor({ timeout: 30_000 });
      const deadline = Date.now() + 30_000;
      while ((await library.getAttribute("aria-busy")) !== "false") {
        if (Date.now() >= deadline) {
          throw liveFailure("LIVE_PRACTICE_LIBRARY_UNAVAILABLE");
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });
    const openActivityButtons = library.getByRole("button", { name: text.openActivity });
    const preparedBefore = await openActivityButtons.count();
    phase = "LIVE_PRACTICE_SUBMISSION_FAILED";
    await window.getByRole("textbox", { name: text.customRequest }).fill(lessonRequest);
    await window.getByRole("button", { name: text.quizLength, exact: true }).click();
    await window.getByRole("button", { name: text.createQuiz, exact: true }).click();

    phase = "LIVE_PRACTICE_DISCLOSURE_FAILED";
    const acknowledgement = window.getByRole("button", { name: text.acknowledge, exact: true });
    const disclosureVisible = await acknowledgement
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (disclosureVisible) {
      await acknowledgement.click();
      await acknowledgement.waitFor({ state: "hidden" });
      await window.getByRole("button", { name: text.createQuiz, exact: true }).click();
    }

    phase = "LIVE_PRACTICE_GENERATION_FAILED";
    await liveAction("LIVE_PRACTICE_GENERATION_FAILED", () =>
      window.getByRole("heading", { name: text.ready }).waitFor({ timeout: 90_000 }),
    );
    created = true;

    phase = "LIVE_PRACTICE_DELETE_TRIGGER_FAILED";
    await window.getByRole("button", { name: text.deleteTrigger, exact: true }).click();
    const deleteDialog = window.getByRole("dialog");
    await liveAction("LIVE_PRACTICE_DELETE_DIALOG_UNAVAILABLE", () => deleteDialog.waitFor());
    phase = "LIVE_PRACTICE_DELETE_CONFIRM_FAILED";
    await deleteDialog.getByRole("button", { name: text.deleteConfirm, exact: true }).click();
    await liveAction("LIVE_PRACTICE_DELETE_FAILED", () =>
      window
        .getByRole("heading", { level: 1, name: text.practice, exact: true })
        .waitFor(),
    );
    await waitForCount(openActivityButtons, preparedBefore, "LIVE_PRACTICE_ACTIVITY_RETAINED");

    phase = "LIVE_PRACTICE_CLEANUP_COUNT_FAILED";
    await navigationList.getByRole("button", { name: text.vocabulary, exact: true }).click();
    await window
      .getByRole("heading", { level: 1, name: text.vocabulary, exact: true })
      .waitFor();
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /^LIVE_PRACTICE_[A-Z0-9_]+$/u.test(message) ? message : phase;
    const suffixes = created && !cleaned ? ["MANUAL_CLEANUP_REQUIRED"] : [];
    throw liveFailure([code, ...suffixes].join(":"));
  } finally {
    await application?.close().catch(() => undefined);
  }
});
