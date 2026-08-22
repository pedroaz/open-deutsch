import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

import {
  curriculumManifestSchema,
  curriculumSourceRegistrySchema,
  curriculumTopicFrontMatterSchema,
} from "../../packages/domain/dist/index.js";

export class CurriculumValidationError extends Error {
  constructor(issues) {
    super(`Curriculum validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "CurriculumValidationError";
    this.issues = issues;
  }
}

function parseYaml(source, file, issues) {
  const document = parseDocument(source, { prettyErrors: false, uniqueKeys: true });
  for (const error of document.errors) issues.push(`${file}: invalid YAML: ${error.message}`);
  if (document.errors.length > 0) return undefined;
  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    issues.push(`${file}: invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function parseTopic(source, file, issues) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(source);
  if (!match) {
    issues.push(`${file}: required YAML front matter is missing or unterminated`);
    return undefined;
  }
  if (match[2].trim() === "") issues.push(`${file}: Markdown body must be non-empty`);
  const metadata = parseYaml(match[1], file, issues);
  const parsed = curriculumTopicFrontMatterSchema.safeParse(metadata);
  if (!parsed.success) {
    issues.push(`${file}: front matter does not satisfy curriculumTopicFrontMatterSchema`);
    return undefined;
  }
  return parsed.data;
}

function duplicates(values) {
  const seen = new Set();
  return new Set(values.filter((value) => (seen.has(value) ? true : !seen.add(value))));
}

function requireUnique(values, label, issues) {
  for (const value of duplicates(values)) issues.push(`${label} must be unique: ${value}`);
}

function detectPrerequisiteCycles(topics, issues) {
  const byId = new Map(topics.map((topic) => [topic.topicId, topic]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) {
      issues.push(`curriculum prerequisite graph contains a cycle at ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of byId.get(id)?.prerequisiteTopicIds ?? []) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
}

function validateCompleteBandProgression(topics, issues) {
  const bands = ["a1", "a2", "b1", "b2"];
  const domains = [
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
  if (topics.length !== bands.length * domains.length) return;
  const byBandDomain = new Map(topics.map((topic) => [`${topic.band}:${topic.domain}`, topic]));
  for (const domain of domains) {
    for (let position = 0; position < bands.length; position += 1) {
      const band = bands[position];
      const topic = byBandDomain.get(`${band}:${domain}`);
      if (!topic) {
        issues.push(`complete curriculum map is missing ${band}/${domain}`);
        continue;
      }
      for (const dimension of ["reception", "production", "interaction", "mediation"]) {
        if (topic.coverage[dimension].status !== "mapped") {
          issues.push(`${topic.topicId}: ${dimension} coverage must be mapped in the complete map`);
        }
      }
      if (position === 0) continue;
      const previous = byBandDomain.get(`${bands[position - 1]}:${domain}`);
      if (previous && !topic.prerequisiteTopicIds.includes(previous.topicId)) {
        issues.push(`${topic.topicId}: progression must require ${previous.topicId}`);
      }
    }
  }
}

export async function validateCurriculumFilesystem(root, { repositoryRoot } = {}) {
  const rootPath = root instanceof URL ? fileURLToPath(root) : root;
  const repositoryRootPath =
    repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : repositoryRoot;
  const issues = [];
  let manifestValue;
  let registryValue;
  try {
    manifestValue = parseYaml(
      await readFile(path.join(rootPath, "manifest.yaml"), "utf8"),
      "manifest.yaml",
      issues,
    );
  } catch (error) {
    issues.push(
      `manifest.yaml: ${error instanceof Error ? (error.code ?? error.message) : String(error)}`,
    );
  }
  try {
    registryValue = parseYaml(
      await readFile(path.join(rootPath, "sources.yaml"), "utf8"),
      "sources.yaml",
      issues,
    );
  } catch (error) {
    issues.push(
      `sources.yaml: ${error instanceof Error ? (error.code ?? error.message) : String(error)}`,
    );
  }
  const manifestResult = curriculumManifestSchema.safeParse(manifestValue);
  const registryResult = curriculumSourceRegistrySchema.safeParse(registryValue);
  if (!manifestResult.success)
    issues.push("manifest.yaml: does not satisfy curriculumManifestSchema");
  if (!registryResult.success)
    issues.push("sources.yaml: does not satisfy curriculumSourceRegistrySchema");

  const discoveredPaths = [];
  try {
    for (const entry of await readdir(path.join(rootPath, "topics"), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const absolute = path.join(entry.parentPath, entry.name);
      discoveredPaths.push(path.relative(rootPath, absolute).split(path.sep).join("/"));
    }
  } catch (error) {
    if (error?.code !== "ENOENT")
      issues.push(`topics: ${error instanceof Error ? error.message : String(error)}`);
  }

  const manifestEntries = manifestResult.success
    ? Object.entries(manifestResult.data.bands).flatMap(([band, entries]) =>
        entries.map((entry) => ({ ...entry, band })),
      )
    : [];
  requireUnique(
    manifestEntries.map(({ topicId }) => topicId),
    "manifest topicId",
    issues,
  );
  requireUnique(
    manifestEntries.map(({ path: file }) => file),
    "manifest path",
    issues,
  );
  requireUnique(
    registryResult.success ? registryResult.data.sources.map(({ sourceId }) => sourceId) : [],
    "sourceId",
    issues,
  );
  const manifestPaths = new Set(manifestEntries.map(({ path: file }) => file));
  for (const file of discoveredPaths)
    if (!manifestPaths.has(file)) issues.push(`${file}: topic is not declared in manifest.yaml`);
  for (const file of manifestPaths)
    if (!discoveredPaths.includes(file)) issues.push(`${file}: manifest topic file is missing`);

  const topics = [];
  for (const entry of manifestEntries) {
    if (!discoveredPaths.includes(entry.path)) continue;
    const metadata = parseTopic(
      await readFile(path.join(rootPath, entry.path), "utf8"),
      entry.path,
      issues,
    );
    if (!metadata) continue;
    topics.push(metadata);
    const expectedSlug = path.basename(entry.path, ".md");
    for (const [field, expected, actual] of [
      ["topicId", entry.topicId, metadata.topicId],
      ["band", entry.band, metadata.band],
      ["slug", expectedSlug, metadata.slug],
      ["domain", entry.domain, metadata.domain],
      ["status", entry.status, metadata.status],
    ]) {
      if (expected !== actual) issues.push(`${entry.path}: ${field} does not match manifest/path`);
    }
    requireUnique(metadata.prerequisiteTopicIds, `${entry.path} prerequisiteTopicIds`, issues);
    requireUnique(metadata.sourceIds, `${entry.path} sourceIds`, issues);
    for (const field of ["grammarFoundations", "vocabularyFoundations", "exerciseConcepts"]) {
      requireUnique(
        metadata[field].map(({ key }) => key),
        `${entry.path} ${field} keys`,
        issues,
      );
    }
  }
  requireUnique(
    topics.map(({ topicId }) => topicId),
    "topic front-matter topicId",
    issues,
  );
  const topicIds = new Set(topics.map(({ topicId }) => topicId));
  const sourceIds = new Set(
    registryResult.success ? registryResult.data.sources.map(({ sourceId }) => sourceId) : [],
  );
  if (registryResult.success) {
    const originalSources = registryResult.data.sources.filter(
      ({ sourceClass }) => sourceClass === "repository-original",
    );
    if (originalSources.length > 0 && repositoryRootPath === undefined) {
      issues.push("repositoryRoot is required for repository-original sources");
    } else if (repositoryRootPath !== undefined) {
      const trustedRoot = await realpath(repositoryRootPath);
      for (const source of originalSources) {
        const candidate = path.join(trustedRoot, source.repositoryPath);
        try {
          const [resolved, stat] = await Promise.all([realpath(candidate), lstat(candidate)]);
          if (
            !resolved.startsWith(`${trustedRoot}${path.sep}`) ||
            stat.isSymbolicLink() ||
            !stat.isFile()
          ) {
            issues.push(`${source.sourceId}: repositoryPath is not a contained regular file`);
          }
        } catch {
          issues.push(`${source.sourceId}: repositoryPath does not exist`);
        }
      }
    }
  }
  for (const topic of topics) {
    for (const prerequisite of topic.prerequisiteTopicIds) {
      if (prerequisite === topic.topicId)
        issues.push(`${topic.topicId}: topic cannot require itself`);
      else if (!topicIds.has(prerequisite))
        issues.push(`${topic.topicId}: prerequisite does not exist: ${prerequisite}`);
    }
    for (const sourceId of topic.sourceIds)
      if (!sourceIds.has(sourceId))
        issues.push(`${topic.topicId}: source does not exist: ${sourceId}`);
  }
  detectPrerequisiteCycles(topics, issues);
  validateCompleteBandProgression(topics, issues);
  if (issues.length > 0) throw new CurriculumValidationError(issues);
  return {
    snapshotVersion: manifestResult.data.snapshotVersion,
    topicCount: topics.length,
    sourceCount: registryResult.data.sources.length,
  };
}
