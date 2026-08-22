import { readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod/v4";

const serverName = "open-deutsch-stdio-spike";
const serverVersion = "0.0.0";
const stateFilename = "mcp-stdio-spike-state.json";
const ownershipMarker = ".open-deutsch-test-ownership.json";
const disposableSandboxPrefix = "open-deutsch-test-data-";
const trustedTemporaryParents = new Set(["/tmp", "/var/tmp"]);

type Bootstrap = {
  schemaVersion: 1;
  dataRoot: string;
  rootGeneration: number;
  testRunId: string;
};

type SpikeState = {
  schemaVersion: 1;
  note: string | null;
  revision: number;
};

export function isContained(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function readBootstrap(bootstrapFile: string): Promise<Bootstrap> {
  const parsed: unknown = JSON.parse(await readFile(bootstrapFile, "utf8"));
  const record = parsed as Record<string, unknown>;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    record["schemaVersion"] !== 1 ||
    typeof record["dataRoot"] !== "string" ||
    !path.isAbsolute(record["dataRoot"]) ||
    !Number.isSafeInteger(record["rootGeneration"]) ||
    (record["rootGeneration"] as number) < 1 ||
    typeof record["testRunId"] !== "string" ||
    record["testRunId"].trim().length === 0
  ) {
    throw new Error("OD_MCP_SPIKE_BOOTSTRAP_INVALID");
  }
  return parsed as Bootstrap;
}

async function readState(statePath: string): Promise<SpikeState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(statePath, "utf8"));
    const record = parsed as Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      record["schemaVersion"] !== 1 ||
      (record["note"] !== null && typeof record["note"] !== "string") ||
      !Number.isSafeInteger(record["revision"]) ||
      (record["revision"] as number) < 0
    ) {
      throw new Error("OD_MCP_SPIKE_STATE_INVALID");
    }
    return parsed as SpikeState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, note: null, revision: 0 };
    }
    throw error;
  }
}

async function writeState(statePath: string, state: SpikeState) {
  const temporaryPath = `${statePath}.next`;
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, statePath);
}

