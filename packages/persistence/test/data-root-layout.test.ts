import path from "node:path";

import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  dataRootDirectories,
  dataRootManifestSchema,
  dataRootRelativeLayout,
  operationalLogPolicy,
  resolveDataRootLayout,
} from "../src/index.js";

const factory = createDeterministicContractFactory();

describe("self-contained data-root layout", () => {
  it("resolves every stable artifact beneath one absolute root", () => {
    const root = "/tmp/open-deutsch-layout-test/data";
    const layout = resolveDataRootLayout(root);
    expect(layout).toEqual({
      dataRoot: root,
      manifest: `${root}/.open-deutsch-root.json`,
      database: `${root}/open-deutsch.sqlite3`,
      attachments: `${root}/attachments`,
      researchStaging: `${root}/research/staging`,
      researchCache: `${root}/research/cache`,
      logs: `${root}/logs`,
      diagnostics: `${root}/diagnostics/redacted`,
      testData: `${root}/test-data`,
    });
    for (const candidate of Object.values(layout).slice(1)) {
      const relative = path.relative(root, candidate);
      expect(relative.startsWith("..")).toBe(false);
      expect(path.isAbsolute(relative)).toBe(false);
    }
    expect(Object.isFrozen(layout)).toBe(true);
  });

  it("defines a strict versioned root identity and generation manifest", () => {
    const manifest = {
      schemaVersion: 1,
      kind: "open-deutsch-data-root",
      dataRootFormatVersion: 1,
      generation: 4,
      createdAt: factory.nextInstant(),
    };
    expect(dataRootManifestSchema.safeParse(manifest).success).toBe(true);
    expect(dataRootManifestSchema.safeParse({ ...manifest, generation: 0 }).success).toBe(false);
    expect(dataRootManifestSchema.safeParse({ ...manifest, backupPath: "/tmp/copy" }).success).toBe(
      false,
    );
    expect(dataRootManifestSchema.safeParse({ ...manifest, gitCommit: "deadbeef" }).success).toBe(
      false,
    );
  });

  it("keeps test-only storage out of production directory creation", () => {
    const layout = resolveDataRootLayout("/tmp/open-deutsch-layout-test/data");
    expect(dataRootDirectories(layout, { testMode: false })).not.toContain(layout.testData);
    expect(dataRootDirectories(layout, { testMode: true })).toContain(layout.testData);
  });

  it("rejects relative and filesystem-root layouts", () => {
    for (const root of ["data", ".", "/", "\0/tmp/data"]) {
      expect(() => resolveDataRootLayout(root)).toThrow(/OD_DATA_ROOT_/u);
    }
  });

  it("has no backup, snapshot, Git, or audio location and keeps logs bounded", () => {
    expect(Object.keys(dataRootRelativeLayout)).toEqual([
      "manifest",
      "database",
      "attachments",
      "researchStaging",
      "researchCache",
      "logs",
      "diagnostics",
      "testData",
    ]);
    expect(JSON.stringify(dataRootRelativeLayout)).not.toMatch(/backup|snapshot|git|audio/iu);
    expect(operationalLogPolicy).toEqual({
      maximumFileBytes: 5 * 1024 * 1024,
      retainedFilesPerComponent: 10,
    });
  });
});
