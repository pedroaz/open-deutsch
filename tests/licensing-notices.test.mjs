import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("licensing and third-party notices cover the shipped boundaries", async () => {
  const licensing = await readFile("docs/licensing.md", "utf8");
  const notices = await readFile("docs/third-party-notices.md", "utf8");
  for (const value of [
    "third-party",
    "curriculum/sources.yaml",
    "CEFR",
    "not formal CEFR certification",
  ]) {
    assert.match(licensing, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  for (const value of [
    "@modelcontextprotocol/server",
    "electron",
    "react",
    "Council of Europe",
    "Bundesportal",
    "learner data",
  ]) {
    assert.match(notices, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
