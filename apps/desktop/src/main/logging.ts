import { appendFile, mkdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { AppServerLogRecord } from "@open-deutsch/codex-client";
import { readBootstrapPointer, resolveDataRootLayout } from "@open-deutsch/persistence";

const maximumLogBytes = 5 * 1024 * 1024;
const retainedLogFiles = 10;

async function rotateIfNeeded(logFile: string): Promise<void> {
  const current = await stat(logFile).catch(() => undefined);
  if (!current || current.size < maximumLogBytes) return;
  await rm(`${logFile}.${String(retainedLogFiles - 1)}`, { force: true });
  for (let index = retainedLogFiles - 2; index >= 1; index -= 1) {
    await rename(`${logFile}.${String(index)}`, `${logFile}.${String(index + 1)}`).catch(
      (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      },
    );
  }
  await rename(logFile, `${logFile}.1`);
}

function safeMetadata(metadata: AppServerLogRecord["metadata"]): string {
  if (!metadata) return "";
  const allowed = Object.entries(metadata)
    .filter(
      ([key, value]) =>
        /^(?:code|reason|version|exitCode|signal|stderrBytes|stderrTruncated)$/u.test(key) &&
        (typeof value === "string" || typeof value === "number" || typeof value === "boolean"),
    )
    .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 200) : value]);
  return allowed.length > 0 ? ` metadata=${JSON.stringify(Object.fromEntries(allowed))}` : "";
}

function safeCorrelationId(value: string | undefined): string {
  return value && /^[A-Za-z0-9][A-Za-z0-9_-]{7,199}$/u.test(value) ? value : "-";
}

export async function appendDesktopLog(
  bootstrapFile: string,
  record: AppServerLogRecord,
): Promise<void> {
  const pointer = await readBootstrapPointer(bootstrapFile);
  if (pointer.status !== "ready") return;
  const logs = resolveDataRootLayout(pointer.dataRoot).logs;
  await mkdir(logs, { recursive: true, mode: 0o700 });
  if ((await realpath(logs)) !== logs) throw new Error("OD_LOG_DIRECTORY_INVALID");
  const logFile = path.join(logs, "desktop-app-server.log");
  await rotateIfNeeded(logFile);
  const line = `${record.timestamp} ${record.severity.toUpperCase()} ${record.component} ${record.code} correlation=${safeCorrelationId(record.correlationId)}${safeMetadata(record.metadata)} ${record.message}\n`;
  await appendFile(logFile, line, { encoding: "utf8", mode: 0o600 });
}
