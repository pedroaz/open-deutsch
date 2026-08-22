import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import { scrubCodexEnvironment } from "./environment.js";

const execFileAsync = promisify(execFile);
const codexVersionPattern = /^(?:codex-cli\s+|v)?(\d+)\.(\d+)\.(\d+)$/u;

export const supportedCodexVersion = Object.freeze({
  minimum: "0.146.0",
  maximumExclusive: "0.146.1",
});

export type CodexDiscovery =
  | Readonly<{ status: "available"; version: string }>
  | Readonly<{
      status: "unavailable";
      reason: "missing" | "unsupported-version" | "app-server-unavailable";
    }>;

function versionTuple(value: string): readonly [number, number, number] | undefined {
  const match = codexVersionPattern.exec(value.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function classifyCodexVersion(rawVersion: string): CodexDiscovery {
  const observed = versionTuple(rawVersion);
  const minimum = versionTuple(supportedCodexVersion.minimum);
  const maximum = versionTuple(supportedCodexVersion.maximumExclusive);
  if (
    !observed ||
    !minimum ||
    !maximum ||
    compare(observed, minimum) < 0 ||
    compare(observed, maximum) >= 0
  ) {
    return Object.freeze({ status: "unavailable", reason: "unsupported-version" });
  }
  return Object.freeze({
    status: "available",
    version: rawVersion.trim().replace(/^(?:codex-cli\s+|v)/u, ""),
  });
}

async function executableCandidate(path: string): Promise<string | undefined> {
  try {
    const canonical = await realpath(path);
    const information = await stat(canonical);
    if (!information.isFile()) return undefined;
    await access(canonical, constants.X_OK);
    return canonical;
  } catch {
    return undefined;
  }
}

export async function resolveCodexExecutable(
  configured: string | undefined,
  environment: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (configured !== undefined) {
    if (!isAbsolute(configured)) return undefined;
    return executableCandidate(configured);
  }
  const path = environment["PATH"];
  if (!path) return undefined;
  for (const directory of path.split(delimiter)) {
    if (!directory || !isAbsolute(directory)) continue;
    const candidate = await executableCandidate(join(directory, "codex"));
    if (candidate) return candidate;
  }
  return undefined;
}

export async function discoverCodex(
  options: {
    executable?: string;
    timeoutMilliseconds?: number;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<CodexDiscovery> {
  const timeout = options.timeoutMilliseconds ?? 3_000;
  const environment = scrubCodexEnvironment(options.environment ?? process.env);
  const executable = await resolveCodexExecutable(options.executable, environment);
  if (!executable) return Object.freeze({ status: "unavailable", reason: "missing" });
  let versionOutput: string;
  try {
    const result = await execFileAsync(executable, ["--version"], {
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      env: environment,
      maxBuffer: 16 * 1024,
    });
    versionOutput = result.stdout;
  } catch (error) {
    const code =
      error && typeof error === "object" ? (error as NodeJS.ErrnoException).code : undefined;
    return Object.freeze({
      status: "unavailable",
      reason: code === "ENOENT" ? "missing" : "app-server-unavailable",
    });
  }
  const version = classifyCodexVersion(versionOutput);
  if (version.status === "unavailable") return version;
  try {
    await execFileAsync(executable, ["app-server", "--help"], {
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      env: environment,
      maxBuffer: 64 * 1024,
    });
    return version;
  } catch {
    return Object.freeze({ status: "unavailable", reason: "app-server-unavailable" });
  }
}
