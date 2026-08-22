import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { OpenDeutschError } from "@open-deutsch/contracts";
import { app } from "electron";

const execFileAsync = promisify(execFile);
const pluginName = "open-deutsch";
const marketplaceName = "open-deutsch-spike";
const pluginId = `${pluginName}@${marketplaceName}`;

type CodexIntegrationState =
  | {
      status: "unavailable";
      reason: "missing" | "unsupported-version" | "app-server-unavailable";
      error: OpenDeutschError;
    }
  | {
      status: "available";
      codexVersion: string;
      plugin: "not-installed" | "installed" | "refresh-required";
    };

type PluginAction = "install" | "refresh" | "uninstall";
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function executable() {
  return process.env["OPEN_DEUTSCH_CODEX_EXECUTABLE"] ?? "codex";
}

function marketplaceRoot() {
  return path.resolve(process.env["OPEN_DEUTSCH_PLUGIN_MARKETPLACE_ROOT"] ?? process.cwd());
}

function manifestCandidates() {
  return [
    process.env["OPEN_DEUTSCH_PLUGIN_MANIFEST"],
    app.isPackaged
      ? process.resourcesPath
        ? path.join(process.resourcesPath, "plugin", ".codex-plugin", "plugin.json")
        : undefined
      : undefined,
    path.resolve(process.cwd(), "plugins/open-deutsch/.codex-plugin/plugin.json"),
  ].filter((candidate): candidate is string => candidate !== undefined);
}

async function sourceVersion() {
  for (const candidate of manifestCandidates()) {
    try {
      const manifest: unknown = JSON.parse(await readFile(candidate, "utf8")) as unknown;
      if (
        isRecord(manifest) &&
        manifest["name"] === pluginName &&
        typeof manifest["version"] === "string" &&
        /^\d+\.\d+\.\d+$/u.test(manifest["version"])
      ) {
        return manifest["version"];
      }
    } catch {
      // Try the next packaged/development location without exposing filesystem details.
    }
  }
  throw new Error("OD_PLUGIN_SOURCE_UNAVAILABLE");
}

async function jsonCommand(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync(executable(), [...args, "--json"], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    throw new Error("OD_PLUGIN_CLI_JSON_INVALID");
  }
}

export async function readPluginIntegrationState(
  codexVersion: string,
  correlationId: string,
): Promise<CodexIntegrationState> {
  void correlationId;
  try {
    const version = await sourceVersion();
    const [plugins, mcp] = await Promise.all([
      jsonCommand(["plugin", "list"]),
      jsonCommand(["mcp", "list"]),
    ]);
    const installed =
      isRecord(plugins) && Array.isArray(plugins["installed"])
        ? plugins["installed"].find(
            (entry): entry is JsonRecord => isRecord(entry) && entry["pluginId"] === pluginId,
          )
        : undefined;
    const server = Array.isArray(mcp)
      ? mcp.find((entry): entry is JsonRecord => isRecord(entry) && entry["name"] === pluginName)
      : undefined;
    const plugin =
      installed === undefined
        ? "not-installed"
        : installed["version"] !== version || server?.["enabled"] !== true
          ? "refresh-required"
          : "installed";
    return { status: "available", codexVersion, plugin };
  } catch {
    return { status: "available", codexVersion, plugin: "refresh-required" };
  }
}

export async function runPluginIntegrationAction(
  action: PluginAction,
  codexVersion: string,
  correlationId: string,
) {
  const version = await sourceVersion();
  const steps: string[] = [];
  try {
    if (action === "uninstall") {
      await jsonCommand(["plugin", "remove", pluginId]);
      steps.push("Removed the Open Deutsch plugin from the scoped marketplace.");
      await execFileAsync(
        executable(),
        ["plugin", "marketplace", "remove", marketplaceName, "--json"],
        {
          cwd: process.cwd(),
          env: process.env,
          timeout: 20_000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      steps.push("Removed the scoped Open Deutsch marketplace entry.");
    } else {
      await jsonCommand(["plugin", "marketplace", "add", marketplaceRoot()]);
      steps.push("Registered the versioned repository-scoped marketplace source.");
      await jsonCommand(["plugin", "add", pluginId]);
      steps.push(`${action === "refresh" ? "Refreshed" : "Installed"} Open Deutsch ${version}.`);
    }
    const status = await readPluginIntegrationState(codexVersion, correlationId);
    const verified =
      status.status === "available" &&
      (action === "uninstall" ? status.plugin === "not-installed" : status.plugin === "installed");
    steps.push(
      verified
        ? "Verified the plugin and MCP status."
        : "The requested action needs another refresh or could not be verified.",
    );
    return {
      action,
      result: verified ? "verified" : action === "uninstall" ? "missing" : "failed",
      sourceVersion: version,
      status,
      steps,
    } as const;
  } catch {
    return {
      action,
      result: "failed" as const,
      sourceVersion: version,
      status: { status: "available" as const, codexVersion, plugin: "refresh-required" as const },
      steps: [...steps, "The scoped integration command failed; no success is reported."],
    };
  }
}
