import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import {
  codexHandoffCapabilities,
  createDisposableHandoffStore,
  parseOpenDeutschActivityUrl,
} from "../scripts/lib/cross-surface-handoff.mjs";
import { createDisposableDataHarness } from "./support/disposable-data.mjs";

const execFileAsync = promisify(execFile);

test("routes only exact open-deutsch activity URLs", () => {
  assert.deepEqual(parseOpenDeutschActivityUrl("open-deutsch://activity/speaking-a1-1"), {
    route: "activity",
    activityId: "speaking-a1-1",
  });
  for (const value of [
    "https://activity/speaking-a1-1",
    "open-deutsch://settings/speaking-a1-1",
    "open-deutsch://activity/../settings",
    "open-deutsch://activity/id?next=other",
    "not a url",
  ]) {
    assert.throws(() => parseOpenDeutschActivityUrl(value), /OD_HANDOFF_URL_INVALID/);
  }
});

test("an MCP process creates the exact activity read by the dashboard", async () => {
  const harness = await createDisposableDataHarness();
  const store = await createDisposableHandoffStore(harness.dataRoot);
  const client = new Client({ name: "open-deutsch-handoff-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("apps/mcp-server/test/fixtures/handoff-server.mjs")],
    env: {
      PATH: process.env.PATH,
      OPEN_DEUTSCH_DATA_ROOT: harness.dataRoot,
    },
    stderr: "pipe",
  });
  let serverErrors = "";
  transport.stderr?.on("data", (chunk) => {
    serverErrors += chunk.toString();
  });
  try {
    await client.connect(transport);
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name),
      ["open_deutsch_probe_create_activity"],
    );
    const result = await client.callTool({
      name: "open_deutsch_probe_create_activity",
      arguments: { id: "voice-cafe-a1", title: "Order politely in a café" },
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(await store.readDashboard(), [
      { id: "voice-cafe-a1", title: "Order politely in a café", source: "mcp" },
    ]);
  } catch (error) {
    throw new Error(`MCP handoff failed: ${serverErrors}`, { cause: error });
  } finally {
    await client.close().catch(() => undefined);
    await harness.cleanup();
  }
});

test("concurrent MCP-side processes preserve every prepared activity", async () => {
  const harness = await createDisposableDataHarness();
  const writer = path.resolve("tests/fixtures/mcp-activity-writer.mjs");
  try {
    await Promise.all(
      [
        ["voice-market-a1", "Ask for a price"],
        ["voice-station-a1", "Ask for a platform"],
      ].map(([id, title]) =>
        execFileAsync(process.execPath, [writer, harness.dataRoot, id, title], {
          env: process.env,
        }),
      ),
    );
    const store = await createDisposableHandoffStore(harness.dataRoot);
    assert.deepEqual((await store.readDashboard()).map(({ id }) => id).sort(), [
      "voice-market-a1",
      "voice-station-a1",
    ]);
  } finally {
    await harness.cleanup();
  }
});

test("records exact text-thread support and the external Voice limitation without a fallback", () => {
  assert.deepEqual(codexHandoffCapabilities, {
    exactTextThreadCreation: "app-server-thread-start",
    exactTextThreadResume: "codex-resume-thread-id",
    exactDesktopVoiceSessionOpen: null,
    blockerCode: "OD_HANDOFF_VOICE_SESSION_UNSUPPORTED",
  });
});
