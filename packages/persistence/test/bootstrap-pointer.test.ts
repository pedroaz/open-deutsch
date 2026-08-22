import {
  chmod,
  mkdir,
  readFile,
  readdir,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  assertCurrentDataRootLease,
  dataRootManifestSchema,
  readBootstrapPointer,
  resolveDataRootLayout,
  writeBootstrapPointer,
} from "../src/index.js";

const factory = createDeterministicContractFactory();

async function writeManifest(dataRoot: string, generation: number) {
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  const layout = resolveDataRootLayout(dataRoot);
  const manifest = dataRootManifestSchema.parse({
    schemaVersion: 1,
    kind: "open-deutsch-data-root",
    dataRootFormatVersion: 1,
    generation,
    createdAt: factory.nextInstant(),
  });
  await writeFile(layout.manifest, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
}

describe("versioned bootstrap pointer", () => {
  it("atomically selects a canonical root with private metadata only", async ({
    disposableData,
  }) => {
    const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "selected.json");
    await writeManifest(disposableData.dataRoot, 1);
    const pointer = await writeBootstrapPointer({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      expectedGeneration: null,
      selectedAt: factory.nextInstant(),
    });
    expect(pointer.rootGeneration).toBe(1);
    expect(await readBootstrapPointer(bootstrapFile)).toEqual({
      status: "ready",
      dataRoot: disposableData.dataRoot,
      rootGeneration: 1,
      dataRootFormatVersion: 1,
    });
    expect((await stat(bootstrapFile)).mode & 0o777).toBe(0o600);
    const names = await readdir(path.dirname(bootstrapFile));
    expect(names.some((name) => name.endsWith(".next") || name.endsWith(".lock"))).toBe(false);
    const serialized = await readFile(bootstrapFile, "utf8");
    expect(serialized).not.toMatch(/learner|token|credential|history|email|codexHome/iu);
  });

  it("classifies missing, malformed, unavailable, and mismatched targets without guessing", async ({
    disposableData,
  }) => {
    const directory = path.join(disposableData.configRoot, "pointer-states");
    await mkdir(directory, { mode: 0o700 });
    const missingPointer = path.join(directory, "missing.json");
    expect(await readBootstrapPointer(missingPointer)).toEqual({ status: "unconfigured" });

    const malformedPointer = path.join(directory, "malformed.json");
    await writeFile(malformedPointer, "not-json\n", { mode: 0o600 });
    expect(await readBootstrapPointer(malformedPointer)).toEqual({ status: "pointer-invalid" });

    const targetMissingPointer = path.join(directory, "target-missing.json");
    await writeFile(
      targetMissingPointer,
      `${JSON.stringify({
        schemaVersion: 1,
        dataRoot: path.join(disposableData.sandboxRoot, "gone"),
        rootGeneration: 2,
        dataRootFormatVersion: 1,
        selectedAt: factory.nextInstant(),
      })}\n`,
      { mode: 0o600 },
    );
    expect(await readBootstrapPointer(targetMissingPointer)).toEqual({
      status: "target-unavailable",
      reason: "missing",
      rootGeneration: 2,
    });

    const mismatchPointer = path.join(directory, "mismatch.json");
    await writeManifest(disposableData.dataRoot, 3);
    await writeFile(
      mismatchPointer,
      `${JSON.stringify({
        schemaVersion: 1,
        dataRoot: disposableData.dataRoot,
        rootGeneration: 4,
        dataRootFormatVersion: 1,
        selectedAt: factory.nextInstant(),
      })}\n`,
      { mode: 0o600 },
    );
    expect(await readBootstrapPointer(mismatchPointer)).toEqual({
      status: "generation-mismatch",
      rootGeneration: 4,
    });
  });

  it("switches with optimistic generation and makes old MCP leases stale", async ({
    disposableData,
  }) => {
    const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "switch.json");
    await writeManifest(disposableData.dataRoot, 1);
    await writeBootstrapPointer({
      bootstrapFile,
      dataRoot: disposableData.dataRoot,
      expectedGeneration: null,
      selectedAt: factory.nextInstant(),
    });

    const secondRoot = path.join(disposableData.sandboxRoot, "second-data");
    await writeManifest(secondRoot, 2);
    await writeBootstrapPointer({
      bootstrapFile,
      dataRoot: secondRoot,
      expectedGeneration: 1,
      selectedAt: factory.nextInstant(),
    });

    await expect(
      assertCurrentDataRootLease({
        bootstrapFile,
        dataRoot: disposableData.dataRoot,
        rootGeneration: 1,
      }),
    ).rejects.toThrow("OD_DATA_ROOT_STALE");
    await expect(
      assertCurrentDataRootLease({ bootstrapFile, dataRoot: secondRoot, rootGeneration: 2 }),
    ).resolves.toBeUndefined();
    await expect(
      writeBootstrapPointer({
        bootstrapFile,
        dataRoot: secondRoot,
        expectedGeneration: 1,
        selectedAt: factory.nextInstant(),
      }),
    ).rejects.toThrow("OD_BOOTSTRAP_GENERATION_CONFLICT");
  });

  it("fails closed on an active writer lock and preserves the selected root", async ({
    disposableData,
  }) => {
    const bootstrapFile = path.join(disposableData.configRoot, "open-deutsch", "locked.json");
    await writeManifest(disposableData.dataRoot, 1);
    const lockFile = `${bootstrapFile}.lock`;
    await writeFile(lockFile, "held\n", { mode: 0o600 });
    await expect(
      writeBootstrapPointer({
        bootstrapFile,
        dataRoot: disposableData.dataRoot,
        expectedGeneration: null,
        selectedAt: factory.nextInstant(),
      }),
    ).rejects.toThrow("OD_BOOTSTRAP_WRITE_BUSY");
    expect(await readBootstrapPointer(bootstrapFile)).toEqual({ status: "unconfigured" });
    await unlink(lockFile);
  });

  it("rejects a group- or world-writable bootstrap directory", async ({ disposableData }) => {
    const directory = path.join(disposableData.configRoot, "unsafe-open-deutsch");
    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o777);
    const bootstrapFile = path.join(directory, "selected.json");
    await writeManifest(disposableData.dataRoot, 1);
    await expect(
      writeBootstrapPointer({
        bootstrapFile,
        dataRoot: disposableData.dataRoot,
        expectedGeneration: null,
        selectedAt: factory.nextInstant(),
      }),
    ).rejects.toThrow("OD_BOOTSTRAP_DIRECTORY_UNSAFE");
    expect(await readdir(directory)).toEqual([]);
  });

  it("rejects symlink targets and unknown or sensitive pointer metadata", async ({
    disposableData,
  }) => {
    const directory = path.join(disposableData.configRoot, "pointer-adversarial");
    await mkdir(directory, { mode: 0o700 });
    await writeManifest(disposableData.dataRoot, 1);
    const linkedRoot = path.join(disposableData.sandboxRoot, "linked-data");
    await symlink(disposableData.dataRoot, linkedRoot);
    const linkedPointer = path.join(directory, "linked.json");
    await writeFile(
      linkedPointer,
      `${JSON.stringify({
        schemaVersion: 1,
        dataRoot: linkedRoot,
        rootGeneration: 1,
        dataRootFormatVersion: 1,
        selectedAt: factory.nextInstant(),
      })}\n`,
      { mode: 0o600 },
    );
    expect(await readBootstrapPointer(linkedPointer)).toEqual({
      status: "target-unavailable",
      reason: "non-canonical",
      rootGeneration: 1,
    });

    const sensitivePointer = path.join(directory, "sensitive.json");
    await writeFile(
      sensitivePointer,
      `${JSON.stringify({
        schemaVersion: 1,
        dataRoot: disposableData.dataRoot,
        rootGeneration: 1,
        dataRootFormatVersion: 1,
        selectedAt: factory.nextInstant(),
        learnerName: "Private learner",
        accessToken: "secret",
      })}\n`,
      { mode: 0o600 },
    );
    expect(await readBootstrapPointer(sensitivePointer)).toEqual({ status: "pointer-invalid" });
  });
});
