import { test as base, expect } from "@playwright/test";

import { createDisposableDataHarness } from "../../support/disposable-data.mjs";

export const test = base.extend({
  // Playwright requires an object-destructuring first parameter for fixture callbacks.
  // eslint-disable-next-line no-empty-pattern
  disposableData: async ({}, use) => {
    const harness = await createDisposableDataHarness();
    try {
      await use(harness);
    } finally {
      await harness.cleanup();
    }
  },
});

export { expect };
