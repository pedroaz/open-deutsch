import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { defaultModelPreferences, learnerProfileSchema } from "../packages/domain/dist/index.js";
import {
  inspectDataRootChoice,
  materializeDataRootSelection,
  OpenDeutschRepository,
  openOpenDeutschDatabase,
  writeBootstrapPointer,
} from "../packages/persistence/dist/index.js";

import { createDisposableDataHarness } from "./support/disposable-data.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repositoryRoot, "apps/mcp-server/dist/index.js");
const helperPath = path.join(repositoryRoot, "plugins/open-deutsch/bin/open-deutsch-mcp.cjs");

async function seedRoot(harness) {
  const selection = await inspectDataRootChoice(harness.dataRoot);
  const createdAt = "2026-08-20T10:00:00.000Z";
  await materializeDataRootSelection(selection, {
    generation: 1,
    createdAt,
    testMode: true,
  });
  await rm(harness.bootstrapFile, { force: true });
  await writeBootstrapPointer({
    bootstrapFile: harness.bootstrapFile,
    dataRoot: harness.dataRoot,
    expectedGeneration: null,
    selectedAt: createdAt,
  });
  const database = await openOpenDeutschDatabase({
    bootstrapFile: harness.bootstrapFile,
    dataRoot: harness.dataRoot,
    rootGeneration: 1,
  });
  const repository = new OpenDeutschRepository(database);
  const profile = learnerProfileSchema.parse({
    schemaVersion: 1,
    learnerId: "learner_0123456789abcdef",
    levelEstimate: {
      currentLevel: "a1",
      targetLevel: "b1",
      basis: "self-reported",
      updatedAt: createdAt,
    },
    everydayGermanyGoal: "Handle appointments confidently.",
    motivation: "Feel at home in daily life.",
    interests: ["local life"],
    preferredTopics: ["appointments"],
    availableStudyMinutesPerWeek: 90,
    correctionPreferences: {
      timing: "end-of-activity",
      coverage: "priority-only",
      showConciseExplanation: true,
      showNaturalAlternative: true,
    },
    onboardingState: "complete",
    inferredStrengths: [],
    inferredWeaknesses: [],
    uiLocale: "en",
    teachingLanguage: "en",
    defaultTeachingProfileId: "conversation-partner",
    createdAt,
    updatedAt: createdAt,
  });
  await repository.createLearnerSettings({ profile, modelPreferences: defaultModelPreferences });
  database.close();
}

