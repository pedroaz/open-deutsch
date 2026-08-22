import {
  calendarDateSchema,
  toBoundaryJsonSchema,
  utcInstantSchema,
} from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  vocabularyEntrySchema,
  vocabularyReviewGrades,
  vocabularyReviewSchema,
  scheduleVocabularyReview,
  vocabularyEntryFromCandidate,
} from "../src/index.js";

function candidateFixture() {
  const f = createDeterministicContractFactory();
  return {
    schemaVersion: 1,
    vocabularyId: f.nextId("vocabulary"),
    lemma: "der Markt",
    meaning: "market",
    lexeme: {
      partOfSpeech: "noun",
      nounForm: { gender: "masculine", article: "der" },
      plural: { status: "form", form: "die Märkte" },
    },
    examples: [{ german: "Ich gehe zum Markt.", meaning: "I am going to the market." }],
    source: {
      kind: "correction",
      correctionId: f.nextId("correction"),
      attemptId: f.nextId("attempt"),
      context: "zum Markt",
    },
    state: { status: "candidate", confirmation: "required" },
  } as const;
}

describe("vocabulary and SRS contracts", () => {
  it("turns bounded candidate metadata into an explicit confirmation candidate", () => {
    const f = createDeterministicContractFactory();
    const entry = vocabularyEntryFromCandidate({
      vocabularyId: f.nextId("vocabulary"),
      candidate: {
        lemma: "der Markt",
        meaning: "market",
        article: "der",
        plural: "die Märkte",
        example: "Ich gehe zum Markt.",
        sourceContext: "zum Markt",
        origin: "correction",
      },
      source: {
        kind: "learner",
        context: "zum Markt",
      },
    });
    expect(entry.state).toEqual({ status: "candidate", confirmation: "required" });
    expect(entry.lexeme).toEqual({
      partOfSpeech: "noun",
      nounForm: { gender: "masculine", article: "der" },
      plural: { status: "form", form: "die Märkte" },
    });
  });
  it("stores noun article, gender, plural, examples, and source context", () => {
    const entry = vocabularyEntrySchema.parse(candidateFixture());
    expect(entry.lexeme).toEqual({
      partOfSpeech: "noun",
      nounForm: { gender: "masculine", article: "der" },
      plural: { status: "form", form: "die Märkte" },
    });
    expect(entry.source.kind).toBe("correction");
    expect(entry.examples).toHaveLength(1);
  });

  it("correlates German noun gender and article structurally", () => {
    const fixture = candidateFixture();
    expect(
      vocabularyEntrySchema.safeParse({
        ...fixture,
        lexeme: {
          ...fixture.lexeme,
          nounForm: { gender: "feminine", article: "der" },
        },
      }).success,
    ).toBe(false);
    expect(
      vocabularyEntrySchema.safeParse({
        ...fixture,
        lexeme: { partOfSpeech: "verb", nounForm: fixture.lexeme.nounForm },
      }).success,
    ).toBe(false);
  });

  it("requires explicit confirmation and excludes scheduling from candidates", () => {
    const fixture = candidateFixture();
    expect(
      vocabularyEntrySchema.safeParse({
        ...fixture,
        state: {
          ...fixture.state,
          schedule: { status: "new", dueOn: "2026-08-15", stage: 1 },
        },
      }).success,
    ).toBe(false);
    expect(
      vocabularyEntrySchema.safeParse({
        ...fixture,
        state: { status: "candidate", confirmation: "accepted" },
      }).success,
    ).toBe(false);
  });

  it("models active and suspended cards without losing their schedule", () => {
    const fixture = candidateFixture();
    const active = vocabularyEntrySchema.parse({
      ...fixture,
      state: {
        status: "active",
        confirmedAt: "2026-08-15T09:00:00.000Z",
        schedule: { status: "new", dueOn: "2026-08-15", stage: 1 },
      },
    });
    const suspended = vocabularyEntrySchema.parse({
      ...fixture,
      state: {
        status: "suspended",
        confirmedAt: "2026-08-15T09:00:00.000Z",
        schedule: active.state.status === "active" ? active.state.schedule : undefined,
        suspendedAt: "2026-08-15T10:00:00.000Z",
        reason: "learner-paused",
      },
    });
    expect(suspended.state.status).toBe("suspended");
    if (suspended.state.status === "suspended") {
      expect(suspended.state.schedule).toEqual({
        status: "new",
        dueOn: "2026-08-15",
        stage: 1,
      });
    }
  });

  it("rejects active schedules and suspension events before confirmation", () => {
    const fixture = candidateFixture();
    expect(
      vocabularyEntrySchema.safeParse({
        ...fixture,
        state: {
          status: "active",
          confirmedAt: "2026-08-15T09:00:00.000Z",
          schedule: { status: "new", dueOn: "2026-08-14", stage: 1 },
        },
      }).success,
    ).toBe(false);
    expect(
      vocabularyEntrySchema.safeParse({
        ...fixture,
        state: {
          status: "suspended",
          confirmedAt: "2026-08-15T09:00:00.000Z",
          schedule: { status: "new", dueOn: "2026-08-15", stage: 1 },
          suspendedAt: "2026-08-15T08:59:59.000Z",
          reason: "learner-paused",
        },
      }).success,
    ).toBe(false);
  });

  it("records bounded review grades and resulting scheduling metadata", () => {
    const f = createDeterministicContractFactory(20);
    expect(vocabularyReviewGrades).toEqual(["again", "hard", "good", "easy"]);
    const review = vocabularyReviewSchema.parse({
      schemaVersion: 1,
      vocabularyId: f.nextId("vocabulary"),
      transition: {
        expectedActiveState: {
          status: "active",
          confirmedAt: "2026-08-15T09:00:00.000Z",
          schedule: { status: "new", dueOn: "2026-08-15", stage: 1 },
        },
        result: {
          reviewId: f.nextId("review"),
          reviewedAt: "2026-08-15T10:00:00.000Z",
          grade: "good",
          nextSchedule: {
            dueOn: "2026-08-19",
            stage: 3,
          },
        },
      },
    });
    expect(review.transition.result.nextSchedule).toEqual({ dueOn: "2026-08-19", stage: 3 });
  });

  it("schedules every grade deterministically from an injected review instant", () => {
    const f = createDeterministicContractFactory(30);
    const expectedActiveState = {
      status: "active" as const,
      confirmedAt: utcInstantSchema.parse("2026-08-15T09:00:00.000Z"),
      schedule: {
        status: "new" as const,
        dueOn: calendarDateSchema.parse("2026-08-15"),
        stage: 1 as const,
      },
    };
    const outcomes = vocabularyReviewGrades.map(
      (grade) =>
        scheduleVocabularyReview({
          vocabularyId: f.nextId("vocabulary"),
          expectedActiveState,
          reviewId: f.nextId("review"),
          reviewedAt: "2026-08-20T10:00:00.000Z",
          grade,
        }).transition.result,
    );
    expect(outcomes.map(({ grade, nextSchedule }) => ({ grade, ...nextSchedule }))).toEqual([
      { grade: "again", dueOn: "2026-08-21", stage: 1 },
      { grade: "hard", dueOn: "2026-08-21", stage: 1 },
      { grade: "good", dueOn: "2026-08-23", stage: 2 },
      { grade: "easy", dueOn: "2026-08-27", stage: 3 },
    ]);
  });

  it("rejects a due date before the last review", () => {
    const f = createDeterministicContractFactory(40);
    expect(
      vocabularyReviewSchema.safeParse({
        schemaVersion: 1,
        vocabularyId: f.nextId("vocabulary"),
        transition: {
          expectedActiveState: {
            status: "active",
            confirmedAt: "2026-08-15T09:00:00.000Z",
            schedule: { status: "new", dueOn: "2026-08-15", stage: 1 },
          },
          result: {
            reviewId: f.nextId("review"),
            reviewedAt: "2026-08-15T10:00:00.000Z",
            grade: "again",
            nextSchedule: {
              dueOn: "2026-08-14",
              stage: 1,
            },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects review transitions from candidate or suspended cards", () => {
    const f = createDeterministicContractFactory(60);
    const result = {
      reviewId: f.nextId("review"),
      reviewedAt: "2026-08-15T10:00:00.000Z",
      grade: "good",
      nextSchedule: { dueOn: "2026-08-16", stage: 2 },
    } as const;
    for (const expectedActiveState of [
      { status: "candidate", confirmation: "required" },
      {
        status: "suspended",
        confirmedAt: "2026-08-15T09:00:00.000Z",
        schedule: { status: "new", dueOn: "2026-08-15", stage: 1 },
        suspendedAt: "2026-08-15T09:30:00.000Z",
        reason: "learner-paused",
      },
    ]) {
      expect(
        vocabularyReviewSchema.safeParse({
          schemaVersion: 1,
          vocabularyId: f.nextId("vocabulary"),
          transition: { expectedActiveState, result },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects cross-entity IDs, empty examples, oversized context, and unknown fields", () => {
    const fixture = candidateFixture();
    for (const candidate of [
      { ...fixture, vocabularyId: fixture.source.attemptId },
      { ...fixture, examples: [] },
      { ...fixture, source: { ...fixture.source, context: "x".repeat(501) } },
      { ...fixture, rawModelRationale: "private chain of thought" },
    ]) {
      expect(vocabularyEntrySchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("projects the closed structural boundary to Draft 2020-12", () => {
    const schema = toBoundaryJsonSchema(vocabularyEntrySchema) as Record<string, unknown>;
    const reviewSchema = toBoundaryJsonSchema(vocabularyReviewSchema) as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["additionalProperties"]).toBe(false);
    expect(reviewSchema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(reviewSchema["additionalProperties"]).toBe(false);
  });
});
