import { describe, expect, it } from "vitest";

import { createFixedClock } from "../../../tests/support/determinism.js";
import { systemClock, type Clock } from "../src/index.js";

describe("Clock", () => {
  it("accepts a shared deterministic clock without real-time waits", () => {
    const clock: Clock = createFixedClock("2026-08-15T08:30:00.000Z");
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe("2026-08-15T08:30:00.000Z");
  });

  it("provides a production clock without requiring a test delay", () => {
    expect(systemClock.now()).toBeInstanceOf(Date);
  });
});
