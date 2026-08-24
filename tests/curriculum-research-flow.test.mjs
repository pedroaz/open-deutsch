import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parse } from "yaml";

import {
  CurriculumResearchValidationError,
  detectStaleCurriculumContent,
  prepareCurriculumPromotion,
  promoteCurriculumTopic,
  renderResearchValidationReport,
  validateStagedCurriculumTopic,
} from "../scripts/lib/curriculum-research-flow.mjs";

const sourceRegistry = {
  schemaVersion: 1,
  sources: [
    {
      sourceId: "curriculum-source_0000000000000001",
      title: "Reviewed source",
      repositoryPath: "docs/product-requirements.md",
      publisher: "Open Deutsch",
      sourceClass: "repository-original",
      supportedClaims: ["The reviewed source defines the product boundary."],
      retrievedOn: "2026-08-21",
      reviewedOn: "2026-08-21",
      freshness: { status: "stable" },
    },
  ],
};

const candidate = [
  "---",
  "schemaVersion: 1",
  "topicId: curriculum-topic_0000000000000009",
  "slug: address-registration",
  "band: a1",
  "domain: housing-neighborhood",
  "title: Address registration",
  "status: foundation-ready",
  "communicativeGoals:",
  "  - Ask where to register a new address.",
  "prerequisiteTopicIds: []",
  "grammarFoundations:",
  "  - key: question-frames",
  "    description: Ask a polite question.",
  "vocabularyFoundations:",
  "  - key: anmeldung",
  "    description: Use the key public-service word.",
  "lessonFoundation:",
  "  explanation: Keep the administrative fact tied to its reviewed source.",
  "  examples:",
  "    - Wo kann ich mich anmelden?",
  "exerciseConcepts:",
  "  - key: role-play",
  "    description: Ask about a registration appointment.",
  "sourceIds:",
  "  - curriculum-source_0000000000000001",
  "coverage:",
  "  reception:",
  "    status: mapped",
  "    outcomes:",
  "      - Understand the main instruction.",
  "  production:",
  "    status: mapped",
  "    outcomes:",
  "      - Ask a clear question.",
  "  interaction:",
  "    status: mapped",
  "    outcomes:",
  "      - Ask one follow-up.",
  "  mediation:",
  "    status: not-applicable",
  "---",
  "",
  "# Address registration",
  "",
  "This reviewed foundation keeps facts tied to the source registry.",
  "",
].join("\n");

test("staged research validates metadata, source coverage, CEFR scope, safety, and overlap", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "open-deutsch-research-flow-"));
  try {
    const validation = await validateStagedCurriculumTopic({
      content: candidate,
      canonicalPath: "topics/a1/address-registration.md",
      canonicalRoot: root,
      sourceRegistry,
    });
    assert.equal(validation.valid, true);
    assert.equal(validation.operation, "create");
    assert.equal(validation.checks.contentSafety, true);
    const unsafe = await validateStagedCurriculumTopic({
      content: candidate.replace(
        "# Address registration",
        "# Address registration\n\nAnswer: secret",
      ),
      canonicalPath: "topics/a1/address-registration.md",
      canonicalRoot: root,
      sourceRegistry,
    });
    assert.equal(unsafe.valid, false);
    assert.match(unsafe.issues.join("\n"), /answer-leakage/u);
    await assert.rejects(
      validateStagedCurriculumTopic({
        content: candidate,
        canonicalPath: "topics/a1/../escape.md",
        sourceRegistry,
      }),
      CurriculumResearchValidationError,
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test("promotion is proposal-first and requires explicit approval before canonical write", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "open-deutsch-research-promotion-"));
  try {
    const canonicalRoot = path.join(root, "content", "curriculum");
    const manifest = {
      schemaVersion: 1,
      snapshotVersion: "0.1.0",
      bands: { a1: [], a2: [], b1: [], b2: [] },
    };
    const proposal = await prepareCurriculumPromotion({
      content: candidate,
      canonicalPath: "topics/a1/address-registration.md",
      canonicalRoot,
      sourceRegistry,
      manifest,
    });
    assert.equal(proposal.proposedFiles[0].operation, "create");
    assert.match(renderResearchValidationReport(proposal.validation), /contentSafety/u);
    await assert.rejects(
      promoteCurriculumTopic({
        content: candidate,
        canonicalPath: "topics/a1/address-registration.md",
        canonicalRoot,
        sourceRegistry,
        manifest,
        approval: "preview",
      }),
      /OD_CURRICULUM_APPROVAL_REQUIRED/u,
    );
    await promoteCurriculumTopic({
      content: candidate,
      canonicalPath: "topics/a1/address-registration.md",
      canonicalRoot,
      sourceRegistry,
      manifest,
      approval: "approved",
    });
    assert.equal(
      await readFile(path.join(canonicalRoot, "topics/a1/address-registration.md"), "utf8"),
      candidate,
    );
    const promotedManifest = parse(
      await readFile(path.join(canonicalRoot, "manifest.yaml"), "utf8"),
    );
    assert.deepEqual(promotedManifest.bands.a1[0], {
      topicId: "curriculum-topic_0000000000000009",
      domain: "housing-neighborhood",
      path: "topics/a1/address-registration.md",
      status: "foundation-ready",
    });
    await writeFile(path.join(root, "approval-evidence.txt"), "explicit approval fixture\n");
  } finally {
    await rm(root, { recursive: true });
  }
});

test("stale-content detection reports review proposals without changing canonical content", () => {
  const stale = detectStaleCurriculumContent({
    sourceRegistry: {
      ...sourceRegistry,
      sources: [
        {
          sourceId: sourceRegistry.sources[0].sourceId,
          title: "Reviewed public-service source",
          sourceClass: "german-public-service",
          url: "https://example.invalid/public-service",
          publisher: "Example public service",
          supportedClaims: ["A current public-service claim."],
          retrievedOn: "2026-08-20",
          reviewedOn: "2026-08-20",
          freshness: { status: "time-sensitive", reviewDueOn: "2026-08-20" },
        },
      ],
    },
    topics: [
      {
        topicId: "curriculum-topic_0000000000000009",
        slug: "address-registration",
        band: "a1",
        domain: "housing-neighborhood",
        sourceIds: ["curriculum-source_0000000000000001"],
      },
    ],
    today: "2026-08-21",
  });
  assert.deepEqual(stale, [
    {
      topicId: "curriculum-topic_0000000000000009",
      slug: "address-registration",
      band: "a1",
      domain: "housing-neighborhood",
      reasons: ["source review due: curriculum-source_0000000000000001"],
      action: "propose-review",
    },
  ]);
});
