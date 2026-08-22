import { toBoundaryJsonSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  voiceObservedIssueCategories,
  voiceSessionDurationSchema,
  voiceSummarySchema,
} from "../src/index.js";

function voiceSummaryFixture() {
  const f = createDeterministicContractFactory();
  return {
    schemaVersion: 1,
    voiceSessionId: f.nextId("voiceSession"),
    summarizedAt: "2026-08-15T18:00:00.000Z",
    scenario: {
      title: "At the pharmacy",
      topic: "Explain a minor symptom and ask how to use a medicine.",
      targetLevel: "a2",
      speakingGoals: ["Describe a symptom", "Ask a follow-up question"],
    },
    duration: { status: "known", milliseconds: 420_000 },
    observedIssues: [
      {
        category: "grammar",
        observation: "Modal-verb word order was inconsistent.",
        evidenceSummary: "One request placed the infinitive before the object.",
        feedback: "Keep the infinitive at the end of the main clause.",
        uncertainty: { level: "none" },
      },
    ],
    vocabulary: [
      {
        lemma: "die Beschwerden",
        meaning: "symptoms or complaints",
        contextSummary: "Useful when describing the reason for visiting a pharmacy.",
      },
    ],
    feedback: {
      summary: "The conversation stayed understandable and task-focused.",
      strengths: ["Asked a clear follow-up question"],
      priorities: ["Review modal-verb word order"],
      uncertainty: {
        level: "some",
        explanation: "The host supplied only a session summary.",
      },
    },
    nextSteps: [
      {
        title: "Practice pharmacy requests",
        rationale: "Reinforce modal verbs and the new vocabulary.",
        naturalRequest: "Give me a short A2 pharmacy role-play with modal verbs.",
      },
    ],
  } as const;
}

describe("Voice-summary contracts", () => {
  it("stores the scenario, observations, vocabulary, feedback, and next steps", () => {
    const summary = voiceSummarySchema.parse(voiceSummaryFixture());
    expect(summary.scenario.title).toBe("At the pharmacy");
    expect(summary.observedIssues[0]?.category).toBe("grammar");
    expect(summary.vocabulary[0]?.lemma).toBe("die Beschwerden");
    expect(summary.nextSteps).toHaveLength(1);
  });

  it("supports a positive known duration or an explicit not-reported state", () => {
    expect(voiceSessionDurationSchema.parse({ status: "not-reported" })).toEqual({
      status: "not-reported",
    });
    expect(voiceSessionDurationSchema.safeParse({ status: "known", milliseconds: 0 }).success).toBe(
      false,
    );
    expect(voiceSessionDurationSchema.parse({ status: "known", milliseconds: 60_000 })).toEqual({
      status: "known",
      milliseconds: 60_000,
    });
  });

  it("covers bounded issue categories without turning them into scores", () => {
    expect(voiceObservedIssueCategories).toEqual([
      "pronunciation",
      "grammar",
      "vocabulary",
      "fluency",
      "comprehension",
      "register",
    ]);
    const summary = voiceSummarySchema.parse(voiceSummaryFixture());
    expect(summary.feedback).not.toHaveProperty("score");
    expect(summary.feedback).not.toHaveProperty("cefrCertification");
  });

  it("allows a useful summary when no issues or vocabulary were observed", () => {
    const fixture = voiceSummaryFixture();
    const summary = voiceSummarySchema.parse({
      ...fixture,
      duration: { status: "not-reported" },
      observedIssues: [],
      vocabulary: [],
      feedback: {
        ...fixture.feedback,
        priorities: [],
      },
    });
    expect(summary.observedIssues).toEqual([]);
    expect(summary.duration.status).toBe("not-reported");
  });

  it("rejects raw audio, transcripts, provider payloads, and tokens", () => {
    const fixture = voiceSummaryFixture();
    for (const candidate of [
      { ...fixture, audio: "base64-private-audio" },
      { ...fixture, transcript: "complete private conversation" },
      { ...fixture, providerPayload: { opaque: true } },
      { ...fixture, accessToken: "secret" },
    ]) {
      expect(voiceSummarySchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("rejects cross-entity IDs, malformed time, unbounded summaries, and missing next steps", () => {
    const fixture = voiceSummaryFixture();
    for (const candidate of [
      { ...fixture, voiceSessionId: "session_0000000000000001" },
      { ...fixture, summarizedAt: "2026-08-15 18:00" },
      { ...fixture, feedback: { ...fixture.feedback, summary: "x".repeat(1_001) } },
      { ...fixture, nextSteps: [] },
    ]) {
      expect(voiceSummarySchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("projects a closed Draft 2020-12 boundary", () => {
    const schema = toBoundaryJsonSchema(voiceSummarySchema) as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["additionalProperties"]).toBe(false);
    expect(JSON.stringify(schema)).toContain('"exclusiveMinimum":0');
  });
});
