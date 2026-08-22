import { toBoundaryJsonSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  alignedCorrectionSegmentSchema,
  correctedTextFromCorrection,
  correctionCategories,
  correctionSchema,
  originalTextFromCorrection,
} from "../src/index.js";

function correctionFixture() {
  const f = createDeterministicContractFactory();
  const topic = f.nextId("curriculumTopic");
  const metadata = {
    severity: "minor",
    priority: "high",
    explanation: "The finite verb needs first-person singular agreement.",
    grammarTopicIds: [topic],
    uncertainty: { level: "none" },
  } as const;
  return {
    schemaVersion: 1,
    correctionId: f.nextId("correction"),
    attemptId: f.nextId("attempt"),
    createdAt: f.nextInstant(),
    aiProvenance: {
      source: "ai",
      producer: "desktop-app-server",
      modelRequestId: f.nextId("modelRequest"),
      generatedAt: f.nextInstant(),
      modelSelection: {
        availability: "reported",
        modelId: "gpt-runtime-model",
        effortId: "medium",
      },
    },
    alignment: [
      { kind: "unchanged", text: "Ich geh" },
      {
        kind: "replacement",
        originalText: "en",
        correctedText: "e",
        category: "grammar",
        ...metadata,
      },
      { kind: "unchanged", text: " heute " },
      {
        kind: "replacement",
        originalText: "der",
        correctedText: "zum",
        category: "word-choice",
        ...metadata,
        explanation: "Use the contracted destination phrase here.",
      },
      { kind: "unchanged", text: " Markt." },
    ],
    naturalAlternative: {
      status: "provided",
      text: "Ich gehe heute noch zum Markt.",
      explanation: "Noch sounds natural when emphasizing that it will happen today.",
    },
    vocabularyCandidates: [
      {
        lemma: "der Markt",
        meaning: "market",
        sourceExcerpt: "zum Markt",
        rationale: "Useful for everyday shopping situations.",
        uncertainty: { level: "none" },
      },
    ],
    followUp: {
      status: "suggested",
      title: "Present-tense verb endings",
      reason: "Reinforce first-person singular forms.",
      naturalRequest: "Give me three short first-person present-tense sentences to correct.",
      grammarTopicIds: [topic],
    },
    overallUncertainty: { level: "none" },
  } as const;
}

describe("correction contracts", () => {
  it("reconstructs exact original and corrected text from one aligned authority", () => {
    const correction = correctionSchema.parse(correctionFixture());
    expect(originalTextFromCorrection(correction)).toBe("Ich gehen heute der Markt.");
    expect(correctedTextFromCorrection(correction)).toBe("Ich gehe heute zum Markt.");
  });

  it("covers the bounded correction categories and change metadata", () => {
    expect(correctionCategories).toEqual([
      "grammar",
      "spelling",
      "punctuation",
      "word-choice",
      "word-order",
      "register",
      "idiom",
      "clarity",
    ]);
    const changed = correctionSchema
      .parse(correctionFixture())
      .alignment.filter((segment) => segment.kind !== "unchanged");
    expect(changed).toHaveLength(2);
    expect(changed[0]).toMatchObject({ severity: "minor", priority: "high" });
  });

  it("models insertion, deletion, and replacement without empty no-op changes", () => {
    const base = {
      category: "punctuation",
      severity: "minor",
      priority: "low",
      explanation: "Punctuation adjustment.",
      grammarTopicIds: [],
      uncertainty: { level: "none" },
    } as const;
    expect(
      alignedCorrectionSegmentSchema.safeParse({
        ...base,
        kind: "insertion",
        originalText: "",
        correctedText: ",",
      }).success,
    ).toBe(true);
    expect(
      alignedCorrectionSegmentSchema.safeParse({
        ...base,
        kind: "deletion",
        originalText: ",",
        correctedText: "",
      }).success,
    ).toBe(true);
    expect(
      alignedCorrectionSegmentSchema.safeParse({
        ...base,
        kind: "replacement",
        originalText: "",
        correctedText: "",
      }).success,
    ).toBe(false);
    expect(
      alignedCorrectionSegmentSchema.safeParse({
        ...base,
        kind: "replacement",
        originalText: "same",
        correctedText: "same",
      }).success,
    ).toBe(false);
  });

  it("keeps natural alternatives, candidates, follow-up, and uncertainty explicit", () => {
    const correction = correctionSchema.parse(correctionFixture());
    expect(correction.naturalAlternative.status).toBe("provided");
    expect(correction.vocabularyCandidates[0]?.lemma).toBe("der Markt");
    expect(correction.followUp.status).toBe("suggested");
    expect(correction.overallUncertainty.level).toBe("none");
  });

  it("rejects cross-entity IDs, raw rationale, unbounded explanation, and unknown state", () => {
    const fixture = correctionFixture();
    for (const candidate of [
      { ...fixture, correctionId: fixture.attemptId },
      { ...fixture, rawModelOutput: "private unvalidated result" },
      {
        ...fixture,
        alignment: [
          {
            ...fixture.alignment[1],
            explanation: "x".repeat(801),
          },
        ],
      },
      { ...fixture, naturalAlternative: { status: "unknown" } },
    ]) {
      expect(correctionSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("projects the closed correction boundary to Draft 2020-12", () => {
    const schema = toBoundaryJsonSchema(correctionSchema) as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["additionalProperties"]).toBe(false);
    expect(
      alignedCorrectionSegmentSchema.safeParse({
        kind: "replacement",
        originalText: "same",
        correctedText: "same",
        category: "grammar",
        severity: "minor",
        priority: "low",
        explanation: "No-op replacement.",
        grammarTopicIds: [],
        uncertainty: { level: "none" },
      }).success,
    ).toBe(false);
  });
});
