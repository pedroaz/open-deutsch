import { describe, expect, it } from "vitest";

import { createFixedClock, createSequenceIdFactory } from "../support/determinism.js";

describe("shared deterministic test support", () => {
  it("returns fresh Date objects for a fixed instant", () => {
    const clock = createFixedClock("2026-08-15T12:00:00.000Z");
    expect(clock.now()).not.toBe(clock.now());
    expect(clock.now().toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });

  it("rejects invalid fixed instants", () => {
    expect(() => createFixedClock("not-an-instant")).toThrow(/valid fixed instant/);
  });

  it("creates isolated predictable identifier sequences", () => {
    const first = createSequenceIdFactory();
    const second = createSequenceIdFactory(7);
    expect([first.next("attempt"), first.next("attempt"), second.next("review")]).toEqual([
      "attempt-0001",
      "attempt-0002",
      "review-0007",
    ]);
  });

  it("rejects unsafe sequence inputs and prefixes", () => {
    expect(() => createSequenceIdFactory(-1)).toThrow(/non-negative safe integer/);
    expect(() => createSequenceIdFactory(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /non-negative safe integer/,
    );
    expect(() => createSequenceIdFactory().next("Attempt ID")).toThrow(/lowercase kebab-case/);
  });
});
