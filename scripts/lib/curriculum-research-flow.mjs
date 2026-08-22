import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

import { parseDocument, stringify } from "yaml";

import {
  curriculumManifestSchema,
  curriculumSourceRegistrySchema,
  curriculumTopicFrontMatterSchema,
} from "../../packages/domain/dist/index.js";

const canonicalTopicPathPattern = /^topics\/(a1|a2|b1|b2)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u;
const promptInjectionPattern =
  /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|earlier|system)\s+instructions/iu;
const answerLeakagePattern = /(?:^|\n)\s*(?:answer|solution|correct answer)\s*:/iu;
const privateDataPattern =
  /(?:api[_ -]?key|access[_ -]?token|learner[_ -]?history|private[_ -]?prompt)/iu;

export class CurriculumResearchValidationError extends Error {
  constructor(issues) {
    super(
      `Curriculum research validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
    this.name = "CurriculumResearchValidationError";
    this.issues = issues;
  }
}

function parseFrontMatter(source, file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(source);
  if (!match) throw new CurriculumResearchValidationError([`${file}: front matter is required`]);
  const document = parseDocument(match[1], { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new CurriculumResearchValidationError(
      document.errors.map((error) => `${file}: invalid YAML: ${error.message}`),
    );
  }
  return { metadata: document.toJS({ maxAliasCount: 0 }), body: match[2] };
}

function safeCanonicalPath(canonicalPath) {
  if (typeof canonicalPath !== "string" || canonicalPath.includes("\0")) {
    throw new CurriculumResearchValidationError(["canonical path is invalid"]);
  }
  const normalized = path.posix.normalize(canonicalPath.replaceAll(path.sep, "/"));
  if (normalized !== canonicalPath || !canonicalTopicPathPattern.test(normalized)) {
    throw new CurriculumResearchValidationError([
      "canonical path must be topics/<band>/<slug>.md without traversal",
    ]);
  }
  return normalized;
}

function assertUniqueFoundationKeys(metadata, issues) {
  for (const field of ["grammarFoundations", "vocabularyFoundations", "exerciseConcepts"]) {
    const keys = metadata[field].map(({ key }) => key);
    if (new Set(keys).size !== keys.length) issues.push(`${field} contains duplicate keys`);
  }
}

function checkContentSafety(body, issues) {
  if (body.trim().length === 0) issues.push("Markdown body must be non-empty");
  if (promptInjectionPattern.test(body))
    issues.push("source-like text contains a prompt-injection instruction");
  if (answerLeakagePattern.test(body))
    issues.push("candidate body contains an answer-leakage label");
  if (privateDataPattern.test(body)) issues.push("candidate body contains a private-data marker");
}

async function readExistingCanonical(canonicalRoot, canonicalPath) {
  const absolute = path.join(canonicalRoot, canonicalPath);
  try {
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new CurriculumResearchValidationError([
        `${canonicalPath}: canonical target is not a regular file`,
      ]);
    }
    return await readFile(absolute, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function validateStagedCurriculumTopic({
  content,
  canonicalPath,
  canonicalRoot,
  sourceRegistry,
}) {
  const normalizedPath = safeCanonicalPath(canonicalPath);
  const { metadata, body } = parseFrontMatter(content, normalizedPath);
  const issues = [];
  const parsed = curriculumTopicFrontMatterSchema.safeParse(metadata);
  if (!parsed.success) {
    issues.push("front matter does not satisfy curriculumTopicFrontMatterSchema");
  } else {
    const [, band, slug] = canonicalTopicPathPattern.exec(normalizedPath);
    if (parsed.data.band !== band) issues.push("front matter band does not match canonical path");
    if (parsed.data.slug !== slug) issues.push("front matter slug does not match canonical path");
    if (parsed.data.status !== "foundation-ready")
      issues.push("promotable topic must be foundation-ready");
    if (parsed.data.prerequisiteTopicIds.includes(parsed.data.topicId))
      issues.push("topic cannot require itself");
    assertUniqueFoundationKeys(parsed.data, issues);
    const knownSourceIds = new Set(sourceRegistry.sources.map(({ sourceId }) => sourceId));
    for (const sourceId of parsed.data.sourceIds) {
      if (!knownSourceIds.has(sourceId))
        issues.push(`source does not exist in registry: ${sourceId}`);
    }
    if (/\b(?:C1|C2)\b/u.test(JSON.stringify(parsed.data))) {
      issues.push("A1-B2 candidate contains an out-of-scope C1/C2 level marker");
    }
  }
  checkContentSafety(body, issues);
  let existing = null;
  if (canonicalRoot !== undefined && issues.length === 0) {
    existing = await readExistingCanonical(canonicalRoot, normalizedPath);
    if (existing !== null) {
      const current = parseFrontMatter(existing, normalizedPath).metadata;
      if (current.topicId !== parsed.data.topicId)
        issues.push("canonical path already belongs to a different topicId");
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    metadata: parsed.success ? parsed.data : null,
    operation: existing === null ? "create" : "update",
    canonicalPath: normalizedPath,
    checks: {
      requiredMetadata: parsed.success,
      cefrScope: parsed.success && !/\b(?:C1|C2)\b/u.test(JSON.stringify(parsed.data)),
      sourceCoverage:
        parsed.success && issues.every((issue) => !issue.startsWith("source does not exist")),
      contentSafety:
        !promptInjectionPattern.test(body) &&
        !answerLeakagePattern.test(body) &&
        !privateDataPattern.test(body),
      pathSafety: true,
    },
  };
}

export async function prepareCurriculumPromotion(input) {
  const sourceRegistry = curriculumSourceRegistrySchema.parse(input.sourceRegistry);
  const validation = await validateStagedCurriculumTopic({ ...input, sourceRegistry });
  if (!validation.valid) throw new CurriculumResearchValidationError(validation.issues);
  const current =
    input.canonicalRoot === undefined
      ? null
      : await readExistingCanonical(input.canonicalRoot, validation.canonicalPath);
  return {
    validation,
    sourceSummary: sourceRegistry.sources
      .filter(({ sourceId }) => validation.metadata.sourceIds.includes(sourceId))
      .map(({ sourceId, title, publisher, sourceClass, supportedClaims, freshness }) => ({
        sourceId,
        title,
        publisher,
        sourceClass,
        supportedClaims,
        freshness,
      })),
    proposedFiles: [
      {
        path: validation.canonicalPath,
        operation: validation.operation,
        beforeBytes: current === null ? 0 : Buffer.byteLength(current, "utf8"),
        afterBytes: Buffer.byteLength(input.content, "utf8"),
      },
    ],
  };
}

async function writeTemporaryFile(target, content) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.next`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  return temporary;
}

function manifestWithPromotedTopic(manifest, metadata, canonicalPath) {
  const parsed = curriculumManifestSchema.parse(manifest);
  const bands = { ...parsed.bands };
  const band = metadata.band;
  const existing = bands[band].find(({ path: entryPath }) => entryPath === canonicalPath);
  if (existing !== undefined && existing.topicId !== metadata.topicId) {
    throw new CurriculumResearchValidationError([
      `${canonicalPath}: manifest topicId conflicts with candidate`,
    ]);
  }
  if (existing === undefined) {
    bands[band] = [
      ...bands[band],
      {
        topicId: metadata.topicId,
        domain: metadata.domain,
        path: canonicalPath,
        status: metadata.status,
      },
    ];
  } else {
    bands[band] = bands[band].map((entry) =>
      entry.path === canonicalPath
        ? { ...entry, topicId: metadata.topicId, domain: metadata.domain, status: metadata.status }
        : entry,
    );
  }
  return curriculumManifestSchema.parse({ ...parsed, bands });
}

export async function promoteCurriculumTopic(input) {
  if (input.approval !== "approved") throw new Error("OD_CURRICULUM_APPROVAL_REQUIRED");
  const sourceRegistry = curriculumSourceRegistrySchema.parse(input.sourceRegistry);
  const proposal = await prepareCurriculumPromotion({ ...input, sourceRegistry });
  const canonicalRoot = path.resolve(input.canonicalRoot);
  const target = path.join(canonicalRoot, proposal.validation.canonicalPath);
  const targetRelative = path.relative(canonicalRoot, target);
  if (targetRelative.startsWith("..") || path.isAbsolute(targetRelative))
    throw new Error("OD_CURRICULUM_CANONICAL_PATH_INVALID");
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  const writes = [{ target, content: input.content }];
  if (input.manifest !== undefined) {
    const nextManifest = manifestWithPromotedTopic(
      input.manifest,
      proposal.validation.metadata,
      proposal.validation.canonicalPath,
    );
    writes.push({
      target: path.join(canonicalRoot, "manifest.yaml"),
      content: stringify(nextManifest),
    });
    writes.push({
      target: path.join(canonicalRoot, "sources.yaml"),
      content: stringify(sourceRegistry),
    });
  }
  const temporaryFiles = [];
  try {
    for (const write of writes) {
      await mkdir(path.dirname(write.target), { recursive: true, mode: 0o755 });
      temporaryFiles.push({
        temporary: await writeTemporaryFile(write.target, write.content),
        target: write.target,
      });
    }
    for (const { temporary, target: writeTarget } of temporaryFiles) {
      await rename(temporary, writeTarget);
    }
  } finally {
    for (const { temporary } of temporaryFiles) {
      await unlink(temporary).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
  }
  return proposal;
}

export function renderResearchValidationReport(validation) {
  return `${stringify({
    schemaVersion: 1,
    valid: validation.valid,
    canonicalPath: validation.canonicalPath,
    operation: validation.operation,
    checks: validation.checks,
    issues: validation.issues,
  })}`;
}

export function detectStaleCurriculumContent({ sourceRegistry, topics, today }) {
  const registry = curriculumSourceRegistrySchema.parse(sourceRegistry);
  const sourcesById = new Map(registry.sources.map((source) => [source.sourceId, source]));
  return topics.flatMap((topic) => {
    const sources = topic.sourceIds.map((sourceId) => sourcesById.get(sourceId)).filter(Boolean);
    const reasons = [];
    for (const source of sources) {
      if (source.freshness.status === "time-sensitive" && source.freshness.reviewDueOn < today) {
        reasons.push(`source review due: ${source.sourceId}`);
      }
    }
    if (
      sources.length === 0 ||
      sources.every(({ sourceClass }) => sourceClass === "repository-original")
    ) {
      reasons.push(
        "weak source coverage: no external framework, public-service, or pedagogy source",
      );
    }
    return reasons.length === 0
      ? []
      : [
          {
            topicId: topic.topicId,
            slug: topic.slug,
            band: topic.band,
            domain: topic.domain,
            reasons,
            action: "propose-review",
          },
        ];
  });
}
