import { describe, expect, expectTypeOf, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  calendarDateSchema,
  dataRootGenerationSchema,
  durationMillisecondsSchema,
  identifierPrefixes,
  identifierSchemas,
  utcInstantSchema,
  type ActivityId,
  type LearnerId,
} from "../src/index.js";

describe("common identifiers", () => {
  it("covers every required identifier family with a distinct prefix", () => {
    expect(Object.keys(identifierSchemas)).toEqual(Object.keys(identifierPrefixes));
    expect(new Set(Object.values(identifierPrefixes)).size).toBe(17);
    const factory = createDeterministicContractFactory();
    for (const kind of Object.keys(identifierSchemas) as (keyof typeof identifierSchemas)[]) {
      const identifier = factory.nextId(kind);
      expect(identifierSchemas[kind].safeParse(identifier).success).toBe(true);
      for (const otherKind of Object.keys(
        identifierSchemas,
      ) as (keyof typeof identifierSchemas)[]) {
        if (otherKind !== kind) {
          expect(identifierSchemas[otherKind].safeParse(identifier).success).toBe(false);
        }
      }
    }
  });

  it("rejects cross-entity identifiers", () => {
    const factory = createDeterministicContractFactory();
    const learnerId = factory.nextId("learner");
    expect(identifierSchemas.learner.safeParse(learnerId).success).toBe(true);
    expect(identifierSchemas.activity.safeParse(learnerId).success).toBe(false);
    expectTypeOf(learnerId).toEqualTypeOf<LearnerId>();
    expectTypeOf(factory.nextId("activity")).toEqualTypeOf<ActivityId>();
  });

  it("rejects malformed, uppercase, short, and overlong identifiers", () => {
    for (const value of [
      "learner_123",
      "Learner_0000000000000001",
      `learner_${"a".repeat(65)}`,
      "learner_000000000000000!",
    ]) {
      expect(identifierSchemas.learner.safeParse(value).success).toBe(false);
    }
  });

  it("produces repeatable ordered fixture identifiers", () => {
    const first = createDeterministicContractFactory(35);
    const second = createDeterministicContractFactory(35);
    expect([first.nextId("run"), first.nextId("session")]).toEqual([
      second.nextId("run"),
      second.nextId("session"),
    ]);
    const exhausted = createDeterministicContractFactory(Number.MAX_SAFE_INTEGER);
    expect(() => exhausted.nextId("run")).not.toThrow();
    expect(() => exhausted.nextId("run")).toThrow("sequence is exhausted");
  });
});

describe("common time and generation values", () => {
  it("requires canonical millisecond UTC instants and calendar dates", () => {
    expect(utcInstantSchema.parse("2026-08-15T12:30:45.123Z")).toBe("2026-08-15T12:30:45.123Z");
    for (const value of [
      "2026-08-15T12:30:45Z",
      "2026-08-15T14:30:45.123+02:00",
      "2026-08-15 12:30:45.123Z",
    ]) {
      expect(utcInstantSchema.safeParse(value).success).toBe(false);
    }
    expect(calendarDateSchema.parse("2026-08-15")).toBe("2026-08-15");
    expect(calendarDateSchema.safeParse("2026-02-30").success).toBe(false);
  });

  it("bounds data-root generations and durations to safe integers", () => {
    expect(dataRootGenerationSchema.parse(1)).toBe(1);
    expect(dataRootGenerationSchema.safeParse(0).success).toBe(false);
    expect(dataRootGenerationSchema.safeParse(1.5).success).toBe(false);
    expect(durationMillisecondsSchema.parse(0)).toBe(0);
    expect(durationMillisecondsSchema.safeParse(-1).success).toBe(false);
    expect(durationMillisecondsSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });

  it("produces deterministic monotonically increasing UTC fixture instants", () => {
    const factory = createDeterministicContractFactory(1, "2026-08-15T08:30:00.000Z");
    expect([factory.nextInstant(), factory.nextInstant()]).toEqual([
      "2026-08-15T08:30:00.000Z",
      "2026-08-15T08:30:01.000Z",
    ]);
    for (const noncanonical of [
      "2026-08-15",
      "2026-08-15T08:30:00",
      "2026-08-15T08:30:00Z",
      "2026-08-15T10:30:00.000+02:00",
    ]) {
      expect(() => createDeterministicContractFactory(1, noncanonical)).toThrow();
    }
  });
});