test(
  "production MCP exposes bounded tools over STDIO and refuses stale roots",
  { timeout: 20_000 },
  async () => {
    const harness = await createDisposableDataHarness();
    await seedRoot(harness);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [helperPath],
      cwd: repositoryRoot,
      env: {
        ...harness.environment(getDefaultEnvironment()),
        OPEN_DEUTSCH_BOOTSTRAP_FILE: harness.bootstrapFile,
        OPEN_DEUTSCH_CURRICULUM_ROOT: path.join(repositoryRoot, "content/curriculum"),
        OPEN_DEUTSCH_MCP_ENTRY: serverPath,
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "open-deutsch-production-test", version: "0.1.0" });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    try {
      await client.connect(transport);
      assert.deepEqual(client.getServerVersion(), { name: "open-deutsch", version: "0.1.0" });
      const { tools } = await client.listTools();
      assert.equal(tools.length, 8);
      assert.deepEqual(
        tools.map(({ name }) => name).sort(),
        [
          "open_deutsch_create_activity",
          "open_deutsch_read_curriculum_coverage",
          "open_deutsch_read_learner_context",
          "open_deutsch_read_practice_context",
          "open_deutsch_replace_weekly_plan",
          "open_deutsch_save_attempt_feedback",
          "open_deutsch_save_listening_result",
          "open_deutsch_save_voice_summary",
        ].sort(),
      );
      assert.ok(tools.every((tool) => tool.inputSchema.type === "object"));
      assert.equal(
        tools.find((tool) => tool.name === "open_deutsch_read_learner_context").annotations
          .readOnlyHint,
        true,
      );
      assert.equal(
        tools.find((tool) => tool.name === "open_deutsch_replace_weekly_plan").annotations
          .destructiveHint,
        true,
      );

      const learner = await client.callTool({
        name: "open_deutsch_read_learner_context",
        arguments: { dataRootGeneration: 1, sections: ["profile", "goals", "teaching-defaults"] },
      });
      assert.equal(learner.structuredContent.status, "ok");
      assert.equal(
        learner.structuredContent.data.everydayLifeGoal,
        "Handle appointments confidently.",
      );
      assert.equal(JSON.stringify(learner).includes(harness.dataRoot), false);

      const activity = await client.callTool({
        name: "open_deutsch_create_activity",
        arguments: {
          dataRootGeneration: 1,
          idempotencyKey: "activity-create-production-0001",
          activity: {
            kind: "grammar",
            title: "Appointment message",
            instructions: "Write a short appointment request.",
            destinationSurface: "practice",
            curriculumTopicIds: [],
          },
        },
      });
      assert.equal(activity.isError, undefined, JSON.stringify(activity));
      assert.equal(activity.structuredContent.status, "ok");
      assert.equal(activity.structuredContent.data.replayed, false);

      const replayed = await client.callTool({
        name: "open_deutsch_create_activity",
        arguments: {
          dataRootGeneration: 1,
          idempotencyKey: "activity-create-production-0001",
          activity: {
            kind: "grammar",
            title: "Appointment message",
            instructions: "Write a short appointment request.",
            destinationSurface: "practice",
            curriculumTopicIds: [],
          },
        },
      });
      assert.equal(replayed.isError, undefined, JSON.stringify(replayed));
      assert.equal(replayed.structuredContent.data.replayed, true);

      const listeningActivity = await client.callTool({
        name: "open_deutsch_create_activity",
        arguments: {
          dataRootGeneration: 1,
          idempotencyKey: "activity-listening-production-0001",
          activity: {
            kind: "listening",
            title: "Appointment call",
            instructions: "Listen for the changed appointment time.",
            destinationSurface: "practice",
            curriculumTopicIds: [],
            voiceContext: {
              schemaVersion: 1,
              kind: "listening",
              targetLevel: "a2",
              scenario: "Understand an appointment call",
              difficulty: "intermediate",
              correctionTiming: "after-each",
              objectives: ["Catch the new time."],
              script: "The caller moves the appointment to Thursday.",
              questions: ["What is the new time?"],
              answerGuidance: ["State the time as evidence."],
              handoff: {
                status: "unavailable",
                code: "OD_HANDOFF_VOICE_SESSION_UNSUPPORTED",
                explanation: "Exact handoff is unavailable.",
              },
            },
          },
        },
      });
      assert.equal(listeningActivity.structuredContent.status, "ok");
      const listeningResult = await client.callTool({
        name: "open_deutsch_save_listening_result",
        arguments: {
          dataRootGeneration: 1,
          idempotencyKey: "listening-result-production-0001",
          activityId: listeningActivity.structuredContent.data.activityId,
          expectedActivityRevision: 1,
          occurredAt: new Date().toISOString(),
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
                evidence: "Phrase retained.",
                uncertainty: { level: "substantial", explanation: "No transcript stored." },
              },
              {
                kind: "cloze",
                outcome: "not-demonstrated",
                evidence: "Not completed.",
                uncertainty: { level: "some", explanation: "No response." },
              },
            ],
            difficultVocabulary: ["verschieben"],
            nextSteps: ["Repeat the appointment call."],
            noAudioNotice: "OD_NO_AUDIO_OR_TRANSCRIPT_STORED_BY_OPEN_DEUTSCH",
          },
        },
      });
      assert.equal(listeningResult.structuredContent.status, "ok");
      assert.equal(listeningResult.structuredContent.data.replayed, false);

      const feedback = await client.callTool({
        name: "open_deutsch_save_attempt_feedback",
        arguments: {
          dataRootGeneration: 1,
          idempotencyKey: "attempt-feedback-production-0001",
          activityId: activity.structuredContent.data.activityId,
          expectedActivityRevision: 1,
          feedback: {
            outcome: "completed",
            summary: "The learner completed the short appointment message.",
            objectiveResults: ["met"],
            evidence: ["The request used a clear appointment purpose."],
          },
        },
      });
      assert.equal(feedback.structuredContent.status, "ok");
      assert.equal(feedback.structuredContent.data.replayed, false);

      const coverage = await client.callTool({
        name: "open_deutsch_read_curriculum_coverage",
        arguments: { dataRootGeneration: 1, includeLearnerRelevance: false },
      });
      assert.equal(coverage.structuredContent.status, "ok");
      assert.equal(coverage.structuredContent.data.matchingTopicCount, 48);
      assert.equal(coverage.structuredContent.data.foundationReadyCount, 48);
      assert.deepEqual(coverage.structuredContent.data.gaps, []);
      assert.equal(coverage.structuredContent.data.nextGap, null);

      const planArguments = {
        dataRootGeneration: 1,
        idempotencyKey: "weekly-plan-production-0001",
        expectedCurrentPlanId: null,
        preview: {
          previewId: "correlation_0123456789abcdef",
          confirmation: "confirmed",
          summary: "Focus on practical appointment language this week.",
        },
        plan: {
          weekStartsOn: "2026-08-17",
          naturalRequest: "Prioritise appointment language.",
          goals: [
            {
              title: "Appointments",
              rationale: "Build confidence with everyday appointments.",
              suggestions: ["Write a short appointment request."],
            },
          ],
        },
      };
      const plan = await client.callTool({
        name: "open_deutsch_replace_weekly_plan",
        arguments: planArguments,
      });
      assert.equal(plan.structuredContent.status, "ok");
      assert.equal(plan.structuredContent.data.replacedPlanId, null);
      const planReplay = await client.callTool({
        name: "open_deutsch_replace_weekly_plan",
        arguments: planArguments,
      });
      assert.equal(planReplay.isError, undefined, JSON.stringify(planReplay));
      assert.equal(planReplay.structuredContent.data.replayed, true);

      const voice = await client.callTool({
        name: "open_deutsch_save_voice_summary",
        arguments: {
          dataRootGeneration: 1,
          idempotencyKey: "voice-summary-production-0001",
          summary: {
            scenario: "Appointment role-play",
            topic: "Making an appointment",
            durationMilliseconds: 600000,
            observedIssues: ["The appointment vocabulary needs another review."],
            vocabularyNotes: ["der Termin"],
            feedback: "The conversation stayed understandable.",
            nextSteps: ["Repeat the appointment role-play."],
            occurredAt: "2026-08-20T10:10:00.000Z",
          },
        },
      });
      assert.equal(voice.structuredContent.status, "ok");
      assert.equal(voice.structuredContent.data.replayed, false);

      const bootstrap = { schemaVersion: 1, dataRoot: harness.dataRoot, rootGeneration: 2 };
      await writeFile(harness.bootstrapFile, `${JSON.stringify(bootstrap)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      const stale = await client.callTool({
        name: "open_deutsch_read_practice_context",
        arguments: { dataRootGeneration: 1, focus: "all", maximumItemsPerSection: 5 },
      });
      assert.equal(stale.isError, true);
      assert.match(stale.content[0].text, /OD_DATA_ROOT_STALE/u);
    } finally {
      await client.close();
      assert.equal(transport.pid, null);
      assert.equal(stderr.includes("OD_MCP_PROTOCOL_ERROR"), false);
      await rm(harness.dataRoot, { recursive: true, force: true });
      await mkdir(harness.dataRoot, { mode: 0o700 });
      await harness.cleanup();
    }
  },
);
