import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/live",
  testMatch: ["practice-create.live.spec.mjs", "speaking-scenario.live.spec.mjs"],
  outputDir: "/tmp/open-deutsch-live-playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [["line"]],
  preserveOutput: "never",
  use: {
    actionTimeout: 15_000,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
});
