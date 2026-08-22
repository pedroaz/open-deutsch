import { toBoundaryJsonSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  deleteMistakeCommandSchema,
  effectiveMistakeCategory,
  mistakeOccurrences,
  mistakeRecurrenceSchema,
  mistakeSchema,
} from "../src/index.js";

function occurrenceFixture(position = 1) {
  const f = createDeterministicContractFactory();
  return {
    correctionId: f.nextId("correction"),
    attemptId: f.nextId("attempt"),
    alignmentSegmentPosition: position,
    observedOn: "2026-08-15",
    evidence: {
      beforeContext: "Ich ",
      evidenceText: "gehen",
      afterContext: " heute.",
    },
    explanation: "The first-person singular form ends in -e.",
  } as const;
}

function mistakeFixture() {
  const f = createDeterministicContractFactory();
  return {
    schemaVersion: 1,
    mistakeId: f.nextId("mistake"),
    classification: {
      inferredCategory: {
        kind: "grammar",
        categoryKey: "verb-agreement",
        curriculumTopicIds: [f.nextId("curriculumTopic")],
      },
      learnerAmendment: { status: "unchanged" },
    },
    recurrence: {
      status: "single-occurrence",
      occurrence: occurrenceFixture(),
    },
    disposition: { status: "active" },
    targetedPractice: { status: "not-created" },
  } as const;
}

describe("mistake contracts", () => {
  it("groups bounded evidence by grammar category and calendar date", () => {
    const mistake = mistakeSchema.parse(mistakeFixture());
    expect(effectiveMistakeCategory(mistake.classification)).toMatchObject({
      kind: "grammar",
      categoryKey: "verb-agreement",
    });
    expect(mistakeOccurrences(mistake.recurrence)[0]?.observedOn).toBe("2026-08-15");
  });

  it("keeps one occurrence from being presented as a recurring pattern", () => {
    expect(
      mistakeRecurrenceSchema.safeParse({
        status: "recurring",
        occurrences: [occurrenceFixture()],
      }).success,
    ).toBe(false);

    const first = occurrenceFixture();
    const secondFactory = createDeterministicContractFactory(20);
    const second = {
      ...occurrenceFixture(2),
      correctionId: secondFactory.nextId("correction"),
      attemptId: secondFactory.nextId("attempt"),
      observedOn: "2026-08-16",
    } as const;
    const recurring = mistakeRecurrenceSchema.parse({
      status: "recurring",
      occurrences: [first, second],
    });
    expect(mistakeOccurrences(recurring)).toHaveLength(2);
  });

  it("rejects duplicate evidence references in recurrence aggregation", () => {
    const occurrence = occurrenceFixture();
    expect(
      mistakeRecurrenceSchema.safeParse({
        status: "recurring",
        occurrences: [occurrence, occurrence],
      }).success,
    ).toBe(false);
  });

  it("preserves the inferred category when the learner amends it", () => {
    const fixture = mistakeFixture();
    const parsed = mistakeSchema.parse({
      ...fixture,
      classification: {
        ...fixture.classification,
        learnerAmendment: {
          status: "amended",
          category: {
            kind: "vocabulary",
            categoryKey: "movement-verbs",
            lemma: "gehen",
          },
          amendedAt: "2026-08-15T12:00:00.000Z",
          note: "This is a vocabulary distinction for me.",
        },
      },
    });
    expect(parsed.classification.inferredCategory.kind).toBe("grammar");
    expect(effectiveMistakeCategory(parsed.classification).kind).toBe("vocabulary");

    expect(
      mistakeSchema.safeParse({
        ...fixture,
        classification: {
          ...fixture.classification,
          learnerAmendment: {
            status: "amended",
            category: fixture.classification.inferredCategory,
            amendedAt: "2026-08-15T12:00:00.000Z",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("models dismissal with evidence and hard deletion without evidence", () => {
    const fixture = mistakeFixture();
    const dismissed = mistakeSchema.parse({
      ...fixture,
      disposition: {
        status: "dismissed",
        dismissedAt: "2026-08-15T12:00:00.000Z",
        reason: "not-a-mistake",
      },
    });
    expect(mistakeOccurrences(dismissed.recurrence)).toHaveLength(1);

    const deletion = deleteMistakeCommandSchema.parse({
      schemaVersion: 1,
      mistakeId: fixture.mistakeId,
      deletedAt: "2026-08-15T12:01:00.000Z",
    });
    expect(deletion).not.toHaveProperty("evidence");
    expect(
      deleteMistakeCommandSchema.safeParse({ ...deletion, evidence: "private learner text" })
        .success,
    ).toBe(false);
  });

  it("links targeted practice without changing historical evidence", () => {
    const f = createDeterministicContractFactory(30);
    const fixture = mistakeFixture();
    const linked = mistakeSchema.parse({
      ...fixture,
      targetedPractice: {
        status: "created",
        activityId: f.nextId("activity"),
        createdAt: "2026-08-15T12:02:00.000Z",
      },
    });
    expect(linked.targetedPractice.status).toBe("created");
    expect(linked.recurrence).toEqual(fixture.recurrence);
  });

  it("rejects cross-entity IDs, invalid dates, oversized spans, and unknown fields", () => {
    const fixture = mistakeFixture();
    for (const candidate of [
      { ...fixture, mistakeId: fixture.recurrence.occurrence.attemptId },
      {
        ...fixture,
        recurrence: {
          ...fixture.recurrence,
          occurrence: { ...fixture.recurrence.occurrence, observedOn: "15-08-2026" },
        },
      },
      {
        ...fixture,
        recurrence: {
          ...fixture.recurrence,
          occurrence: {
            ...fixture.recurrence.occurrence,
            evidence: {
              ...fixture.recurrence.occurrence.evidence,
              evidenceText: "x".repeat(1_001),
            },
          },
        },
      },
      { ...fixture, rawModelRationale: "private chain of thought" },
    ]) {
      expect(mistakeSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("projects the closed structural boundary to Draft 2020-12", () => {
    const schema = toBoundaryJsonSchema(mistakeSchema) as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["additionalProperties"]).toBe(false);
  });
});
