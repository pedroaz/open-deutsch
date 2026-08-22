import path from "node:path";
import { expect, test } from "vitest";

import { importTimeDataEnvironment } from "../fixtures/import-time-data-environment.js";

test("module imports resolve only the disposable worker environment", ({ disposableData }) => {
  const importSandbox = path.dirname(importTimeDataEnvironment.dataRoot ?? "");
  expect(path.basename(importSandbox)).toMatch(/^open-deutsch-test-data-/);
  expect(importTimeDataEnvironment.bootstrapFile).toMatch(importSandbox);
  expect(importTimeDataEnvironment.configRoot).toMatch(importSandbox);
  expect(importTimeDataEnvironment.dataRoot).not.toContain(
    process.env["OPEN_DEUTSCH_TEST_POISON_ROOT"] ?? "path-cannot-match-empty-poison",
  );
  expect(importTimeDataEnvironment.dataRoot).not.toBe(disposableData.dataRoot);
  expect(process.env["OPEN_DEUTSCH_DATA_ROOT"]).toBe(disposableData.dataRoot);
});
