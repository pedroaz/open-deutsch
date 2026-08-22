import { describe, expect, expectTypeOf, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  activityCreateInputSchema,
  mcpToolAnnotationSchema,
  mcpToolContracts,
  mcpToolNames,
  toBoundaryJsonSchema,
  weeklyPlanReplacementInputSchema,
  type McpToolInput,
  type McpToolResult,
} from "../src/index.js";

const factory = createDeterministicContractFactory();
const generation = 3;
const idempotencyKey = "codex-request-00000001";

const validInputs = {
  open_deutsch_read_learner_context: {
    dataRootGeneration: generation,
    sections: ["profile", "goals", "teaching-defaults"],
  },
  open_deutsch_read_practice_context: {
    dataRootGeneration: generation,
    focus: "all",
    maximumItemsPerSection: 5,
  },
  open_deutsch_read_curriculum_coverage: {
    dataRootGeneration: generation,
    band: "A2",
    includeLearnerRelevance: false,
  },
  open_deutsch_create_activity: {
    dataRootGeneration: generation,
    idempotencyKey,
    activity: {
      kind: "grammar",
      title: "Practice appointment sentences",
      instructions: "Complete the prepared activity in Open Deutsch.",
      destinationSurface: "practice",
      curriculumTopicIds: [factory.nextId("curriculumTopic")],
      naturalRequest: "Help me practise making an appointment.",
    },
  },
  open_deutsch_save_attempt_feedback: {
    dataRootGeneration: generation,
    idempotencyKey,
    activityId: factory.nextId("activity"),
    expectedActivityRevision: 0,
    feedback: {
      outcome: "completed",
      summary: "The learner completed the appointment practice.",
      objectiveResults: ["met", "partially-met"],
      evidence: ["Used the correct time expression."],
    },
  },
  open_deutsch_save_listening_result: {
    dataRootGeneration: generation,
    idempotencyKey: "codex-listening-0001",
    activityId: factory.nextId("activity"),
    expectedActivityRevision: 1,
    occurredAt: "2026-08-20T12:00:00.000Z",
    result: {
      schemaVersion: 1,
      exerciseResults: [
        {
          kind: "gist",
          outcome: "demonstrated",
          evidence: "Gist identified.",
          uncertainty: { level: "some", explanation: "One task only." },
        },
        {
          kind: "detail",
          outcome: "developing",
          evidence: "Time partly identified.",
          uncertainty: { level: "some", explanation: "One detail only." },
        },
        {
          kind: "dictation",
          outcome: "developing",
          evidence: "Key phrase retained.",
          uncertainty: { level: "substantial", explanation: "No transcript stored." },
        },
        {
          kind: "cloze",
          outcome: "not-demonstrated",
          evidence: "Cloze was not completed.",
          uncertainty: { level: "some", explanation: "No response." },
        },
      ],
      difficultVocabulary: ["verschieben"],
      nextSteps: ["Repeat the appointment call."],
      noAudioNotice: "OD_NO_AUDIO_OR_TRANSCRIPT_STORED_BY_OPEN_DEUTSCH",
    },
  },
  open_deutsch_replace_weekly_plan: {
    dataRootGeneration: generation,
    idempotencyKey,
    expectedCurrentPlanId: null,
    preview: {
      previewId: factory.nextId("correlation"),
      confirmation: "confirmed",
      summary: "Replace the empty plan with one appointment-practice goal.",
    },
    plan: {
      weekStartsOn: "2026-08-10",
      naturalRequest: "Make a light plan for this week.",
      goals: [
        {
          title: "Make appointments",
          rationale: "This supports everyday life in Germany.",
          suggestions: ["Practise one appointment dialogue."],
        },
      ],
    },
  },
  open_deutsch_save_voice_summary: {
    dataRootGeneration: generation,
    idempotencyKey,
    summary: {
      scenario: "Calling a medical practice",
      topic: "Making an appointment",
      durationMilliseconds: 180_000,
      observedIssues: ["Word order in time expressions needs more practice."],
      vocabularyNotes: ["der Termin — appointment"],
      feedback: "The learner communicated the main request clearly.",
      nextSteps: ["Practise two alternative appointment times."],
      occurredAt: factory.nextInstant(),
    },
  },
} as const;

