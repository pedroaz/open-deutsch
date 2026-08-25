import { access, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertOwnedSandboxPolicy, createOwnedTurnSandbox } from "../src/sandbox.js";

describe("owned App Server turn sandbox", () => {
  it("mints one private capability outside learner and configuration roots", async ({
    disposableData,
  }) => {
    const sandbox = await createOwnedTurnSandbox({
      forbiddenRoots: [
        disposableData.dataRoot,
        disposableData.configRoot,
        process.cwd(),
        process.env["TMPDIR"] ?? disposableData.dataRoot,
      ],
    });
    const policy = assertOwnedSandboxPolicy(sandbox.policy);
    expect(path.relative(disposableData.sandboxRoot, policy.sandboxRoot).startsWith("..")).toBe(
      true,
    );
    expect((await stat(policy.sandboxRoot)).mode & 0o777).toBe(0o700);
    expect((await stat(policy.workspaceRoot)).mode & 0o777).toBe(0o700);
    expect(policy.sandboxPolicy).toMatchObject({
      type: "workspaceWrite",
      networkAccess: false,
      writableRoots: [policy.workspaceRoot],
    });
    await sandbox.cleanup();
    await expect(access(policy.sandboxRoot)).rejects.toMatchObject({ code: "ENOENT" });
    expect(() => assertOwnedSandboxPolicy(policy)).toThrow("OD_APP_SERVER_SANDBOX_POLICY_INVALID");
  });

  it("rejects broad and forged matching policies", () => {
    const root = path.parse(process.cwd()).root;
    const forged = {
      sandboxRoot: root,
      workspaceRoot: root,
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [root],
        networkAccess: false,
      },
    };
    expect(() => assertOwnedSandboxPolicy(forged)).toThrow("OD_APP_SERVER_SANDBOX_POLICY_INVALID");
  });

  it("retires the capability before a failed ownership-marker cleanup", async () => {
    const sandbox = await createOwnedTurnSandbox({ forbiddenRoots: [process.cwd()] });
    await writeFile(
      path.join(sandbox.policy.sandboxRoot, ".open-deutsch-owned-turn.json"),
      '{"runId":"forged"}\n',
    );
    await expect(sandbox.cleanup()).rejects.toThrow("OD_APP_SERVER_SANDBOX_OWNERSHIP_INVALID");
    expect(() => assertOwnedSandboxPolicy(sandbox.policy)).toThrow(
      "OD_APP_SERVER_SANDBOX_POLICY_INVALID",
    );
    await rm(sandbox.policy.sandboxRoot, { recursive: true });
  });
});
