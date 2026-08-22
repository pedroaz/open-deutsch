import { mkdir, readFile, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ensureResearchStagingLayout,
  readResearchStagingFile,
  researchStagingManifestSchema,
  resolveResearchStagingLayout,
  writeResearchStagingFile,
  writeResearchStagingManifest,
} from "../src/index.js";

describe("ignored curriculum research staging", () => {
  it("materializes private notes, downloads, candidates, validation, and cache below the selected root", async ({
    disposableData,
  }) => {
    const layout = await ensureResearchStagingLayout(disposableData.dataRoot);
    for (const directory of [
      layout.notes,
      layout.downloads,
      layout.candidates,
      layout.validation,
      layout.cacheRoot,
    ]) {
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect(path.relative(disposableData.dataRoot, directory).startsWith("..")).toBe(false);
    }
    const note = await writeResearchStagingFile({
      dataRoot: disposableData.dataRoot,
      bucket: "notes",
      relativePath: "run-0001/source-summary.md",
      content: "Source summary; untrusted text.\n",
    });
    expect(await readFile(note, "utf8")).toBe("Source summary; untrusted text.\n");
    expect(
      await readResearchStagingFile({
        dataRoot: disposableData.dataRoot,
        bucket: "notes",
        relativePath: "run-0001/source-summary.md",
      }),
    ).toBe("Source summary; untrusted text.\n");
  });

  it("stores a bounded validation manifest and refuses unsafe or implicit overwrite paths", async ({
    disposableData,
  }) => {
    const manifest = researchStagingManifestSchema.parse({
      schemaVersion: 1,
      artifactId: "curriculum-stage_0000000000000001",
      band: "a1",
      domain: "housing-neighborhood",
      slug: "address-registration",
      status: "validated",
      candidatePath: "candidates/run-0001/address-registration.md",
      sourceSummaryPath: "notes/run-0001/source-summary.md",
      validationReportPath: "validation/run-0001/report.json",
    });
    const manifestPath = await writeResearchStagingManifest(disposableData.dataRoot, manifest);
    expect(JSON.parse(await readFile(manifestPath, "utf8"))).toEqual(manifest);
    await expect(
      writeResearchStagingFile({
        dataRoot: disposableData.dataRoot,
        bucket: "candidates",
        relativePath: "../escape.md",
        content: "nope",
      }),
    ).rejects.toThrow("OD_RESEARCH_STAGING_PATH_INVALID");
    await expect(
      writeResearchStagingFile({
        dataRoot: disposableData.dataRoot,
        bucket: "candidates",
        relativePath: "same.md",
        content: "first",
      }),
    ).resolves.toMatch(/same\.md$/u);
    await expect(
      writeResearchStagingFile({
        dataRoot: disposableData.dataRoot,
        bucket: "candidates",
        relativePath: "same.md",
        content: "second",
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("rejects a symlinked staging bucket without touching its target", async ({
    disposableData,
  }) => {
    const layout = resolveResearchStagingLayout(disposableData.dataRoot);
    await mkdir(layout.stagingRoot, { recursive: true, mode: 0o700 });
    const outside = path.join(disposableData.sandboxRoot, "outside-research");
    await mkdir(outside, { mode: 0o700 });
    await symlink(outside, layout.notes);
    await expect(ensureResearchStagingLayout(disposableData.dataRoot)).rejects.toThrow(
      "OD_RESEARCH_STAGING_SYMLINK_UNSAFE",
    );
    await expect(stat(path.join(outside, "candidates"))).rejects.toMatchObject({ code: "ENOENT" });
    await rm(outside, { recursive: true });
  });
});
