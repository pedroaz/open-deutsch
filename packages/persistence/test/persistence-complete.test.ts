import { execFile } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import path from "node:path";

import { dataRootGenerationSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  inspectDataRootChoice,
  materializeDataRootSelection,
  openOpenDeutschDatabase,
  resolveDataRootLayout,
  writeBootstrapPointer,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const factory = createDeterministicContractFactory();

describe("complete persistence acceptance", () => {
  it("preserves both writes from independent desktop/MCP-equivalent processes", async ({
    disposableData,
  }) => {
    const plan = await inspectDataRootChoice(disposableData.dataRoot);
    await materializeDataRootSelection(plan, {
      generation: dataRootGenerationSchema.parse(1),
      createdAt: factory.nextInstant(),
      testMode: true,
    });
    const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "concurrent.json");
    await writeBootstrapPointer({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      expectedGeneration: null,
      selectedAt: factory.nextInstant(),
    });
    const migrated = await openOpenDeutschDatabase({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      rootGeneration: dataRootGenerationSchema.parse(1),
    });
    migrated.close();
    const fixture = path.resolve(
      "packages/persistence/test/fixtures/concurrent-repository-writer.mjs",
    );
    const children = [
      ["activity_0000000000000101", "process:writer:0101"],
      ["activity_0000000000000102", "process:writer:0102"],
    ] as const;
    const results = await Promise.all(
      children.map(([activityId, key]) =>
        execFileAsync(
          process.execPath,
          [fixture, bootstrapFile, disposableData.dataRoot, activityId, key],
          {
            timeout: 10_000,
            env: process.env,
          },
        ),
      ),
    );
    expect(results.map(({ stdout }) => JSON.parse(stdout.trim()) as unknown)).toEqual([
      { replayed: false },
      { replayed: false },
    ]);
    const inspection = new DatabaseSync(resolveDataRootLayout(disposableData.dataRoot).database);
    expect(
      inspection.prepare("SELECT activity_id FROM prepared_activities ORDER BY activity_id").all(),
    ).toEqual(children.map(([activity_id]) => ({ activity_id })));
    inspection.close();
  });
});
