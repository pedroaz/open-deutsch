import { readdirSync } from "node:fs";
import path from "node:path";

const runnableSourceExtension = /(?<!\.d)\.(?:c|m)?(?:j|t)sx?$/u;

function containsFile(directory, predicate) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  return entries.some((entry) =>
    entry.isDirectory()
      ? containsFile(path.join(directory, entry.name), predicate)
      : entry.isFile() && predicate(entry.name),
  );
}

export function allowsNoTestsForEmptyProject(projectRoot) {
  return !containsFile(path.join(projectRoot, "src"), (name) => runnableSourceExtension.test(name));
}

export function assertVitestProjectReady(projectRoot, { allowEmptySkeleton = false } = {}) {
  const hasSource = !allowsNoTestsForEmptyProject(projectRoot);
  const hasTests = containsFile(
    path.join(projectRoot, "test"),
    (name) => name.includes(".test.") && runnableSourceExtension.test(name),
  );
  if (hasSource && !hasTests) {
    throw new Error(
      `[VITEST_PROJECT_MISSING_TESTS] ${projectRoot} has runnable source but no package-local tests.`,
    );
  }
  if (!hasSource && !allowEmptySkeleton) {
    throw new Error(
      `[VITEST_PROJECT_MISSING_SOURCE] ${projectRoot} is not an allowed empty skeleton.`,
    );
  }
  return { hasSource, hasTests };
}
