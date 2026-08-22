#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(desktopRoot, "../..");
const mode = process.argv[2];
if (mode !== "dev" && mode !== "prd") {
  throw new Error("Desktop service mode must be dev or prd.");
}

const children = new Set();
let stopping = false;
let failService;
const serviceFailure = new Promise((_, reject) => {
  failService = reject;
});

function start(command, args, environment = process.env, essential = false) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (essential && !stopping) {
      failService(
        new Error(`${command} service exited with ${String(code)}${signal ? ` (${signal})` : ""}.`),
      );
    }
  });
  return child;
}

async function run(command, args) {
  const child = start(command, args);
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${command} exited with ${String(code)}.`);
}

async function waitForVite(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Desktop Vite server did not become ready.");
}

function stopChildren(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopChildren(signal);
  });
}

try {
  let rendererUrl;
  if (mode === "dev") {
    await run("pnpm", [
      "exec",
      "tsc",
      "-b",
      "--force",
      "apps/desktop/tsconfig.main.json",
      "apps/desktop/tsconfig.preload.json",
    ]);
    await run("pnpm", [
      "--dir",
      "apps/desktop",
      "exec",
      "vite",
      "build",
      "--config",
      "vite.preload.config.ts",
    ]);
    start(
      "pnpm",
      [
        "exec",
        "tsc",
        "-b",
        "--watch",
        "--preserveWatchOutput",
        "apps/desktop/tsconfig.main.json",
        "apps/desktop/tsconfig.preload.json",
      ],
      process.env,
      true,
    );
    start(
      "pnpm",
      [
        "--dir",
        "apps/desktop",
        "exec",
        "vite",
        "build",
        "--watch",
        "--config",
        "vite.preload.config.ts",
      ],
      process.env,
      true,
    );
    rendererUrl = "http://127.0.0.1:5173";
    start(
      "pnpm",
      [
        "exec",
        "vite",
        "--config",
        "apps/desktop/vite.config.ts",
        "--host",
        "127.0.0.1",
        "--port",
        "5173",
        "--strictPort",
      ],
      process.env,
      true,
    );
    await waitForVite(rendererUrl);
  }

  const electron = start(
    "pnpm",
    ["--workspace-root", "exec", "electron", "apps/desktop/dist/main/index.js"],
    {
      ...process.env,
      ...(rendererUrl === undefined ? {} : { OPEN_DEUTSCH_RENDERER_URL: rendererUrl }),
    },
  );
  const [code, signal] = await Promise.race([once(electron, "exit"), serviceFailure]);
  const wasStopping = stopping;
  stopChildren();
  if (!wasStopping && code !== 0) {
    throw new Error(`Electron exited with ${String(code)}${signal ? ` (${signal})` : ""}.`);
  }
} finally {
  stopChildren();
}
