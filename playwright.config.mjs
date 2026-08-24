import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "playwright-electron-compatibility.spec.mjs",
    "playwright-sqlite-concurrency.spec.mjs",
    "playwright-desktop-foundation.spec.mjs",
  ],
  outputDir: "test-results/electron",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["line"]],
  use: {
    screenshot: "off",
    trace: "off",
  },
});
