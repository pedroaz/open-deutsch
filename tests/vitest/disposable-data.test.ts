import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { createDisposableDataHarness, disposablePermissions } from "../support/disposable-data.mjs";

describe("disposable learner-data harness", () => {
  test("gives every test a private root and matching bootstrap pointer", async ({
    disposableData,
  }) => {
    expect(disposableData.dataRoot).toContain(disposableData.sandboxRoot);
    expect(disposableData.bootstrapFile).toContain(disposableData.sandboxRoot);
    expect(process.env["OPEN_DEUTSCH_DATA_ROOT"]).toBe(disposableData.dataRoot);
    expect(process.env["OPEN_DEUTSCH_BOOTSTRAP_FILE"]).toBe(disposableData.bootstrapFile);
    expect(process.env["XDG_CONFIG_HOME"]).toBe(disposableData.configRoot);
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        "process.stdout.write(JSON.stringify({dataRoot:process.env.OPEN_DEUTSCH_DATA_ROOT,bootstrapFile:process.env.OPEN_DEUTSCH_BOOTSTRAP_FILE}))",
      ],
      { encoding: "utf8", env: process.env },
    );
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout) as unknown).toEqual({
      dataRoot: disposableData.dataRoot,
      bootstrapFile: disposableData.bootstrapFile,
    });
    const bootstrap: unknown = JSON.parse(await readFile(disposableData.bootstrapFile, "utf8"));
    expect(bootstrap).toEqual(disposableData.bootstrap);
    expect(await disposablePermissions(disposableData)).toEqual({
      dataRoot: 0o700,
      configRoot: 0o700,
      bootstrapFile: 0o600,
    });
  });

  test("creates unique roots and cleans only its exact owned sandbox", async ({
    disposableData,
  }) => {
    const second = await createDisposableDataHarness();
    expect(second.runId).not.toBe(disposableData.runId);
    expect(second.dataRoot).not.toBe(disposableData.dataRoot);
    const removedRoot = second.sandboxRoot;
    await second.cleanup();
    await second.cleanup();
    await expect(stat(removedRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(disposableData.dataRoot)).resolves.toBeDefined();
  });

  test("overrides poisoned learner paths without reading or mutating them", async ({
    disposableData,
  }) => {
    const apparentLearnerRoot = await mkdtemp(path.join(tmpdir(), "open-deutsch-real-looking-"));
    const sentinel = path.join(apparentLearnerRoot, "do-not-touch.txt");
    try {
      await writeFile(sentinel, "learner-owned\n", { mode: 0o600 });

      const environment = disposableData.environment({
        OPEN_DEUTSCH_DATA_ROOT: apparentLearnerRoot,
        OPEN_DEUTSCH_BOOTSTRAP_FILE: path.join(apparentLearnerRoot, "bootstrap.json"),
        XDG_CONFIG_HOME: apparentLearnerRoot,
      });
      expect(environment["OPEN_DEUTSCH_DATA_ROOT"]).toBe(disposableData.dataRoot);
      expect(environment["OPEN_DEUTSCH_BOOTSTRAP_FILE"]).toBe(disposableData.bootstrapFile);
      expect(environment["XDG_CONFIG_HOME"]).toBe(disposableData.configRoot);

      const resolvedDataRoot = environment["OPEN_DEUTSCH_DATA_ROOT"];
      if (!resolvedDataRoot) throw new Error("Disposable data environment omitted its data root.");
      await writeFile(path.join(resolvedDataRoot, "test-write.txt"), "safe\n");
      expect(await readFile(sentinel, "utf8")).toBe("learner-owned\n");
      await expect(stat(path.join(apparentLearnerRoot, "bootstrap.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(apparentLearnerRoot, { recursive: true });
    }
  });
});
