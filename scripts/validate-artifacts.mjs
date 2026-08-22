#!/usr/bin/env node

import { validateRepositoryArtifacts } from "./lib/artifact-validation.mjs";

try {
  const result = await validateRepositoryArtifacts();
  process.stdout.write(
    `[PASS] ARTIFACTS_VALID: ${result.filesChecked} repository artifacts checked.\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
