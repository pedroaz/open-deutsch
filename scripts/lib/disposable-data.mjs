import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const sandboxPrefix = "open-deutsch-test-data-";
const ownershipMarker = ".open-deutsch-test-ownership.json";
const trustedTemporaryCandidates = ["/tmp", "/var/tmp"];

function containsPath(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function canonicalizeIfPresent(candidate) {
  try {
    return await realpath(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

async function trustedTemporaryParent() {
  const configuredPaths = [
    process.env.OPEN_DEUTSCH_DATA_ROOT,
    process.env.XDG_CONFIG_HOME,
    process.env.OPEN_DEUTSCH_BOOTSTRAP_FILE
      ? path.dirname(process.env.OPEN_DEUTSCH_BOOTSTRAP_FILE)
      : undefined,
  ].filter((candidate) => candidate !== undefined);
  const unsafeRoots = await Promise.all(configuredPaths.map(canonicalizeIfPresent));

  for (const candidate of trustedTemporaryCandidates) {
    try {
      const canonicalCandidate = await realpath(candidate);
      const candidateStat = await stat(canonicalCandidate);
      if (
        candidateStat.isDirectory() &&
        !unsafeRoots.some((unsafeRoot) => containsPath(unsafeRoot, canonicalCandidate))
      ) {
        return canonicalCandidate;
      }
    } catch {
      // Try the next fixed system temporary directory.
    }
  }
  throw new Error(
    "No trusted system temporary directory is isolated from configured learner paths.",
  );
}

async function writePrivateJson(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}

export async function createDisposableDataHarness() {
  const runId = randomUUID();
  const temporaryParent = await trustedTemporaryParent();
  const sandboxRoot = await mkdtemp(path.join(temporaryParent, sandboxPrefix));
  const dataRoot = path.join(sandboxRoot, "data");
  const configRoot = path.join(sandboxRoot, "config");
  const bootstrapDirectory = path.join(configRoot, "open-deutsch");
  const bootstrapFile = path.join(bootstrapDirectory, "bootstrap.json");
  await mkdir(dataRoot, { mode: 0o700 });
  await mkdir(bootstrapDirectory, { recursive: true, mode: 0o700 });

  const bootstrap = {
    schemaVersion: 1,
    dataRoot,
    rootGeneration: 1,
    testRunId: runId,
  };
  await writePrivateJson(path.join(sandboxRoot, ownershipMarker), { runId });
  await writePrivateJson(bootstrapFile, bootstrap);

  let cleaned = false;
  return {
    runId,
    sandboxRoot,
    dataRoot,
    configRoot,
    bootstrapFile,
    bootstrap,
    environment(inherited = {}) {
      return {
        ...inherited,
        OPEN_DEUTSCH_TEST_MODE: "1",
        OPEN_DEUTSCH_TEST_RUN_ID: runId,
        OPEN_DEUTSCH_DATA_ROOT: dataRoot,
        OPEN_DEUTSCH_BOOTSTRAP_FILE: bootstrapFile,
        XDG_CONFIG_HOME: configRoot,
      };
    },
    async cleanup() {
      if (cleaned) return;
      const marker = JSON.parse(await readFile(path.join(sandboxRoot, ownershipMarker), "utf8"));
      if (
        marker?.runId !== runId ||
        path.dirname(sandboxRoot) !== temporaryParent ||
        !path.basename(sandboxRoot).startsWith(sandboxPrefix)
      ) {
        throw new Error("Refusing to clean a disposable data root without exact ownership.");
      }
      await rm(sandboxRoot, { recursive: true });
      cleaned = true;
    },
  };
}

export async function disposablePermissions(harness) {
  const [data, config, bootstrap] = await Promise.all([
    stat(harness.dataRoot),
    stat(harness.configRoot),
    stat(harness.bootstrapFile),
  ]);
  return {
    dataRoot: data.mode & 0o777,
    configRoot: config.mode & 0o777,
    bootstrapFile: bootstrap.mode & 0o777,
  };
}
