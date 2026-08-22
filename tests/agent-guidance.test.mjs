import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scopedFiles = [
  "apps/desktop/AGENTS.md",
  "apps/mcp-server/AGENTS.md",
  "plugins/open-deutsch/AGENTS.md",
  "content/curriculum/AGENTS.md",
];

test("root guidance encodes the implementation loop and safety boundaries", async () => {
  const contents = await readFile("AGENTS.md", "utf8");
  for (const required of [
    "docs/implementation-plan.md",
    "make test-fast",
    "make verify-live",
    "make verify-plugin",
    "disposable root",
    "official OpenAI documentation",
    "visual inspection",
    "STDIO protocol",
    "lessons-learned.md",
  ]) {
    assert.match(contents, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(contents, /Mark the checkbox only after its acceptance evidence passes/);
  assert.match(contents, /Commit only when the user explicitly requests a commit/);
  assert.match(contents, /review the exact file scope before staging/);
});

test("scoped guidance exists only for materially different component rules", async () => {
  for (const file of scopedFiles) {
    const contents = await readFile(file, "utf8");
    assert.match(contents, /root instructions still apply/i, file);
    assert.ok(contents.length > 500, `${file} must contain material scoped guidance`);
    assert.ok(contents.length < 4_000, `${file} should stay concise`);
  }
});

test("agent runbook documents Make-first diagnosis and the live boundary", async () => {
  const contents = await readFile("docs/agent/runbook.md", "utf8");
  for (const required of [
    "make help",
    "make setup",
    "make dev",
    "make prd",
    "make status",
    "make kill",
    "make logs",
    "make test-fast",
    "make test-e2e",
    "make test-plugin",
    "make package",
    "make verify-live",
    "make verify-plugin",
    "[UNAVAILABLE]",
    ".runtime/",
  ]) {
    assert.ok(contents.includes(required), required);
  }
  assert.match(contents, /Never invoke either from tests, CI/);
});

test("design guidance preserves authority and visual acceptance requirements", async () => {
  const contents = await readFile("docs/agent/design-direction.md", "utf8");
  assert.match(contents, /docs\/design-direction\.md.*product authority/);
  assert.match(contents, /English and German/);
  assert.match(contents, /standard and moderately narrow/);
  assert.match(contents, /keyboard operation/);
  assert.match(contents, /acceptance screenshots/);
});

test("lessons use the required durable entry schema", async () => {
  const contents = await readFile("docs/agent/lessons-learned.md", "utf8");
  for (const field of [
    "**Date**",
    "**Component:**",
    "**Lesson:**",
    "**Evidence or reproduction:**",
    "**Durable action or rule:**",
    "**Status:**",
  ]) {
    assert.ok(contents.includes(field), field);
  }
  assert.doesNotMatch(contents, /ordinary progress.*add/i);
});
