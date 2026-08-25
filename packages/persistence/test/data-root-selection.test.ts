import { chmod, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { dataRootGenerationSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  inspectDataRootChoice,
  materializeDataRootSelection,
  resolveDataRootLayout,
} from "../src/index.js";

const factory = createDeterministicContractFactory();

describe("safe Linux data-root selection", () => {
  it("initializes an empty choice privately without chmodding its existing root", async ({
    disposableData,
  }) => {
    const choice = path.join(disposableData.sandboxRoot, "empty-choice");
    await mkdir(choice, { mode: 0o755 });
    await chmod(choice, 0o755);
    const plan = await inspectDataRootChoice(choice);
    expect(plan.action).toBe("initialize-empty-directory");
    expect(plan.dataRoot).toBe(choice);
    expect(plan.warnings).toContain("broad-permissions");

    const selected = await materializeDataRootSelection(plan, {
      generation: dataRootGenerationSchema.parse(1),
      createdAt: factory.nextInstant(),
    });
    const layout = resolveDataRootLayout(choice);
    expect(selected.manifest.generation).toBe(1);
    expect((await stat(choice)).mode & 0o777).toBe(0o755);
    expect((await stat(layout.manifest)).mode & 0o777).toBe(0o600);
    for (const directory of [
      layout.attachments,
      layout.researchStaging,
      layout.researchCache,
      layout.logs,
      layout.diagnostics,
    ]) {
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
    }
    await expect(stat(layout.testData)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses a dedicated private subdirectory for an unrelated non-empty choice", async ({
    disposableData,
  }) => {
    const choice = path.join(disposableData.sandboxRoot, "documents");
    await mkdir(choice, { mode: 0o700 });
    const sentinel = path.join(choice, "keep-me.txt");
    await writeFile(sentinel, "unrelated\n", { mode: 0o600 });

    const plan = await inspectDataRootChoice(choice);
    expect(plan).toMatchObject({
      action: "create-dedicated-subdirectory",
      choicePath: choice,
      dataRoot: path.join(choice, "open-deutsch-data"),
    });
    const selected = await materializeDataRootSelection(plan, {
      generation: dataRootGenerationSchema.parse(1),
      createdAt: factory.nextInstant(),
      testMode: true,
    });
    expect(await readFile(sentinel, "utf8")).toBe("unrelated\n");
    expect((await stat(selected.dataRoot)).mode & 0o777).toBe(0o700);
    expect((await stat(resolveDataRootLayout(selected.dataRoot).testData)).mode & 0o777).toBe(
      0o700,
    );
  });

  it("recognizes an existing root, preserves creation time, and warns without chmod", async ({
    disposableData,
  }) => {
    const root = path.join(disposableData.sandboxRoot, "existing-root");
    await mkdir(root, { mode: 0o700 });
    const firstPlan = await inspectDataRootChoice(root);
    const createdAt = factory.nextInstant();
    await materializeDataRootSelection(firstPlan, {
      generation: dataRootGenerationSchema.parse(1),
      createdAt,
    });
    await chmod(root, 0o755);

    const reopenPlan = await inspectDataRootChoice(root);
    expect(reopenPlan.action).toBe("open-existing-root");
    expect(reopenPlan.warnings).toContain("broad-permissions");
    const reopened = await materializeDataRootSelection(reopenPlan, {
      generation: dataRootGenerationSchema.parse(2),
      createdAt: factory.nextInstant(),
    });
    expect(reopened.manifest.createdAt).toBe(createdAt);
    expect(reopened.manifest.generation).toBe(2);
    expect((await stat(root)).mode & 0o777).toBe(0o755);
  });

  it("rejects final and intermediate symlink traversal without touching the target", async ({
    disposableData,
  }) => {
    const target = path.join(disposableData.sandboxRoot, "outside-target");
    await mkdir(target, { mode: 0o700 });
    await writeFile(path.join(target, "sentinel"), "untouched\n", { mode: 0o600 });
    const finalLink = path.join(disposableData.sandboxRoot, "final-link");
    await symlink(target, finalLink);
    await expect(inspectDataRootChoice(finalLink)).rejects.toThrow("OD_DATA_ROOT_SYMLINK_UNSAFE");

    const parent = path.join(disposableData.sandboxRoot, "parent");
    await mkdir(parent, { mode: 0o700 });
    await symlink(target, path.join(parent, "linked"));
    await expect(inspectDataRootChoice(path.join(parent, "linked", "child"))).rejects.toThrow(
      "OD_DATA_ROOT_SYMLINK_UNSAFE",
    );
    expect(await readdir(target)).toEqual(["sentinel"]);

    const existingRoot = path.join(disposableData.sandboxRoot, "existing-for-symlink-test");
    await mkdir(existingRoot, { mode: 0o700 });
    const initialPlan = await inspectDataRootChoice(existingRoot);
    await materializeDataRootSelection(initialPlan, {
      generation: dataRootGenerationSchema.parse(1),
      createdAt: factory.nextInstant(),
    });
    const researchDirectory = path.join(existingRoot, "research");
    await rm(researchDirectory, { recursive: true });
    await symlink(target, researchDirectory);
    const unsafeReopen = await inspectDataRootChoice(existingRoot);
    await expect(
      materializeDataRootSelection(unsafeReopen, {
        generation: dataRootGenerationSchema.parse(2),
        createdAt: factory.nextInstant(),
      }),
    ).rejects.toThrow("OD_DATA_ROOT_SYMLINK_UNSAFE");
    expect(await readdir(target)).toEqual(["sentinel"]);
  });

  it("warns for Git worktrees and known install directories", async ({ disposableData }) => {
    const installRoot = path.join(disposableData.sandboxRoot, "installed-app");
    const choice = path.join(installRoot, "private-data");
    await mkdir(path.join(installRoot, ".git"), { recursive: true, mode: 0o700 });
    await mkdir(choice, { mode: 0o700 });
    const plan = await inspectDataRootChoice(choice, { knownInstallRoots: [installRoot] });
    expect(plan.warnings).toEqual(["git-worktree", "install-directory"]);
  });

  it("rejects changed, forged, conflicting, and non-writable choices", async ({
    disposableData,
  }) => {
    const forgedRoot = path.join(disposableData.sandboxRoot, "forged");
    await mkdir(forgedRoot, { mode: 0o700 });
    await expect(
      materializeDataRootSelection(
        {
          choicePath: forgedRoot,
          dataRoot: forgedRoot,
          action: "initialize-empty-directory",
          warnings: [],
        },
        { generation: dataRootGenerationSchema.parse(1), createdAt: factory.nextInstant() },
      ),
    ).rejects.toThrow("OD_DATA_ROOT_SELECTION_PLAN_INVALID");

    const conflict = path.join(disposableData.sandboxRoot, "conflict-choice");
    const dedicated = path.join(conflict, "open-deutsch-data");
    await mkdir(dedicated, { recursive: true, mode: 0o700 });
    await writeFile(path.join(conflict, "other.txt"), "other\n", { mode: 0o600 });
    await writeFile(path.join(dedicated, "occupied.txt"), "occupied\n", { mode: 0o600 });
    await expect(inspectDataRootChoice(conflict)).rejects.toThrow(
      "OD_DATA_ROOT_SUBDIRECTORY_CONFLICT",
    );

    const changed = path.join(disposableData.sandboxRoot, "changed-choice");
    await mkdir(changed, { mode: 0o700 });
    const changedPlan = await inspectDataRootChoice(changed);
    await writeFile(path.join(changed, "appeared.txt"), "race\n", { mode: 0o600 });
    await expect(
      materializeDataRootSelection(changedPlan, {
        generation: dataRootGenerationSchema.parse(1),
        createdAt: factory.nextInstant(),
      }),
    ).rejects.toThrow("OD_DATA_ROOT_SELECTION_CHANGED");

    const readOnly = path.join(disposableData.sandboxRoot, "read-only-choice");
    await mkdir(readOnly, { mode: 0o700 });
    await chmod(readOnly, 0o500);
    try {
      await expect(inspectDataRootChoice(readOnly)).rejects.toThrow();
    } finally {
      await chmod(readOnly, 0o700);
    }

    for (const [name, mode] of [
      ["group-writable", 0o770],
      ["world-writable", 0o777],
    ] as const) {
      const sharedParent = path.join(disposableData.sandboxRoot, name);
      await mkdir(sharedParent, { mode: 0o700 });
      await chmod(sharedParent, mode);
      const plan = await inspectDataRootChoice(sharedParent);
      expect(plan).toMatchObject({
        action: "create-dedicated-subdirectory",
        dataRoot: path.join(sharedParent, "open-deutsch-data"),
        warnings: ["broad-permissions"],
      });
      const selected = await materializeDataRootSelection(plan, {
        generation: dataRootGenerationSchema.parse(1),
        createdAt: factory.nextInstant(),
      });
      expect((await stat(selected.dataRoot)).mode & 0o777).toBe(0o700);
    }

    const unsafeActiveRoot = path.join(disposableData.sandboxRoot, "unsafe-active-root");
    await mkdir(unsafeActiveRoot, { mode: 0o700 });
    const initialPlan = await inspectDataRootChoice(unsafeActiveRoot);
    await materializeDataRootSelection(initialPlan, {
      generation: dataRootGenerationSchema.parse(1),
      createdAt: factory.nextInstant(),
    });
    await chmod(unsafeActiveRoot, 0o770);
    await expect(inspectDataRootChoice(unsafeActiveRoot)).rejects.toThrow(
      "OD_DATA_ROOT_PERMISSIONS_UNSAFE",
    );
  });
});
