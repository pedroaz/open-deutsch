import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

const desktopEntry = path.resolve("apps/desktop/dist/main/index.js");
const scenario = "Live check: return an online purchase";

function productionEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("OPEN_DEUTSCH_TEST_") || name.startsWith("OPEN_DEUTSCH_APPIMAGE_")) {
      delete environment[name];
    }
  }
  return environment;
}

test("user can configure, reopen, and delete a prepared speaking scenario", async () => {
  let application;
  let created = false;
  let cleaned = false;
  try {
    application = await electron.launch({
      args: ["--ozone-platform=x11", desktopEntry],
      cwd: process.cwd(),
      env: productionEnvironment(),
    });
    const window = await application.firstWindow({ timeout: 15_000 });
    const language = await window.locator("html").getAttribute("lang");
    const german = language === "de";
    await window
      .getByRole("heading", {
        level: 1,
        name: german ? "Bleib beim Deutschlernen in Bewegung" : "Keep your German moving",
        exact: true,
      })
      .waitFor({ timeout: 30_000 });
    const navigation = window.getByRole("navigation", {
      name: german ? "Hauptnavigation" : "Main navigation",
      exact: true,
    });
    await navigation
      .getByRole("list")
      .getByRole("button", { name: german ? "Üben" : "Practice", exact: true })
      .click();
    await window.getByRole("button", { name: german ? /Sprechen/u : /Speaking/u }).click();

    const initialSavedTitle = german ? "Gespeicherte Sprechszenarien" : "Saved speaking scenarios";
    const initialDelete = german ? "Löschen" : "Delete";
    const initialConfirm = german ? "Szenario löschen" : "Delete scenario";
    const initialSavedSection = window.getByRole("article").filter({
      has: window.getByRole("heading", { name: initialSavedTitle, exact: true }),
    });
    const existingScenario = initialSavedSection.getByRole("button", {
      name: new RegExp(scenario, "u"),
    });
    while ((await existingScenario.count()) > 0) {
      const before = await existingScenario.count();
      const existingCard = existingScenario.first().locator("..");
      await existingCard.getByRole("button", { name: initialDelete, exact: true }).click();
      await window
        .getByRole("dialog")
        .getByRole("button", { name: initialConfirm, exact: true })
        .click();
      await expect(existingScenario).toHaveCount(before - 1, { timeout: 15_000 });
    }

    await window
      .getByRole("textbox", { name: german ? "Szenario" : "Scenario", exact: true })
      .fill(scenario);
    await window
      .getByRole("combobox", { name: german ? "Zielniveau" : "Target level", exact: true })
      .selectOption("b1");
    await window
      .getByRole("combobox", {
        name: german ? "Schwierigkeitsgrad" : "Difficulty",
        exact: true,
      })
      .selectOption("advanced");
    await window
      .getByRole("combobox", {
        name: german ? "Korrekturzeitpunkt" : "Correction timing",
        exact: true,
      })
      .selectOption("end");
    await window
      .getByRole("textbox", { name: german ? /Sprechziele/u : /Speaking goals/u })
      .fill("Explain the problem clearly.\nAsk for a refund politely.");
    await window
      .getByRole("textbox", {
        name: german ? /Rollenspiel-Impulse/u : /Role-play prompts/u,
      })
      .fill("What went wrong with the order?\nWhat solution do you want?");
    await window
      .getByRole("button", {
        name: german ? "Szenario zum Sprechen vorbereiten" : "Prepare speaking scenario",
        exact: true,
      })
      .click();
    created = true;

    await expect(
      window.getByRole("heading", { name: scenario, exact: true }).first(),
    ).toBeVisible();
    const savedCard = window
      .locator("div")
      .filter({
        has: window.getByRole("button", { name: new RegExp(scenario, "u") }),
      })
      .last();
    await savedCard.getByRole("button", { name: new RegExp(scenario, "u") }).click();
    const preview = window.locator("section").filter({
      has: window.getByRole("heading", { name: scenario, exact: true }),
    });
    await expect(preview.getByText("B1 · Advanced · At the end", { exact: true })).toBeVisible();

    const languageButton = window.getByRole("button", {
      name: german ? "English" : "Deutsch",
      exact: true,
    });
    await languageButton.click();
    await expect(
      window.getByRole("heading", {
        name: german ? "Saved speaking scenarios" : "Gespeicherte Sprechszenarien",
        exact: true,
      }),
    ).toBeVisible();

    const translatedSavedTitle = german
      ? "Saved speaking scenarios"
      : "Gespeicherte Sprechszenarien";
    const translatedDelete = german ? "Delete" : "Löschen";
    const translatedConfirm = german ? "Delete scenario" : "Szenario löschen";
    const savedSection = window.getByRole("article").filter({
      has: window.getByRole("heading", { name: translatedSavedTitle, exact: true }),
    });
    const translatedScenarios = savedSection.getByRole("button", {
      name: new RegExp(scenario, "u"),
    });
    while ((await translatedScenarios.count()) > 0) {
      const before = await translatedScenarios.count();
      const translatedCard = translatedScenarios.first().locator("..");
      await translatedCard.getByRole("button", { name: translatedDelete, exact: true }).click();
      await window
        .getByRole("dialog")
        .getByRole("button", { name: translatedConfirm, exact: true })
        .click();
      await expect(translatedScenarios).toHaveCount(before - 1, { timeout: 15_000 });
    }
    cleaned = true;
  } catch (error) {
    const suffix = created && !cleaned ? ":MANUAL_CLEANUP_REQUIRED" : "";
    throw new Error(`LIVE_SPEAKING_SCENARIO_FAILED${suffix}`, { cause: error });
  } finally {
    await application?.close().catch(() => undefined);
  }
});
