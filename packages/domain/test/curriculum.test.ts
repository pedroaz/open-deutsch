import { toBoundaryJsonSchema } from "@open-deutsch/contracts";
import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  curriculumDomains,
  curriculumManifestSchema,
  curriculumReadPolicySchema,
  curriculumSourceRegistrySchema,
  curriculumSourceSchema,
  curriculumTopicFrontMatterSchema,
  selectNextCurriculumGap,
} from "../src/index.js";

function topicFixture() {
  const f = createDeterministicContractFactory();
  return {
    schemaVersion: 1,
    topicId: f.nextId("curriculumTopic"),
    slug: "pharmacy-basics",
    band: "a2",
    domain: "health-appointments",
    title: "At the pharmacy",
    status: "foundation-ready",
    communicativeGoals: ["Describe a minor symptom and ask how to use a medicine."],
    prerequisiteTopicIds: [],
    grammarFoundations: [{ key: "modal-verbs", description: "Requests with modal verbs." }],
    vocabularyFoundations: [{ key: "symptoms", description: "Common minor symptoms." }],
    lessonFoundation: {
      explanation: "Use modal verbs for polite pharmacy requests.",
      examples: ["Können Sie mir etwas empfehlen?"],
    },
    exerciseConcepts: [{ key: "role-play", description: "A short pharmacy exchange." }],
    sourceIds: ["curriculum-source_0000000000000001"],
    coverage: {
      reception: { status: "mapped", outcomes: ["Understand a simple dosage instruction."] },
      production: { status: "mapped", outcomes: ["Describe a minor symptom."] },
      interaction: { status: "mapped", outcomes: ["Ask a follow-up question."] },
      mediation: { status: "not-applicable" },
    },
  } as const;
}

