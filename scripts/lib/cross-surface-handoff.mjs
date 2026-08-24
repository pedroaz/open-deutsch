import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const markerName = ".open-deutsch-test-ownership.json";
const sandboxPrefix = "open-deutsch-test-data-";
const trustedParents = new Set(["/tmp", "/var/tmp"]);
const activityIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const codexHandoffCapabilities = Object.freeze({
  exactTextThreadCreation: "app-server-thread-start",
  exactTextThreadResume: "codex-resume-thread-id",
  exactDesktopVoiceSessionOpen: null,
  blockerCode: "OD_HANDOFF_VOICE_SESSION_UNSUPPORTED",
});

export function parseOpenDeutschActivityUrl(value) {
  if (typeof value !== "string" || /\/(?:\.|%2e){2}(?:\/|$)/i.test(value)) {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
  let activityId;
  try {
    activityId = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
  if (
    url.protocol !== "open-deutsch:" ||
    url.hostname !== "activity" ||
    url.search !== "" ||
    url.hash !== "" ||
    !activityIdPattern.test(activityId)
  ) {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
  return { route: "activity", activityId };
}

export async function createDisposableHandoffStore(dataRoot) {
  const canonicalDataRoot = await realpath(dataRoot);
  const sandboxRoot = path.dirname(canonicalDataRoot);
  const marker = JSON.parse(await readFile(path.join(sandboxRoot, markerName), "utf8"));
  if (
    path.basename(canonicalDataRoot) !== "data" ||
    !path.basename(sandboxRoot).startsWith(sandboxPrefix) ||
    !trustedParents.has(await realpath(path.dirname(sandboxRoot))) ||
    typeof marker?.runId !== "string" ||
    marker.runId.length === 0
  ) {
    throw new Error("OD_HANDOFF_STORE_NOT_DISPOSABLE");
  }
  const statePath = path.join(canonicalDataRoot, "cross-surface-handoff-probe.json");
  const lockPath = `${statePath}.lock`;

  async function withWriteLock(operation) {
    const deadline = Date.now() + 2_000;
    while (true) {
      try {
        await mkdir(lockPath, { mode: 0o700 });
        break;
      } catch (error) {
        if (error?.code !== "EEXIST" || Date.now() >= deadline) {
          throw new Error("OD_HANDOFF_WRITE_LOCK_FAILED");
        }
        await delay(5);
      }
    }
    try {
      return await operation();
    } finally {
      await rm(lockPath, { recursive: true, force: true });
    }
  }

  async function readActivities() {
    try {
      const parsed = JSON.parse(await readFile(statePath, "utf8"));
      if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.activities)) {
        throw new Error("OD_HANDOFF_STATE_INVALID");
      }
      return parsed.activities;
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  return Object.freeze({
    async createFromMcp(activity) {
      if (
        !activity ||
        !activityIdPattern.test(activity.id) ||
        typeof activity.title !== "string" ||
        activity.title.trim().length === 0
      ) {
        throw new Error("OD_HANDOFF_ACTIVITY_INVALID");
      }
      return withWriteLock(async () => {
        const activities = await readActivities();
        if (activities.some((existing) => existing.id === activity.id)) {
          throw new Error("OD_HANDOFF_ACTIVITY_CONFLICT");
        }
        const created = { id: activity.id, title: activity.title.trim(), source: "mcp" };
        const next = { schemaVersion: 1, activities: [...activities, created] };
        const temporaryPath = `${statePath}.${process.pid}.next`;
        await writeFile(temporaryPath, `${JSON.stringify(next)}\n`, { mode: 0o600, flag: "wx" });
        await rename(temporaryPath, statePath);
        return created;
      });
    },
    readDashboard: readActivities,
  });
}
