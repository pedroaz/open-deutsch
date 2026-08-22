#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(pluginRoot, "../..");
const toolNames = new Set([
  "open_deutsch_read_learner_context",
  "open_deutsch_read_practice_context",
  "open_deutsch_read_curriculum_coverage",
  "open_deutsch_create_activity",
  "open_deutsch_save_attempt_feedback",
  "open_deutsch_save_listening_result",
  "open_deutsch_replace_weekly_plan",
  "open_deutsch_save_voice_summary",
]);

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function fail(message) {
  throw new Error(`PLUGIN_CONTRACT_INVALID: ${message}`);
}

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function checkToolList(value, label) {
  if (!Array.isArray(value) || value.some((tool) => !toolNames.has(tool))) {
    fail(`${label} contains an unknown tool`);
  }
}

const manifest = await readJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
assert.equal(manifest.name, "open-deutsch");
assert.equal(manifest.version, "0.1.0");
assert.equal(manifest.mcpServers, "./.mcp.json");
assert.equal(manifest.skills, "./skills/");
const mcp = await readJson(path.join(pluginRoot, ".mcp.json"));
assert.deepEqual(Object.keys(mcp.mcpServers), ["open-deutsch"]);
assert.equal(mcp.mcpServers["open-deutsch"].command, "open-deutsch-mcp");
if (JSON.stringify(mcp).includes("/") && JSON.stringify(mcp).includes("OPEN_DEUTSCH_DATA_ROOT")) {
  fail("MCP configuration must not embed a learner data path");
}

for (const skill of ["german-teacher", "curriculum-research"]) {
  const source = await readFile(path.join(pluginRoot, "skills", skill, "SKILL.md"), "utf8");
  const frontMatter = /^---\n([\s\S]*?)\n---\n/.exec(source)?.[1] ?? "";
  if (!new RegExp(`^name: ${skill}$`, "m").test(frontMatter))
    fail(`${skill} name metadata missing`);
  if (!/^description: \S.+$/m.test(frontMatter)) fail(`${skill} description metadata missing`);
  if (source.includes("[TODO:")) fail(`${skill} contains a TODO marker`);
}

const starterPrompts = await readJson(path.join(pluginRoot, "prompts", "starter-prompts.json"));
assert.equal(starterPrompts.schemaVersion, 1);
assert.equal(starterPrompts.prompts.length, 7);
const starterIds = new Set();
for (const prompt of starterPrompts.prompts) {
  if (starterIds.has(prompt.id)) fail(`duplicate starter prompt ${prompt.id}`);
  starterIds.add(prompt.id);
  if (!["german-teacher", "curriculum-research"].includes(prompt.skill)) {
    fail(`invalid starter prompt skill ${prompt.id}`);
  }
  checkToolList(prompt.expectedTools, `starter prompt ${prompt.id}`);
  if (/clipboard|manual session|arbitrary url|upload.*database/i.test(prompt.prompt)) {
    fail(`starter prompt ${prompt.id} claims an unsupported boundary`);
  }
}

const corpus = await readJson(path.join(pluginRoot, "evals", "prompt-corpus.json"));
assert.equal(corpus.schemaVersion, 1);
assert.equal(corpus.corpusVersion, "0.1.0");
if (corpus.cases.length < 10) fail("evaluation corpus is too small");
const caseIds = new Set();
for (const entry of corpus.cases) {
  if (caseIds.has(entry.id)) fail(`duplicate evaluation case ${entry.id}`);
  caseIds.add(entry.id);
  if (
    ![
      "direct",
      "indirect",
      "paraphrased",
      "follow-up",
      "write-confirmation",
      "negative",
      "boundary",
    ].includes(entry.class)
  ) {
    fail(`invalid evaluation class ${entry.id}`);
  }
  if (
    entry.expectedSkill !== null &&
    !["german-teacher", "curriculum-research"].includes(entry.expectedSkill)
  ) {
    fail(`invalid expected skill ${entry.id}`);
  }
  checkToolList(entry.expectedTools, `evaluation case ${entry.id}`);
  if (entry.class === "negative" || entry.class === "boundary") {
    assert.equal(entry.expectedTools.length, 0, `boundary case ${entry.id} must not select a tool`);
  }
}

const reference = await readFile(
  path.join(pluginRoot, "references", "open-deutsch-tools.md"),
  "utf8",
);
for (const tool of toolNames)
  if (!reference.includes(`\`${tool}\``)) fail(`reference omits ${tool}`);
run(
  process.execPath,
  ["--check", path.join(pluginRoot, "bin", "open-deutsch-mcp.cjs")],
  pluginRoot,
);
run(process.execPath, ["scripts/validate-artifacts.mjs"], repositoryRoot);
run("pnpm", ["--filter", "@open-deutsch/mcp-server", "run", "build"], repositoryRoot);
run(
  process.execPath,
  [
    "--test-global-setup=./tests/support/node-disposable-data.mjs",
    "--test",
    "tests/mcp-production.test.mjs",
  ],
  repositoryRoot,
);
process.stdout.write(
  "[PASS] PLUGIN_CONTRACTS: manifest, skills, prompts, corpus, wrapper, artifacts, MCP protocol\n",
);
