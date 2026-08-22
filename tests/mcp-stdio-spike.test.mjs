import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";

import { createDisposableDataHarness } from "./support/disposable-data.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repositoryRoot, "apps/mcp-server/dist/spike.js");
const stateFilename = "mcp-stdio-spike-state.json";

async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

test(
  "lists and calls model-readable read/write tools over owned STDIO",
  { timeout: 10_000 },
  async () => {
    const harness = await createDisposableDataHarness();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: repositoryRoot,
      env: harness.environment({
        ...getDefaultEnvironment(),
        OPEN_DEUTSCH_MCP_SPIKE: "YES",
      }),
      stderr: "pipe",
    });
    const client = new Client({ name: "open-deutsch-stdio-spike-test", version: "0.0.0" });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    try {
      await client.connect(transport);
      assert.deepEqual(client.getServerVersion(), {
        name: "open-deutsch-stdio-spike",
        version: "0.0.0",
      });
      const { tools } = await client.listTools();
      assert.deepEqual(
        tools.map(({ name }) => name),
        ["open_deutsch_spike_read_note", "open_deutsch_spike_write_note"],
      );
      for (const tool of tools) {
        assert.equal(typeof tool.description, "string");
        assert.ok(tool.description.length > 20);
        assert.equal(tool.inputSchema.type, "object");
        assert.equal(tool.outputSchema?.type, "object");
        assert.equal(tool.annotations?.openWorldHint, false);
      }
      assert.equal(tools[0].annotations?.readOnlyHint, true);
      assert.equal(tools[1].annotations?.readOnlyHint, false);

      const empty = await client.callTool({
        name: "open_deutsch_spike_read_note",
        arguments: {},
      });
      assert.deepEqual(empty.structuredContent, { note: null, revision: 0 });
      assert.deepEqual(empty.content, [
        { type: "text", text: "No disposable spike note has been saved." },
      ]);

      const written = await client.callTool({
        name: "open_deutsch_spike_write_note",
        arguments: { note: "Practice nominative articles." },
      });
      assert.deepEqual(written.structuredContent, {
        note: "Practice nominative articles.",
        revision: 1,
      });
      assert.deepEqual(written.content, [
        { type: "text", text: "Saved disposable spike note revision 1." },
      ]);

      const persisted = await client.callTool({
        name: "open_deutsch_spike_read_note",
        arguments: {},
      });
      assert.deepEqual(persisted.structuredContent, written.structuredContent);
      assert.match(persisted.content[0].text, /Practice nominative articles\./);

      const concurrent = await Promise.all([
        client.callTool({
          name: "open_deutsch_spike_write_note",
          arguments: { note: "Concurrent note A." },
        }),
        client.callTool({
          name: "open_deutsch_spike_write_note",
          arguments: { note: "Concurrent note B." },
        }),
      ]);
      assert.deepEqual(
        concurrent.map((result) => result.isError),
        [undefined, undefined],
      );
      assert.deepEqual(
        concurrent.map((result) => result.structuredContent.revision).sort(),
        [2, 3],
      );
      const concurrentState = JSON.parse(
        await readFile(path.join(harness.dataRoot, "mcp-stdio-spike-state.json"), "utf8"),
      );
      assert.equal(concurrentState.revision, 3);
      assert.ok(["Concurrent note A.", "Concurrent note B."].includes(concurrentState.note));

      const invalid = await client.callTool({
        name: "open_deutsch_spike_write_note",
        arguments: { note: "" },
      });
      assert.equal(invalid.isError, true);
      assert.match(invalid.content[0].text, /Invalid arguments/i);

      await rm(harness.dataRoot, { recursive: true });
      for (const [name, arguments_] of [
        ["open_deutsch_spike_read_note", {}],
        ["open_deutsch_spike_write_note", { note: "Must not be written." }],
      ]) {
        const unavailable = await client.callTool({ name, arguments: arguments_ });
        assert.equal(unavailable.isError, true);
        assert.equal(
          unavailable.content[0].text,
          "OD_MCP_STALE_DATA_ROOT: The disposable MCP spike is unavailable.",
        );
      }
      assert.equal(await pathExists(path.join(harness.dataRoot, stateFilename)), false);
      await mkdir(harness.dataRoot, { mode: 0o700 });

      const bootstrap = JSON.parse(await readFile(harness.bootstrapFile, "utf8"));
      await writeFile(
        harness.bootstrapFile,
        `${JSON.stringify({ ...bootstrap, rootGeneration: bootstrap.rootGeneration + 1 })}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      const stale = await client.callTool({
        name: "open_deutsch_spike_read_note",
        arguments: {},
      });
      assert.equal(stale.isError, true);
      assert.deepEqual(stale.content, [
        {
          type: "text",
          text: "OD_MCP_STALE_DATA_ROOT: The disposable MCP spike is unavailable.",
        },
      ]);
    } finally {
      await client.close();
      assert.equal(transport.pid, null);
      assert.equal(stderr, "");
      await harness.cleanup();
    }
  },
);

test(
  "rejects relative, sibling, and learner roots without writing",
  { timeout: 10_000 },
  async () => {
    const harness = await createDisposableDataHarness();
    const siblingRoot = path.join(harness.sandboxRoot, "sibling");
    await mkdir(siblingRoot, { mode: 0o700 });
    const cases = [
      { name: "relative", dataRoot: ".", environmentRoot: repositoryRoot },
      { name: "sibling", dataRoot: siblingRoot, environmentRoot: siblingRoot },
      {
        name: "learner",
        dataRoot: process.env.OPEN_DEUTSCH_DATA_ROOT,
        environmentRoot: process.env.OPEN_DEUTSCH_DATA_ROOT,
      },
    ];

    try {
      for (const testCase of cases) {
        const protectedState = path.join(testCase.environmentRoot, stateFilename);
        assert.equal(await pathExists(protectedState), false, `${testCase.name} precondition`);
        await writeFile(
          harness.bootstrapFile,
          `${JSON.stringify({
            schemaVersion: 1,
            dataRoot: testCase.dataRoot,
            rootGeneration: 1,
            testRunId: harness.runId,
          })}\n`,
          { encoding: "utf8", mode: 0o600 },
        );
        const transport = new StdioClientTransport({
          command: process.execPath,
          args: [serverPath],
          cwd: repositoryRoot,
          env: {
            ...harness.environment(getDefaultEnvironment()),
            OPEN_DEUTSCH_MCP_SPIKE: "YES",
            OPEN_DEUTSCH_DATA_ROOT: testCase.environmentRoot,
          },
          stderr: "pipe",
        });
        const client = new Client({ name: "open-deutsch-root-rejection-test", version: "0.0.0" });
        try {
          await assert.rejects(client.connect(transport), /Connection closed/);
        } finally {
          await client.close();
        }
        assert.equal(transport.pid, null);
        assert.equal(await pathExists(protectedState), false, `${testCase.name} write`);
      }
    } finally {
      await harness.cleanup();
    }
  },
);

test("fails closed when the disposable bootstrap is unavailable", { timeout: 10_000 }, async () => {
  const harness = await createDisposableDataHarness();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: repositoryRoot,
    env: {
      ...harness.environment(getDefaultEnvironment()),
      OPEN_DEUTSCH_MCP_SPIKE: "YES",
      OPEN_DEUTSCH_BOOTSTRAP_FILE: path.join(harness.configRoot, "missing-bootstrap.json"),
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "open-deutsch-stdio-spike-test", version: "0.0.0" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await assert.rejects(client.connect(transport), /Connection closed/);
  } finally {
    await client.close();
    await delay(20);
    assert.equal(transport.pid, null);
    assert.equal(stderr, "OD_MCP_SPIKE_START_FAILED\n");
    await harness.cleanup();
  }
});
