import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  defaultTeachingProfileForActivity,
  resolveTeachingProfile,
  sessionTeachingProfileSelectionSchema,
  teachingActivityKinds,
  teachingProfileDefinitionSchema,
  teachingProfileIds,
  teachingProfiles,
} from "../src/index.js";

describe("teaching profiles", () => {
  it("defines exactly the two accepted profiles with their distinct behavior", () => {
    expect(teachingProfileIds).toEqual(["conversation-partner", "strict-corrector"]);
    expect(Object.keys(teachingProfiles)).toEqual(teachingProfileIds);
    expect(
      teachingProfileDefinitionSchema.parse(teachingProfiles["conversation-partner"]),
    ).toMatchObject({
      conversationLanguagePolicy: "german-first",
      interruptionPolicy: "minimal",
      correctionTiming: "end-of-activity",
      tone: "encouraging",
    });
    expect(
      teachingProfileDefinitionSchema.parse(teachingProfiles["strict-corrector"]),
    ).toMatchObject({
      interruptionPolicy: "every-meaningful-error",
      correctionCoverage: "all-meaningful",
      explanationLanguagePolicy: "configured-with-english-support",
      createsTargetedFollowUp: true,
    });
  });

  it("maps activity defaults without multiplying profile types", () => {
    const expectedStrict = new Set(["correct-now", "writing-review", "targeted-mistake-practice"]);
    for (const activity of teachingActivityKinds) {
      expect(defaultTeachingProfileForActivity(activity)).toBe(
        expectedStrict.has(activity) ? "strict-corrector" : "conversation-partner",
      );
    }
  });

  it("applies an override only to the explicit session selection", () => {
    const factory = createDeterministicContractFactory();
    const selection = sessionTeachingProfileSelectionSchema.parse({
      schemaVersion: 1,
      sessionId: factory.nextId("session"),
      activity: "voice-conversation",
      overrideProfileId: "strict-corrector",
    });
    expect(resolveTeachingProfile(selection, "de")).toMatchObject({
      id: "strict-corrector",
      explanationLanguage: "de",
      englishSupport: "when-useful",
    });
    expect(resolveTeachingProfile(selection, "en").englishSupport).toBe("none");
    expect(defaultTeachingProfileForActivity("voice-conversation")).toBe("conversation-partner");
    expect(
      resolveTeachingProfile(
        sessionTeachingProfileSelectionSchema.parse({
          schemaVersion: 1,
          sessionId: factory.nextId("session"),
          activity: "voice-conversation",
        }),
        "de",
      ).id,
    ).toBe("conversation-partner");
  });

  it("resolves the configured EN/DE explanation language for either profile", () => {
    const factory = createDeterministicContractFactory();
    const conversation = sessionTeachingProfileSelectionSchema.parse({
      schemaVersion: 1,
      sessionId: factory.nextId("session"),
      activity: "codex-conversation",
    });
    expect(resolveTeachingProfile(conversation, "de")).toMatchObject({
      id: "conversation-partner",
      explanationLanguage: "de",
      englishSupport: "none",
    });
    expect(resolveTeachingProfile(conversation, "en")).toMatchObject({
      id: "conversation-partner",
      explanationLanguage: "en",
      englishSupport: "none",
    });
    expect(() => resolveTeachingProfile(conversation, "fr" as "en")).toThrow();
  });

  it("rejects invented profiles and unknown behavior knobs", () => {
    const factory = createDeterministicContractFactory();
    expect(
      sessionTeachingProfileSelectionSchema.safeParse({
        schemaVersion: 1,
        sessionId: factory.nextId("session"),
        activity: "codex-conversation",
        overrideProfileId: "grammar-coach",
      }).success,
    ).toBe(false);
    expect(
      teachingProfileDefinitionSchema.safeParse({
        ...teachingProfiles["conversation-partner"],
        customPrompt: "unbounded mode",
      }).success,
    ).toBe(false);
  });
});
