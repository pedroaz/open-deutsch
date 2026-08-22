import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const adrRequiredSections = [
  "## Context",
  "## Decision",
  "## Evidence",
  "## Validation commands",
  "## Rejected alternatives",
  "## Accepted boundaries and consequences",
  "## Supersession",
];

function sectionBody(contents, heading) {
  const marker = `${heading}\n`;
  const start = contents.indexOf(marker);
  if (start === -1) return "";
  const remainder = contents.slice(start + marker.length);
  const nextHeading = remainder.search(/\n## /);
  return (nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)).trim();
}

test("ADR convention requires reproducible durable decisions", async () => {
  const readme = await readFile("docs/adr/README.md", "utf8");
  assert.match(readme, /docs\/decisions\.md.*authoritative/);
  assert.match(readme, /exact chosen versions\/ranges/);
  assert.match(readme, /accepted.*immutable/i);

  const template = await readFile("docs/adr/ADR-template.md", "utf8");
  for (const section of adrRequiredSections) assert.ok(template.includes(section), section);
});

test("named ADRs follow the lifecycle and accepted records include decision evidence", async () => {
  const names = (await readdir("docs/adr")).filter((name) => /^ADR-\d{4}-.+\.md$/.test(name));
  assert.ok(names.length > 0);
  for (const name of names) {
    const contents = await readFile(`docs/adr/${name}`, "utf8");
    const status = contents.match(/\*\*Status:\*\* (proposed|accepted|superseded|rejected)/)?.[1];
    assert.ok(status, `${name}: recognized status`);
    for (const section of adrRequiredSections)
      assert.ok(contents.includes(section), `${name}: ${section}`);
    if (status === "accepted") {
      assert.match(contents, /```text\n[^`]+\n```/, `${name}: validation command`);
      for (const section of [
        "## Decision",
        "## Evidence",
        "## Rejected alternatives",
        "## Accepted boundaries and consequences",
      ]) {
        const body = sectionBody(contents, section);
        assert.ok(body.length > 0, `${name}: nonblank ${section}`);
        assert.doesNotMatch(body, /^None\.?$/i, `${name}: substantive ${section}`);
      }
    }
  }
});

test("the compatibility baseline records exact selected versions", async () => {
  const contents = await readFile("docs/adr/ADR-0001-toolchain-baseline.md", "utf8");
  for (const version of ["24.18.1", "11.0.9", "0.146.0", "6.0.3", "9.39.5", "8.67.0"]) {
    assert.ok(contents.includes(version), version);
  }
});

test("spike convention has a separate evidence, blocker, and cleanup completion rule", async () => {
  const readme = await readFile("docs/spikes/README.md", "utf8");
  for (const requirement of [
    "disposable proof",
    "exact commands",
    "rejected alternatives",
    "explicit release blocker",
    "cleanup is verified",
  ]) {
    assert.match(readme, new RegExp(requirement, "i"));
  }
  assert.match(readme, /explicit user confirmation/);

  const template = await readFile("docs/spikes/SPIKE-template.md", "utf8");
  for (const section of [
    "## Candidate versions and environment",
    "## Success and blocker criteria",
    "## Validation commands",
    "## Evidence and observations",
    "## Alternatives and negative results",
    "## Decision or explicit blocker",
    "## Cleanup verification",
  ]) {
    assert.ok(template.includes(section), section);
  }
});

test("lessons are topic-organized, dated, evidence-based, and promotable", async () => {
  const contents = await readFile("docs/agent/lessons-learned.md", "utf8");
  assert.doesNotMatch(contents, /^## \d{4}-\d{2}-\d{2}/m);
  for (const field of [
    "**Date:**",
    "**Component:**",
    "**Lesson:**",
    "**Evidence or reproduction:**",
    "**Durable action or rule:**",
    "**Status:** promoted",
  ]) {
    assert.ok(contents.includes(field), field);
  }
  assert.match(contents, /candidate.*promote/i);
  assert.match(contents, /Supersede or remove stale guidance/);
});