function toolError(code: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${code}: The disposable MCP spike is unavailable.` }],
  };
}

async function main() {
  if (process.env["OPEN_DEUTSCH_MCP_SPIKE"] !== "YES") {
    throw new Error("OD_MCP_SPIKE_NOT_ENABLED");
  }
  const bootstrapFile = process.env["OPEN_DEUTSCH_BOOTSTRAP_FILE"] ?? "";
  if (!path.isAbsolute(bootstrapFile)) {
    throw new Error("OD_MCP_SPIKE_BOOTSTRAP_INVALID");
  }
  const startupBootstrap = await readBootstrap(bootstrapFile);
  const expectedRunId = process.env["OPEN_DEUTSCH_TEST_RUN_ID"] ?? "";
  if (
    process.env["OPEN_DEUTSCH_TEST_MODE"] !== "1" ||
    expectedRunId.length === 0 ||
    startupBootstrap.testRunId !== expectedRunId
  ) {
    throw new Error("OD_MCP_SPIKE_OWNERSHIP_INVALID");
  }
  const configuredDataRoot = process.env["OPEN_DEUTSCH_DATA_ROOT"] ?? "";
  if (!path.isAbsolute(configuredDataRoot)) {
    throw new Error("OD_MCP_SPIKE_DATA_ROOT_INVALID");
  }
  const [canonicalBootstrapFile, canonicalDataRoot] = await Promise.all([
    realpath(bootstrapFile),
    realpath(startupBootstrap.dataRoot),
  ]);
  if ((await realpath(configuredDataRoot)) !== canonicalDataRoot) {
    throw new Error("OD_MCP_SPIKE_DATA_ROOT_INVALID");
  }
  const sandboxRoot = path.dirname(canonicalDataRoot);
  const expectedBootstrapFile = path.join(sandboxRoot, "config", "open-deutsch", "bootstrap.json");
  const canonicalTemporaryParent = await realpath(path.dirname(sandboxRoot));
  const markerPath = path.join(sandboxRoot, ownershipMarker);
  const marker: unknown = JSON.parse(await readFile(markerPath, "utf8"));
  if (
    path.basename(canonicalDataRoot) !== "data" ||
    !path.basename(sandboxRoot).startsWith(disposableSandboxPrefix) ||
    !trustedTemporaryParents.has(canonicalTemporaryParent) ||
    canonicalBootstrapFile !== expectedBootstrapFile ||
    !marker ||
    typeof marker !== "object" ||
    (marker as Record<string, unknown>)["runId"] !== expectedRunId
  ) {
    throw new Error("OD_MCP_SPIKE_OWNERSHIP_INVALID");
  }
  const statePath = path.join(canonicalDataRoot, stateFilename);
  if (!isContained(canonicalDataRoot, statePath)) {
    throw new Error("OD_MCP_SPIKE_STATE_PATH_INVALID");
  }

  async function currentRootIsValid() {
    try {
      const current = await readBootstrap(bootstrapFile);
      const [currentRoot, rootMetadata, currentMarker] = await Promise.all([
        realpath(current.dataRoot),
        stat(current.dataRoot),
        readFile(markerPath, "utf8").then((value) => JSON.parse(value) as unknown),
      ]);
      return (
        current.rootGeneration === startupBootstrap.rootGeneration &&
        current.testRunId === expectedRunId &&
        currentRoot === canonicalDataRoot &&
        rootMetadata.isDirectory() &&
        !!currentMarker &&
        typeof currentMarker === "object" &&
        (currentMarker as Record<string, unknown>)["runId"] === expectedRunId
      );
    } catch {
      return false;
    }
  }

  function createServer() {
    let writeQueue = Promise.resolve();
    function serializeWrite<T>(operation: () => Promise<T>) {
      const pending = writeQueue.then(operation, operation);
      writeQueue = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    }
    const server = new McpServer(
      { name: serverName, version: serverVersion },
      {
        instructions: "Disposable protocol spike only. Read the note before writing a replacement.",
      },
    );
    const outputSchema = z.object({
      note: z.string().nullable(),
      revision: z.number().int().nonnegative(),
    });

    server.registerTool(
      "open_deutsch_spike_read_note",
      {
        title: "Read disposable spike note",
        description: "Read the current note from the disposable Open Deutsch MCP spike.",
        inputSchema: z.object({}),
        outputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
        if (!(await currentRootIsValid())) return toolError("OD_MCP_STALE_DATA_ROOT");
        try {
          const state = await readState(statePath);
          return {
            content: [
              {
                type: "text",
                text:
                  state.note === null
                    ? "No disposable spike note has been saved."
                    : `Disposable spike note revision ${String(state.revision)}: ${state.note}`,
              },
            ],
            structuredContent: { note: state.note, revision: state.revision },
          };
        } catch {
          return toolError("OD_MCP_SPIKE_READ_FAILED");
        }
      },
    );

    server.registerTool(
      "open_deutsch_spike_write_note",
      {
        title: "Write disposable spike note",
        description: "Replace the note in the disposable Open Deutsch MCP spike.",
        inputSchema: z.object({ note: z.string().trim().min(1).max(200) }),
        outputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ note }) => {
        return serializeWrite(async () => {
          if (!(await currentRootIsValid())) return toolError("OD_MCP_STALE_DATA_ROOT");
          try {
            const previous = await readState(statePath);
            const next = {
              schemaVersion: 1 as const,
              note,
              revision: previous.revision + 1,
            };
            await writeState(statePath, next);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Saved disposable spike note revision ${String(next.revision)}.`,
                },
              ],
              structuredContent: { note: next.note, revision: next.revision },
            };
          } catch {
            return toolError("OD_MCP_SPIKE_WRITE_FAILED");
          }
        });
      },
    );
    return server;
  }

  const handle = serveStdio(createServer, {
    onerror: () => process.stderr.write("OD_MCP_SPIKE_PROTOCOL_ERROR\n"),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void handle.close().finally(() => {
        process.exitCode = 0;
      });
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(() => {
    process.stderr.write("OD_MCP_SPIKE_START_FAILED\n");
    process.exitCode = 1;
  });
}