describe("initial MCP tool contracts", () => {
  it("defines a closed, bounded inventory with accurate annotations", () => {
    expect(Object.keys(mcpToolContracts)).toEqual(mcpToolNames);
    for (const name of mcpToolNames) {
      const contract = mcpToolContracts[name];
      expect(contract.title.length).toBeGreaterThan(0);
      expect(contract.description.length).toBeGreaterThan(20);
      expect(mcpToolAnnotationSchema.safeParse(contract.annotations).success).toBe(true);
      expect(contract.annotations.openWorldHint).toBe(false);
      expect(contract.annotations.idempotentHint).toBe(true);
      expect(contract.inputSchema.safeParse(validInputs[name]).success).toBe(true);
    }
    expect(mcpToolContracts.open_deutsch_replace_weekly_plan.annotations.destructiveHint).toBe(
      true,
    );
    expect(mcpToolContracts.open_deutsch_replace_weekly_plan.confirmationPolicy).toBe(
      "preview-and-explicit-confirmation",
    );
    expect(
      mcpToolNames
        .filter((name) => name.startsWith("open_deutsch_read_"))
        .every((name) => mcpToolContracts[name].annotations.readOnlyHint),
    ).toBe(true);
  });

  it("requires generation binding and idempotency for every write", () => {
    for (const name of mcpToolNames) {
      const contract = mcpToolContracts[name];
      const input = validInputs[name];
      expect(
        contract.inputSchema.safeParse({ ...input, dataRootGeneration: undefined }).success,
      ).toBe(false);
      if (!contract.annotations.readOnlyHint) {
        expect(
          contract.inputSchema.safeParse({ ...input, idempotencyKey: undefined }).success,
        ).toBe(false);
        expect(contract.inputSchema.safeParse({ ...input, idempotencyKey: "short" }).success).toBe(
          false,
        );
      }
    }
  });

  it("requires an exact confirmed preview for material plan replacement", () => {
    const valid = validInputs.open_deutsch_replace_weekly_plan;
    expect(weeklyPlanReplacementInputSchema.safeParse(valid).success).toBe(true);
    expect(
      weeklyPlanReplacementInputSchema.safeParse({
        ...valid,
        preview: { ...valid.preview, confirmation: "pending" },
      }).success,
    ).toBe(false);
    expect(
      weeklyPlanReplacementInputSchema.safeParse({ ...valid, preview: undefined }).success,
    ).toBe(false);
  });

  it("rejects generic filesystem, database, network, shell, and transcript escape fields", () => {
    const activity = validInputs.open_deutsch_create_activity;
    for (const extra of [
      { path: "/home/learner" },
      { sql: "delete from attempts" },
      { network: true },
      { shell: "sh" },
      { rawProtocol: { method: "tools/call" } },
    ]) {
      expect(activityCreateInputSchema.safeParse({ ...activity, ...extra }).success).toBe(false);
    }
    const voice = validInputs.open_deutsch_save_voice_summary;
    expect(
      mcpToolContracts.open_deutsch_save_voice_summary.inputSchema.safeParse({
        ...voice,
        summary: { ...voice.summary, transcript: "private speech", audioPath: "/tmp/audio" },
      }).success,
    ).toBe(false);
  });

  it("requires bounded model-readable summaries for success and safe shared errors", () => {
    const contract = mcpToolContracts.open_deutsch_create_activity;
    expect(
      contract.resultSchema.safeParse({
        status: "ok",
        summary: "Created one persistent grammar activity for Open Deutsch Practice.",
        data: {
          activityId: factory.nextId("activity"),
          destinationSurface: "practice",
          persistence: "until-completed-or-deleted",
          replayed: false,
        },
      }).success,
    ).toBe(true);
    expect(
      contract.resultSchema.safeParse({
        status: "ok",
        summary: "x".repeat(1_201),
        data: {
          activityId: factory.nextId("activity"),
          destinationSurface: "practice",
          persistence: "until-completed-or-deleted",
          replayed: false,
        },
      }).success,
    ).toBe(false);
    expect(
      contract.resultSchema.safeParse({
        status: "error",
        summary: "The selected Open Deutsch data folder changed; restart the integration.",
        error: {
          schemaVersion: 1,
          kind: "stale-data-root",
          code: "OD_DATA_ROOT_STALE",
          messageKey: "errors.staleDataRoot",
          reference: {
            code: "OD_DATA_ROOT_STALE",
            correlationId: factory.nextId("correlation"),
            occurredAt: factory.nextInstant(),
          },
        },
      }).success,
    ).toBe(true);
  });

  it("exports closed Draft 2020-12 schemas and channel-correlated TypeScript types", () => {
    for (const name of mcpToolNames) {
      const contract = mcpToolContracts[name];
      for (const schema of [contract.inputSchema, contract.resultSchema]) {
        const projected = toBoundaryJsonSchema(schema);
        expect(projected["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
        expect(JSON.stringify(projected)).toContain('"additionalProperties":false');
      }
    }
    expectTypeOf<McpToolInput<"open_deutsch_create_activity">>().toHaveProperty("activity");
    expectTypeOf<McpToolResult<"open_deutsch_create_activity">>().toHaveProperty("status");
  });
});
