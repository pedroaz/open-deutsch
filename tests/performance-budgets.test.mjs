import test from "node:test";
import assert from "node:assert/strict";

import { performanceBudgets } from "../scripts/measure-performance.mjs";

test("performance budgets cover every required local workload", () => {
  assert.deepEqual(Object.keys(performanceBudgets).sort(), [
    "coldStartMs",
    "correctionFirstEventMs",
    "dashboardLoadMs",
    "largeHistoryQueryMs",
    "mcpStartupMs",
    "memoryMiB",
    "srsSessionCreationMs",
  ]);
  for (const value of Object.values(performanceBudgets))
    assert.ok(Number.isFinite(value) && value > 0);
});
