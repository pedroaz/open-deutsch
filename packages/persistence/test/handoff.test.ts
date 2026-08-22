import path from "node:path";

import { dataRootGenerationSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  inspectDataRootChoice,
  materializeDataRootSelection,
  OpenDeutschRepository,
  openOpenDeutschDatabase,
  writeBootstrapPointer,
} from "../src/index.js";

const factory = createDeterministicContractFactory(20, "2026-08-21T08:00:00.000Z");

describe("persistent exact handoff context", () => {
  it("stores versioned continuation state independently of chat history", async ({
    disposableData,
  }) => {
    const selection = await inspectDataRootChoice(disposableData.dataRoot);
    await materializeDataRootSelection(selection, {
      generation: dataRootGenerationSchema.parse(1),
      createdAt: factory.nextInstant(),
      testMode: true,
    });
    const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "handoff.json");
    await writeBootstrapPointer({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      expectedGeneration: null,
      selectedAt: factory.nextInstant(),
    });
    const database = await openOpenDeutschDatabase({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      rootGeneration: dataRootGenerationSchema.parse(1),
    });
    const repository = new OpenDeutschRepository(database);
    const activityId = factory.nextId("activity");
    const preparedAt = factory.nextInstant();
    await repository.savePreparedActivity(
      {
        activityId,
        activityType: "codex-listening",
        title: "Appointments listening",
        originSurface: "codex",
        context: {
          naturalRequest: "Practice appointment details.",
          instructions: "Listen in Codex Voice and report the structured result.",
          curriculumTopicIds: [],
          mistakeIds: [],
          vocabularyIds: [],
        },
        preparedAt,
      },
      "handoff-prepared-activity-0001",
    );
    const handoffId = factory.nextId("persistentHandoff");
    const created = await repository.createPersistentHandoff({
      handoffId,
      activityId,
      originSurface: "codex",
      destinationSurface: "voice",
      targetKind: "voice-session",
      payloadVersion: 1,
      continuationSummary: "Continue the appointment role-play in the exact related Voice session.",
      createdAt: factory.nextInstant(),
    });
    expect(created).toMatchObject({
      handoffId,
      activityId,
      status: "prepared",
      targetReference: null,
      payloadVersion: 1,
      rootGeneration: 1,
    });

    const opened = await repository.updatePersistentHandoff({
      handoffId,
      targetReference: "voice-session_0123456789abcdef",
      status: "opened",
      continuationSummary: "Voice opened; return the structured summary when the role-play ends.",
      updatedAt: factory.nextInstant(),
    });
    expect(opened.status).toBe("opened");
    await expect(repository.readPersistentHandoff(handoffId)).resolves.toEqual(opened);

    const completed = await repository.updatePersistentHandoff({
      handoffId,
      targetReference: opened.targetReference,
      status: "completed",
      continuationSummary: "The Voice summary was returned; review the saved issues next.",
      updatedAt: factory.nextInstant(),
    });
    expect(completed.status).toBe("completed");
    await expect(
      repository.updatePersistentHandoff({
        handoffId,
        targetReference: opened.targetReference,
        status: "opened",
        continuationSummary: "This transition must be rejected.",
        updatedAt: factory.nextInstant(),
      }),
    ).rejects.toThrow("OD_HANDOFF_TERMINAL");

    await repository.deletePreparedActivity(activityId);
    await expect(repository.readPersistentHandoff(handoffId)).resolves.toBeUndefined();
    database.close();
  });
});