describe("curriculum contracts and filesystem schema", () => {
  it("covers the complete accepted everyday-life domain map", () => {
    expect(curriculumDomains).toHaveLength(12);
    expect(curriculumDomains).toContain("public-administration-residency");
    expect(curriculumDomains).toContain("safety-emergencies");
  });

  it("rejects an empty foundation-ready claim", () => {
    const fixture = topicFixture();
    expect(
      curriculumTopicFrontMatterSchema.safeParse({
        ...fixture,
        grammarFoundations: [],
        vocabularyFoundations: [],
        lessonFoundation: undefined,
        exerciseConcepts: [],
        coverage: {
          reception: { status: "not-applicable" },
          production: { status: "not-applicable" },
          interaction: { status: "not-applicable" },
          mediation: { status: "not-applicable" },
        },
      }).success,
    ).toBe(false);
  });

  it("validates topic foundations, prerequisites, sources, and four-skill coverage", () => {
    const topic = curriculumTopicFrontMatterSchema.parse(topicFixture());
    expect(topic.status).toBe("foundation-ready");
    expect(topic.coverage.mediation.status).toBe("not-applicable");
  });

  it("rejects mapped coverage without outcomes and unsafe or mismatched topic metadata", () => {
    const fixture = topicFixture();
    for (const candidate of [
      { ...fixture, band: "c1" },
      { ...fixture, slug: "../../escape" },
      { ...fixture, sourceIds: [] },
      {
        ...fixture,
        coverage: { ...fixture.coverage, interaction: { status: "mapped", outcomes: [] } },
      },
      { ...fixture, privateLearnerExample: "private" },
    ]) {
      expect(curriculumTopicFrontMatterSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("records source class, claims, retrieval/review dates, and freshness chronology", () => {
    const source = {
      sourceId: "curriculum-source_0000000000000001",
      title: "Pharmacy source",
      url: "https://example.invalid/pharmacy",
      publisher: "Example public service",
      sourceClass: "german-public-service",
      supportedClaims: ["How to ask about medicine use."],
      retrievedOn: "2026-08-10",
      reviewedOn: "2026-08-15",
      freshness: { status: "time-sensitive", reviewDueOn: "2027-02-15" },
    } as const;
    expect(curriculumSourceSchema.safeParse(source).success).toBe(true);
    expect(curriculumSourceSchema.safeParse({ ...source, reviewedOn: "2026-08-09" }).success).toBe(
      false,
    );
    expect(
      curriculumSourceSchema.safeParse({
        ...source,
        freshness: { status: "time-sensitive", reviewDueOn: "2026-08-14" },
      }).success,
    ).toBe(false);
  });

  it("accepts only HTTPS citations or contained non-openable repository references", () => {
    const source = {
      sourceId: "curriculum-source_0000000000000001",
      title: "Example pedagogy source",
      publisher: "Example",
      sourceClass: "reputable-pedagogy",
      supportedClaims: ["Example claim."],
      retrievedOn: "2026-08-10",
      reviewedOn: "2026-08-15",
      freshness: { status: "stable" },
    } as const;
    expect(
      curriculumSourceSchema.safeParse({ ...source, url: "https://example.invalid" }).success,
    ).toBe(true);
    for (const url of [
      "http://example.invalid",
      "javascript:alert(1)",
      "file:///tmp/x",
      "mailto:x@example.com",
    ]) {
      expect(curriculumSourceSchema.safeParse({ ...source, url }).success).toBe(false);
    }
    expect(
      curriculumSourceSchema.safeParse({
        ...source,
        sourceClass: "repository-original",
        publisher: "Open Deutsch",
        repositoryPath: "docs/product-requirements.md",
      }).success,
    ).toBe(true);
    expect(
      curriculumSourceSchema.safeParse({
        ...source,
        sourceClass: "repository-original",
        publisher: "Open Deutsch",
        repositoryPath: "docs/../private.md",
      }).success,
    ).toBe(false);
  });

  it("documents source chronology as runtime validation beyond structural JSON", () => {
    const schema = toBoundaryJsonSchema(curriculumSourceRegistrySchema);
    expect(JSON.stringify(schema)).not.toContain("source review chronology is invalid");
    expect(
      curriculumSourceRegistrySchema.safeParse({
        schemaVersion: 1,
        sources: [
          {
            sourceId: "curriculum-source_0000000000000001",
            title: "Example repository source",
            url: "https://example.invalid/source",
            publisher: "Example",
            sourceClass: "repository-original",
            supportedClaims: ["Example claim."],
            retrievedOn: "2026-08-15",
            reviewedOn: "2026-08-14",
            freshness: { status: "stable" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("separates repository authoring reads from immutable packaged reads", () => {
    expect(
      curriculumReadPolicySchema.parse({
        schemaVersion: 1,
        source: {
          mode: "development-repository",
          contentRoot: "content/curriculum",
          mutability: "review-workflow-only",
        },
      }).source.mutability,
    ).toBe("review-workflow-only");
    expect(
      curriculumReadPolicySchema.parse({
        schemaVersion: 1,
        source: {
          mode: "packaged-snapshot",
          resourceRoot: "resources/curriculum",
          snapshotVersion: "0.1.0",
          mutability: "read-only",
        },
      }).source.mutability,
    ).toBe("read-only");
    expect(
      curriculumReadPolicySchema.safeParse({
        schemaVersion: 1,
        source: {
          mode: "packaged-snapshot",
          resourceRoot: "resources/curriculum",
          snapshotVersion: "0.1.0",
          mutability: "writable",
        },
      }).success,
    ).toBe(false);
  });

  it("selects the first dependency-ordered foundation gap and returns none for a complete map", () => {
    const manifest = curriculumManifestSchema.parse({
      schemaVersion: 1,
      snapshotVersion: "0.1.0",
      bands: {
        a1: [
          {
            topicId: "curriculum-topic_0000000000000001",
            domain: "personal-social-life",
            path: "topics/a1/personal-social-life.md",
            status: "foundation-ready",
          },
          {
            topicId: "curriculum-topic_0000000000000002",
            domain: "housing-neighborhood",
            path: "topics/a1/housing-neighborhood.md",
            status: "foundation-incomplete",
          },
        ],
        a2: [],
        b1: [],
        b2: [],
      },
    });
    expect(selectNextCurriculumGap(manifest)).toMatchObject({
      topicId: "curriculum-topic_0000000000000002",
      band: "a1",
      domain: "housing-neighborhood",
    });
    expect(
      selectNextCurriculumGap({
        ...manifest,
        bands: {
          ...manifest.bands,
          a1: manifest.bands.a1.map((entry) => ({ ...entry, status: "foundation-ready" as const })),
        },
      }),
    ).toBeNull();
  });

  it("projects closed topic, manifest, registry, and read-policy JSON schemas", () => {
    for (const boundary of [
      curriculumTopicFrontMatterSchema,
      curriculumManifestSchema,
      curriculumSourceRegistrySchema,
      curriculumReadPolicySchema,
    ]) {
      const schema = toBoundaryJsonSchema(boundary) as Record<string, unknown>;
      expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(JSON.stringify(schema)).toContain('"additionalProperties":false');
    }
  });
});
