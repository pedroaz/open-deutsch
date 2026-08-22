import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parse, stringify } from "yaml";

import {
  CurriculumValidationError,
  validateCurriculumFilesystem,
} from "../scripts/lib/curriculum-validation.mjs";

const topicId = "curriculum-topic_0000000000000001";
const prerequisiteId = "curriculum-topic_0000000000000002";
const sourceId = "curriculum-source_0000000000000001";
const curriculumDomains = [
  "personal-social-life",
  "housing-neighborhood",
  "shopping-services",
  "food",
  "transport-travel",
  "health-appointments",
  "work",
  "education-language-learning",
  "public-administration-residency",
  "digital-communication-media",
  "leisure-culture",
  "safety-emergencies",
];

function topic(overrides = {}) {
  return {
    schemaVersion: 1,
    topicId,
    slug: "pharmacy-basics",
    band: "a2",
    domain: "health-appointments",
    title: "At the pharmacy",
    status: "foundation-ready",
    communicativeGoals: ["Ask for help at a pharmacy."],
    prerequisiteTopicIds: [],
    grammarFoundations: [{ key: "modal-verbs", description: "Polite requests." }],
    vocabularyFoundations: [{ key: "symptoms", description: "Minor symptoms." }],
    lessonFoundation: { explanation: "Use a modal verb.", examples: ["Können Sie helfen?"] },
    exerciseConcepts: [{ key: "role-play", description: "A short exchange." }],
    sourceIds: [sourceId],
    coverage: {
      reception: { status: "mapped", outcomes: ["Understand a simple instruction."] },
      production: { status: "mapped", outcomes: ["Describe a symptom."] },
      interaction: { status: "mapped", outcomes: ["Ask a question."] },
      mediation: { status: "not-applicable" },
    },
    ...overrides,
  };
}

const defaultEntry = {
  topicId,
  domain: "health-appointments",
  path: "topics/a2/pharmacy-basics.md",
  status: "foundation-ready",
};

const defaultSource = {
  sourceId,
  title: "Reviewed fixture authority",
  repositoryPath: "docs/decisions.md",
  publisher: "Open Deutsch",
  sourceClass: "repository-original",
  supportedClaims: ["Fixture claim."],
  retrievedOn: "2026-08-10",
  reviewedOn: "2026-08-15",
  freshness: { status: "stable" },
};

async function createTree({
  metadata = topic(),
  body = "# At the pharmacy\n",
  manifestEntries = [defaultEntry],
  sources = [defaultSource],
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "open-deutsch-curriculum-"));
  await Promise.all([
    mkdir(path.join(root, "topics/a2"), { recursive: true }),
    mkdir(path.join(root, "docs"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(root, "manifest.yaml"),
      stringify({
        schemaVersion: 1,
        snapshotVersion: "0.1.0",
        bands: { a1: [], a2: manifestEntries, b1: [], b2: [] },
      }),
    ),
    writeFile(path.join(root, "sources.yaml"), stringify({ schemaVersion: 1, sources })),
    writeFile(
      path.join(root, "topics/a2/pharmacy-basics.md"),
      `---\n${stringify(metadata)}---\n${body}`,
    ),
    writeFile(path.join(root, "docs/decisions.md"), "# Reviewed fixture authority\n"),
  ]);
  return root;
}

test("checked-in curriculum manifests satisfy the aggregate filesystem contract", async () => {
  const result = await validateCurriculumFilesystem(
    new URL("../content/curriculum/", import.meta.url),
    { repositoryRoot: new URL("../", import.meta.url) },
  );
  assert.deepEqual(result, { snapshotVersion: "0.1.0", topicCount: 48, sourceCount: 6 });
});

test("the reviewed map covers every required band/domain cell", async () => {
  const manifest = parse(
    await readFile(new URL("../content/curriculum/manifest.yaml", import.meta.url), "utf8"),
  );
  for (const band of ["a1", "a2", "b1", "b2"]) {
    assert.deepEqual(
      manifest.bands[band].map(({ domain }) => domain),
      curriculumDomains,
      `${band} domains should follow the opinionated map`,
    );
    assert.ok(manifest.bands[band].every(({ status }) => status === "foundation-ready"));
  }
});

test("a populated curriculum graph validates every manifest/topic/source link", async () => {
  const root = await createTree();
  try {
    assert.deepEqual(await validateCurriculumFilesystem(root, { repositoryRoot: root }), {
      snapshotVersion: "0.1.0",
      topicCount: 1,
      sourceCount: 1,
    });
  } finally {
    await rm(root, { recursive: true });
  }
});

test("aggregate validation rejects duplicate, missing, mismatched, and dangling curriculum data", async () => {
  const cases = [
    { manifestEntries: [defaultEntry, { ...defaultEntry, path: "topics/a2/duplicate.md" }] },
    { manifestEntries: [{ ...defaultEntry, path: "topics/a2/missing.md" }] },
    { metadata: topic({ band: "b1" }) },
    { metadata: topic({ prerequisiteTopicIds: [topicId] }) },
    { metadata: topic({ prerequisiteTopicIds: [prerequisiteId] }) },
    { metadata: topic({ sourceIds: ["curriculum-source_0000000000000009"] }) },
    { sources: [defaultSource, defaultSource] },
    { body: "   \n" },
  ];
  for (const fixture of cases) {
    const root = await createTree(fixture);
    try {
      await assert.rejects(
        validateCurriculumFilesystem(root, { repositoryRoot: root }),
        CurriculumValidationError,
      );
    } finally {
      await rm(root, { recursive: true });
    }
  }
});

test("repository-original provenance must resolve to a contained regular file", async () => {
  for (const mode of ["missing", "symlink"]) {
    const root = await createTree();
    try {
      if (mode === "missing") {
        await rm(path.join(root, "docs/decisions.md"));
      } else {
        const outside = path.join(root, "outside.md");
        await writeFile(outside, "outside\n");
        await rm(path.join(root, "docs/decisions.md"));
        await symlink(outside, path.join(root, "docs/decisions.md"));
      }
      await assert.rejects(
        validateCurriculumFilesystem(root, { repositoryRoot: root }),
        CurriculumValidationError,
      );
    } finally {
      await rm(root, { recursive: true });
    }
  }
});
