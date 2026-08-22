import { describe, expect, expectTypeOf, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  cefrBands,
  createInitialLearnerProfile,
  defaultUiLocale,
  learnerProfileSchema,
  type LearnerProfile,
} from "../src/index.js";

function validProfile() {
  const factory = createDeterministicContractFactory();
  const createdAt = factory.nextInstant();
  return {
    schemaVersion: 1 as const,
    learnerId: factory.nextId("learner"),
    levelEstimate: {
      currentLevel: "a2" as const,
      targetLevel: "b1" as const,
      basis: "self-reported" as const,
      updatedAt: createdAt,
    },
    everydayGermanyGoal: "Handle everyday appointments and conversations independently.",
    motivation: "Feel at home in daily life in Germany.",
    interests: ["cooking", "local history"],
    preferredTopics: ["doctor appointments", "neighbors"],
    availableStudyMinutesPerWeek: 180,
    correctionPreferences: {
      timing: "end-of-activity" as const,
      coverage: "all-meaningful" as const,
      showConciseExplanation: true,
      showNaturalAlternative: true,
    },
    onboardingState: "complete" as const,
    inferredStrengths: [
      {
        label: "Uses familiar present-tense phrases confidently",
        confidence: "medium" as const,
        source: "inferred" as const,
        learnerEdited: false,
        updatedAt: createdAt,
      },
    ],
    inferredWeaknesses: [
      {
        label: "Case endings after prepositions",
        note: "Learner changed this note after reviewing recent corrections.",
        confidence: "high" as const,
        source: "inferred" as const,
        learnerEdited: true,
        updatedAt: createdAt,
      },
    ],
    uiLocale: defaultUiLocale,
    teachingLanguage: "de" as const,
    defaultTeachingProfileId: "strict-corrector" as const,
    createdAt,
    updatedAt: factory.nextInstant(),
  };
}

describe("learner profile", () => {
  it("represents the accepted A1-B2 profile with separate language settings", () => {
    expect(cefrBands).toEqual(["a1", "a2", "b1", "b2"]);
    const profile = learnerProfileSchema.parse(validProfile());
    expect(profile.uiLocale).toBe("en");
    expect(profile.teachingLanguage).toBe("de");
    expect(profile.defaultTeachingProfileId).toBe("strict-corrector");
    expect(profile.inferredWeaknesses[0]).toMatchObject({
      source: "inferred",
      learnerEdited: true,
    });
    expectTypeOf(profile).toEqualTypeOf<LearnerProfile>();
  });

  it("requires explicit English-default UI locale rather than coupling it to teaching language", () => {
    const missingUiLocale: Record<string, unknown> = { ...validProfile() };
    Reflect.deleteProperty(missingUiLocale, "uiLocale");
    expect(learnerProfileSchema.safeParse(missingUiLocale).success).toBe(false);
    expect(learnerProfileSchema.parse(validProfile()).uiLocale).toBe(defaultUiLocale);
    const { uiLocale, ...initialInput } = validProfile();
    expect(uiLocale).toBe("en");
    expect(createInitialLearnerProfile(initialInput).uiLocale).toBe("en");
  });

  it("rejects certification levels, unknown fields, and unbounded personal text", () => {
    for (const candidate of [
      {
        ...validProfile(),
        levelEstimate: { ...validProfile().levelEstimate, currentLevel: "c1" },
      },
      { ...validProfile(), formalCertificationScore: 99 },
      { ...validProfile(), interests: ["x".repeat(81)] },
      { ...validProfile(), availableStudyMinutesPerWeek: 0 },
      { ...validProfile(), defaultTeachingProfileId: "api-key-profile" },
    ]) {
      expect(learnerProfileSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("keeps optional placement skippable while requiring an approximate level", () => {
    const profile = learnerProfileSchema.parse(validProfile());
    expect(profile.levelEstimate.optionalDiagnosticCompletedOn).toBeUndefined();
    expect(
      learnerProfileSchema.safeParse({
        ...validProfile(),
        levelEstimate: { ...validProfile().levelEstimate, currentLevel: undefined },
      }).success,
    ).toBe(false);
  });

  it("requires evidence for a diagnostic-based estimate without making placement mandatory", () => {
    const profile = validProfile();
    expect(
      learnerProfileSchema.safeParse({
        ...profile,
        levelEstimate: { ...profile.levelEstimate, basis: "diagnostic" },
      }).success,
    ).toBe(false);
    expect(
      learnerProfileSchema.safeParse({
        ...profile,
        levelEstimate: {
          ...profile.levelEstimate,
          basis: "diagnostic",
          optionalDiagnosticCompletedOn: "2026-08-15",
        },
      }).success,
    ).toBe(true);
    expect(
      learnerProfileSchema.safeParse({
        ...profile,
        levelEstimate: {
          ...profile.levelEstimate,
          optionalDiagnosticCompletedOn: "2026-08-15",
        },
      }).success,
    ).toBe(true);
  });
});
