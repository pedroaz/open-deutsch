import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyCodexVersion,
  discoverCodex,
  resolveCodexExecutable,
  scrubCodexEnvironment,
  supportedCodexVersion,
} from "../src/index.js";

describe("Codex desktop discovery", () => {
  it("accepts only the exact exercised compatibility interval", () => {
    expect(supportedCodexVersion).toEqual({
      minimum: "0.146.0",
      maximumExclusive: "0.146.1",
    });
    expect(classifyCodexVersion("codex-cli 0.146.0\n")).toEqual({
      status: "available",
      version: "0.146.0",
    });
    for (const value of ["0.145.9", "0.146.1", "0.146.0-dev", "0.146.0 trailing"]) {
      expect(classifyCodexVersion(value)).toEqual({
        status: "unavailable",
        reason: "unsupported-version",
      });
    }
  });

  it("requires configured executable paths to be absolute and executable", async () => {
    await expect(resolveCodexExecutable("codex", process.env)).resolves.toBeUndefined();
    await expect(resolveCodexExecutable(process.execPath, process.env)).resolves.toBe(
      process.execPath,
    );
  });

  it("removes ambient provider credentials without removing ordinary runtime state", () => {
    const result = scrubCodexEnvironment({
      PATH: "/safe/bin",
      OPENAI_API_KEY: "secret",
      CODEX_REMOTE_TOKEN: "secret",
      AWS_SHARED_CREDENTIALS_FILE: "/private/file",
      AZURE_CLIENT_SECRET: "secret",
    });
    expect(result).toEqual({ PATH: "/safe/bin" });
  });

  it("discovers a compatible executable from PATH with a scrubbed bounded probe", async ({
    disposableData,
  }) => {
    const executable = join(disposableData.dataRoot, "codex");
    await writeFile(
      executable,
      `#!${process.execPath}\nif (process.env.OPENAI_API_KEY) process.exit(19);\nif (process.argv[2] === "--version") process.stdout.write("codex-cli 0.146.0\\n");\nelse if (process.argv[2] === "app-server" && process.argv[3] === "--help") process.exit(0);\nelse process.exit(20);\n`,
      { mode: 0o700 },
    );
    await chmod(executable, 0o700);
    await expect(
      discoverCodex({
        environment: { PATH: disposableData.dataRoot, OPENAI_API_KEY: "secret" },
        timeoutMilliseconds: 1_000,
      }),
    ).resolves.toEqual({ status: "available", version: "0.146.0" });
  });
});
