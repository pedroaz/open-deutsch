import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  compareVersions,
  diagnoseToolchain,
  parseVersion,
} from "../scripts/lib/toolchain-diagnostics.mjs";

const policy = JSON.parse(
  readFileSync(new URL("../toolchain.json", import.meta.url), "utf8"),
);

const valid = {
  nodeVersion: "v24.18.1",
  pnpmAvailable: true,
  pnpmVersion: "11.0.9",
  codexAvailable: true,
  codexVersion: "codex-cli 0.146.0",
  appServerStatus: "available",
};

test("parses prefixed tool versions and compares them", () => {
  assert.deepEqual(parseVersion("codex-cli 0.146.0", "Codex"), {
    major: 0,
    minor: 146,
    patch: 0,
    text: "0.146.0",
  });
  assert.equal(
    compareVersions(parseVersion("v24.18.1", "left"), parseVersion("24.18.0", "right")),
    1,
  );
});

test("rejects prerelease and trailing version text", () => {
  for (const value of ["11.0.9-rc.1", "11.0.9x", "codex-cli 0.146.0-dev"]) {
    assert.throws(() => parseVersion(value, "tool"), /Could not parse/);
  }
});

test("accepts the pinned toolchain and required Codex capability", () => {
  const result = diagnoseToolchain(valid, policy, { requireCodex: true });
  assert.equal(result.ok, true);
  assert.equal(result.integrationReady, true);
  assert.deepEqual(
    result.checks.map(({ code, status }) => [code, status]),
    [
      ["NODE_OK", "pass"],
      ["PNPM_OK", "pass"],
      ["CODEX_OK", "pass"],
    ],
  );
});

test("keeps local non-AI behavior available when Codex is missing", () => {
  const result = diagnoseToolchain(
    { ...valid, codexAvailable: false, codexVersion: "", appServerStatus: "failed" },
    policy,
  );
  assert.equal(result.ok, true);
  assert.equal(result.integrationReady, false);
  assert.equal(result.checks.at(-1).status, "warn");
  assert.match(result.checks.at(-1).message, /Local non-AI features remain available/);
});

test("fails integration checks clearly for missing or old Codex", () => {
  const missing = diagnoseToolchain(
    { ...valid, codexAvailable: false, codexVersion: "", appServerStatus: "failed" },
    policy,
    { requireCodex: true },
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.checks.at(-1).code, "CODEX_MISSING");

  const old = diagnoseToolchain(
    { ...valid, codexVersion: "codex-cli 0.145.9" },
    policy,
    { requireCodex: true },
  );
  assert.equal(old.ok, false);
  assert.equal(old.checks.at(-1).code, "CODEX_UNSUPPORTED");
  assert.match(old.checks.at(-1).message, /Upgrade to 0\.146\.0 or newer/);
});

test("fails integration checks when app-server is unavailable", () => {
  const result = diagnoseToolchain(
    { ...valid, appServerStatus: "failed", appServerDetail: "exit 2" },
    policy,
    { requireCodex: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).code, "CODEX_APP_SERVER_CHECK_FAILED");
  assert.match(result.checks.at(-1).message, /exit 2/);
});

test("distinguishes an app-server capability timeout", () => {
  const result = diagnoseToolchain(
    { ...valid, appServerStatus: "timeout" },
    policy,
    { requireCodex: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).code, "CODEX_APP_SERVER_TIMEOUT");
});

test("rejects unsupported Node.js and unpinned pnpm versions", () => {
  const result = diagnoseToolchain(
    { ...valid, nodeVersion: "v26.5.0", pnpmVersion: "11.21.0" },
    policy,
  );
  assert.equal(result.ok, false);
  assert.equal(result.integrationReady, false);
  assert.deepEqual(
    result.checks.slice(0, 2).map(({ code }) => code),
    ["NODE_UNSUPPORTED", "PNPM_UNSUPPORTED"],
  );
});

test("reports a missing pnpm executable with an install action", () => {
  const result = diagnoseToolchain(
    { ...valid, pnpmAvailable: false, pnpmVersion: "" },
    policy,
  );
  assert.equal(result.ok, false);
  assert.equal(result.integrationReady, false);
  assert.equal(result.checks[1].code, "PNPM_MISSING");
  assert.match(result.checks[1].message, /Install the pinned pnpm 11\.0\.9/);
});

test("rejects unknown and malformed CLI flags before probing tools", () => {
  for (const argument of ["--bogus", "--require-codex=false"]) {
    const result = spawnSync(process.execPath, ["scripts/check-toolchain.mjs", argument], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown argument/);
  }
});
