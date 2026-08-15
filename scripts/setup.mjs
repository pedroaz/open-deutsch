#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function run(command, args) {
  process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["scripts/check-toolchain.mjs"]);
run("pnpm", ["install", "--frozen-lockfile"]);
run("pnpm", ["peers", "check"]);
