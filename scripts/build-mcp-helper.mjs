#!/usr/bin/env node

import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rename,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const defaultOutput = path.join(repositoryRoot, "release", "mcp-helper");

async function findSymlink(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isSymbolicLink()) return candidate;
    if (entry.isDirectory()) {
      const nested = await findSymlink(candidate);
      if (nested) return nested;
    }
  }
  return undefined;
}

async function copyMissingPnpmDependencies(deployment, temporary) {
  const flattenedRoot = path.join(deployment, "node_modules", ".pnpm", "node_modules");
  const targetRoot = path.join(temporary, "node_modules");
  for (const entry of await readdir(flattenedRoot, { withFileTypes: true })) {
    const source = path.join(flattenedRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      await mkdir(target, { recursive: true, mode: 0o755 });
      for (const nested of await readdir(source, { withFileTypes: true })) {
        const nestedSource = path.join(source, nested.name);
        const nestedTarget = path.join(target, nested.name);
        if (
          !(await access(nestedTarget)
            .then(() => true)
            .catch(() => false))
        ) {
          await cp(nestedSource, nestedTarget, { recursive: true, dereference: true });
        }
      }
      continue;
    }
    if (
      !(await access(target)
        .then(() => true)
        .catch(() => false))
    ) {
      await cp(source, target, { recursive: true, dereference: true });
    }
  }
}

function parseOutput() {
  const index = process.argv.indexOf("--output");
  const output = index === -1 ? defaultOutput : process.argv[index + 1];
  if (!output || !path.isAbsolute(output) || output.includes("\0")) {
    throw new Error("OD_MCP_HELPER_OUTPUT_INVALID");
  }
  const normalized = path.normalize(output);
  const relative = path.relative(repositoryRoot, normalized);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("OD_MCP_HELPER_OUTPUT_MUST_BE_RELEASE_CHILD");
  }
  return normalized;
}

async function main() {
  const output = parseOutput();
  const temporary = `${output}.${process.pid}.next`;
  const deployment = await mkdtemp(path.join(os.tmpdir(), "open-deutsch-mcp-deploy-"));
  const deployEnvironment = { ...process.env };
  for (const key of [
    "NODE_ENV",
    "NPM_CONFIG_PRODUCTION",
    "npm_config_production",
    "PNPM_CONFIG_PRODUCTION",
    "pnpm_config_production",
  ]) {
    delete deployEnvironment[key];
  }
  await rm(temporary, { recursive: true, force: true });
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  try {
    await execFileAsync(
      "pnpm",
      ["--filter", "@open-deutsch/mcp-server", "deploy", "--prod", "--legacy", deployment],
      {
        cwd: repositoryRoot,
        env: deployEnvironment,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    await cp(deployment, temporary, { recursive: true, dereference: true });
    await copyMissingPnpmDependencies(deployment, temporary);
    const symlink = await findSymlink(temporary).catch(() => undefined);
    if (symlink) throw new Error(`OD_MCP_HELPER_SYMLINK_UNSAFE:${symlink}`);
    await mkdir(path.join(temporary, "server"), { recursive: true, mode: 0o700 });
    await mkdir(path.join(temporary, "bin"), { recursive: true, mode: 0o700 });
    await rename(
      path.join(temporary, "dist", "index.js"),
      path.join(temporary, "server", "index.js"),
    );
    await rm(path.join(temporary, "dist"), { recursive: true, force: true });
    await cp(
      path.join(repositoryRoot, "plugins/open-deutsch/bin/open-deutsch-mcp.cjs"),
      path.join(temporary, "bin/open-deutsch-mcp.cjs"),
    );
    await chmod(path.join(temporary, "bin/open-deutsch-mcp.cjs"), 0o700);
    await cp(path.join(repositoryRoot, "content/curriculum"), path.join(temporary, "curriculum"), {
      recursive: true,
    });
    await cp(
      path.join(repositoryRoot, "plugins/open-deutsch/bin/open-deutsch-mcp.cjs"),
      path.join(temporary, "open-deutsch-mcp"),
    );
    await chmod(path.join(temporary, "open-deutsch-mcp"), 0o700);
    await cp(
      path.join(repositoryRoot, "plugins/open-deutsch/bin/open-deutsch-mcp.cjs"),
      path.join(temporary, "open-deutsch-mcp.cjs"),
    );
    await chmod(path.join(temporary, "open-deutsch-mcp.cjs"), 0o700);
    await writeFile(
      path.join(temporary, "open-deutsch-mcp"),
      '#!/bin/sh\nset -eu\nexec "$(dirname "$0")/open-deutsch-mcp.cjs" "$@"\n',
      { encoding: "utf8", mode: 0o700 },
    );
    await rm(output, { recursive: true, force: true });
    await rename(temporary, output);
    const packageManifest = JSON.parse(await readFile(path.join(output, "package.json"), "utf8"));
    const evidence = {
      schemaVersion: 1,
      package: packageManifest.name,
      helper: "open-deutsch-mcp",
      serverEntry: "server/index.js",
      curriculumSnapshot: "curriculum/manifest.yaml",
      workspaceDependency: false,
    };
    process.stdout.write(`[PASS] MCP_HELPER_BUILT: ${JSON.stringify(evidence)}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(deployment, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main();
}
