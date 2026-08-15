#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const checks = [
  [process.execPath, ["scripts/check-toolchain.mjs"]],
  ["pnpm", ["list", "--recursive", "--depth", "-1"]],
  ["pnpm", ["peers", "check"]],
];

let failed = false;
for (const [command, args] of checks) {
  process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error || result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
