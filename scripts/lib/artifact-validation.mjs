import { spawnSync } from "node:child_process";
import { lstat, open, readFile } from "node:fs/promises";
import path from "node:path";

import postcss from "postcss";
import { parseDocument } from "yaml";

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const forbiddenPrivateExtensions = new Set([
  ".db",
  ".key",
  ".p12",
  ".pem",
  ".pfx",
  ".sqlite",
  ".sqlite3",
]);
const reviewedBinaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".otf",
  ".png",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
]);
const fixtureManifestPath = "tests/fixtures/manifest.yaml";
const contentScanLimit = 5 * 1024 * 1024;

function hasReviewedBinarySignature(extension, buffer) {
  const ascii = (start, end) => buffer.subarray(start, end).toString("ascii");
  switch (extension) {
    case ".png":
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case ".jpg":
    case ".jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case ".gif":
      return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
    case ".webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case ".ico":
      return buffer.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]));
    case ".woff":
      return ascii(0, 4) === "wOFF";
    case ".woff2":
      return ascii(0, 4) === "wOF2";
    case ".ttf":
      return buffer.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) || ascii(0, 4) === "true";
    case ".otf":
      return ascii(0, 4) === "OTTO";
    default:
      return false;
  }
}

export class ArtifactValidationError extends Error {
  constructor(issues) {
    super(`Artifact validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ArtifactValidationError";
    this.issues = issues;
  }
}

function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
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

function parseJson(source, file, issues) {
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    issues.push(`${file}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
  const uniquenessDocument = parseDocument(source, {
    json: true,
    prettyErrors: false,
    uniqueKeys: true,
  });
  for (const error of uniquenessDocument.errors) {
    issues.push(`${file}: invalid JSON: ${error.message}`);
  }
  return uniquenessDocument.errors.length === 0 ? value : undefined;
}

export function parseFrontMatter(source, file, issues = []) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) {
    issues.push(`${file}: required YAML front matter is missing or unterminated`);
    return undefined;
  }
  const metadata = parseYaml(match[1], file, issues);
  if (!asRecord(metadata)) {
    issues.push(`${file}: YAML front matter must be a mapping`);
    return undefined;
  }
  return metadata;
}

function requireNonemptyString(record, key, file, issues) {
  if (typeof record[key] !== "string" || record[key].trim() === "") {
    issues.push(`${file}: ${key} must be a non-empty string`);
  }
}

function validatePluginManifest(manifest, file, root, repositoryFiles, issues) {
  const record = asRecord(manifest);
  if (!record) {
    issues.push(`${file}: plugin manifest must be a JSON object`);
    return;
  }
  requireNonemptyString(record, "name", file, issues);
  requireNonemptyString(record, "version", file, issues);
  requireNonemptyString(record, "description", file, issues);
  if (typeof record.name === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.name)) {
    issues.push(`${file}: plugin name must use stable kebab case`);
  }
  if (typeof record.version === "string" && !/^\d+\.\d+\.\d+$/.test(record.version)) {
    issues.push(`${file}: plugin version must be an exact stable semantic version`);
  }
  if (record.skills !== undefined) {
    if (typeof record.skills !== "string" || !/^\.\/[A-Za-z0-9._/-]+\/$/.test(record.skills)) {
      issues.push(`${file}: skills must be a relative plugin directory ending in /`);
    } else {
      const pluginRoot = path.resolve(root, path.dirname(file), "..");
      const resolved = path.resolve(pluginRoot, record.skills);
      if (!resolved.startsWith(`${pluginRoot}${path.sep}`)) {
        issues.push(`${file}: skills path escapes the plugin root`);
      } else {
        const pluginRootRelative = path.posix.dirname(path.posix.dirname(file));
        const normalizedSkillsPath = path.posix.normalize(
          path.posix.join(pluginRootRelative, record.skills),
        );
        const skillsPrefix = normalizedSkillsPath.endsWith("/")
          ? normalizedSkillsPath
          : `${normalizedSkillsPath}/`;
        if (
          !repositoryFiles.some(
            (candidate) => candidate.startsWith(skillsPrefix) && candidate.endsWith("/SKILL.md"),
          )
        ) {
          issues.push(`${file}: declared skills directory must contain at least one SKILL.md`);
        }
      }
    }
  }
}

function validateSkillFrontMatter(metadata, file, issues) {
  if (!metadata) return;
  requireNonemptyString(metadata, "name", file, issues);
  requireNonemptyString(metadata, "description", file, issues);
  if (typeof metadata.name === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name)) {
    issues.push(`${file}: skill name must use kebab case`);
  }
}

function flattenTranslationKeys(value, file, issues, prefix = "", keys = new Set()) {
  const record = asRecord(value);
  if (!record) {
    issues.push(`${file}: translation catalog must be an object`);
    return keys;
  }
  for (const [key, child] of Object.entries(record)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      if (child.trim() === "") issues.push(`${file}: translation ${fullKey} must not be blank`);
      keys.add(fullKey);
    } else if (asRecord(child)) {
      flattenTranslationKeys(child, file, issues, fullKey, keys);
    } else {
      issues.push(`${file}: translation ${fullKey} must be a string or nested object`);
    }
  }
  return keys;
}

function translationIdentity(file) {
  const match = /^(.*\/(?:i18n|locales))\/(en|de)\.(json|ya?ml)$/.exec(file);
  return match ? { group: `${match[1]}:${match[3]}`, locale: match[2] } : undefined;
}

function validateTranslations(parsedArtifacts, issues) {
  const groups = new Map();
  for (const [file, value] of parsedArtifacts) {
    const identity = translationIdentity(file);
    if (!identity) continue;
    const group = groups.get(identity.group) ?? new Map();
    group.set(identity.locale, { file, keys: flattenTranslationKeys(value, file, issues) });
    groups.set(identity.group, group);
  }
  for (const [groupName, group] of groups) {
    const english = group.get("en");
    const german = group.get("de");
    if (!english || !german) {
      issues.push(`${groupName}: English and German translation catalogs must both exist`);
      continue;
    }
    for (const key of english.keys) {
      if (!german.keys.has(key)) issues.push(`${german.file}: missing translation key ${key}`);
    }
    for (const key of german.keys) {
      if (!english.keys.has(key)) issues.push(`${english.file}: missing translation key ${key}`);
    }
  }
}

function validateDesignTokens(file, source, issues) {
  if (!file.startsWith("apps/desktop/src/")) return;
  if (file.endsWith(".tsx") && /\bstyle\s*=\s*\{\s*\{/.test(source)) {
    issues.push(`${file}: inline style objects bypass shared CSS design tokens`);
  }
  if (!file.endsWith(".css")) return;
  let stylesheet;
  try {
    stylesheet = postcss.parse(source, { from: file });
  } catch (error) {
    issues.push(`${file}: invalid CSS: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const isTokenDefinition = /(?:^|\/)(?:design-)?tokens\.css$/.test(file);
  if (isTokenDefinition) {
    stylesheet.walkDecls((declaration) => {
      if (declaration.prop.startsWith("--") && !declaration.prop.startsWith("--od-")) {
        issues.push(`${file}: design token ${declaration.prop} must use the --od- prefix`);
      }
    });
    return;
  }
  stylesheet.walkDecls((declaration) => {
    const value = declaration.value;
    const usesToken = /var\(\s*--od-/.test(value);
    const hasRawColor =
      /(?:#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)(?:a)?\s*\()/i.test(value);
    const colorProperty =
      /(?:^|-)(?:color|background|border|outline|shadow|fill|stroke|caret|accent)(?:-|$)/i.test(
        declaration.prop,
      );
    const safeDerivedColor = /^(?:none|inherit|initial|unset|currentColor)$/i.test(value.trim());
    if (hasRawColor || (colorProperty && !usesToken && !safeDerivedColor)) {
      issues.push(
        `${file}: ${declaration.prop} uses a raw color; visual colors must come from shared tokens`,
      );
    }
    if (/\b(?!0(?:\.0+)?(?:\D|$))\d*\.?\d+(?:px|r?em)\b/i.test(value) && !usesToken) {
      issues.push(
        `${file}: ${declaration.prop} uses a raw dimension; layout values must use tokens`,
      );
    }
  });
}

function validateNoPrivateArtifact(file, source, rawBuffer, issues) {
  const extension = path.extname(file).toLowerCase();
  const basename = path.basename(file);
  if (
    forbiddenPrivateExtensions.has(extension) ||
    /\.(?:db|sqlite|sqlite3)-(?:journal|shm|wal)$/i.test(basename)
  ) {
    issues.push(`${file}: private database/key material must never be a repository artifact`);
  }
  if (/(?:^\.env(?:\..+)?$|\.env$)/.test(basename) && !/\.example$/.test(basename)) {
    issues.push(`${file}: environment files with real values must not be committed`);
  }
  const scannedContent = source ?? rawBuffer.toString("latin1");
  const privateKeyHeader = new RegExp(["-----BEGIN", "PRIVATE KEY-----"].join(" "));
  const openAiSecret = new RegExp(["sk", "(?:proj-)?[A-Za-z0-9_-]{20,}"].join("-"), "g");
  if (privateKeyHeader.test(scannedContent)) issues.push(`${file}: private key material detected`);
  if (openAiSecret.test(scannedContent)) {
    issues.push(`${file}: credential-like OpenAI secret detected`);
  }
}

async function validateFixtureManifest(root, files, parsedArtifacts, issues) {
  const fixtureFiles = files
    .filter((file) => file.startsWith("tests/fixtures/"))
    .filter((file) => !["tests/fixtures/README.md", fixtureManifestPath].includes(file))
    .sort();
  const manifest = asRecord(parsedArtifacts.get(fixtureManifestPath));
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.fixtures)) {
    issues.push(`${fixtureManifestPath}: expected schemaVersion 1 and a fixtures array`);
    return;
  }
  const declared = [];
  for (const [index, item] of manifest.fixtures.entries()) {
    const record = asRecord(item);
    const label = `${fixtureManifestPath}: fixtures[${index}]`;
    if (!record || typeof record.path !== "string" || typeof record.purpose !== "string") {
      issues.push(`${label} must contain string path and purpose fields`);
      continue;
    }
    if (!record.path.startsWith("tests/fixtures/") || record.path.includes("..")) {
      issues.push(`${label} path must stay below tests/fixtures`);
      continue;
    }
    if (record.purpose.trim() === "") issues.push(`${label} purpose must not be blank`);
    declared.push(record.path);
    try {
      const fixtureStat = await lstat(path.join(root, record.path));
      if (!fixtureStat.isFile() || fixtureStat.isSymbolicLink()) {
        issues.push(`${record.path}: committed fixtures must be regular files, not symlinks`);
      }
      if (fixtureStat.size > 256 * 1024) {
        issues.push(`${record.path}: committed fixture exceeds the 256 KiB review limit`);
      }
    } catch {
      issues.push(`${record.path}: declared fixture does not exist`);
    }
  }
  if (new Set(declared).size !== declared.length) {
    issues.push(`${fixtureManifestPath}: fixture paths must be unique`);
  }
  if (declared.join("\n") !== [...declared].sort().join("\n")) {
    issues.push(`${fixtureManifestPath}: fixture paths must be sorted`);
  }
  const declaredSorted = [...new Set(declared)].sort();
  if (declaredSorted.join("\n") !== fixtureFiles.join("\n")) {
    issues.push(`${fixtureManifestPath}: every committed fixture must be declared exactly once`);
  }
}

export function listRepositoryFiles(root) {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "git ls-files failed");
  return result.stdout.split("\0").filter(Boolean).sort();
}

async function readScannableText(absolute, file, fileStat, issues) {
  const bytesToRead = Math.min(fileStat.size, contentScanLimit);
  const buffer = Buffer.alloc(bytesToRead);
  const handle = await open(absolute, "r");
  try {
    if (bytesToRead > 0) await handle.read(buffer, 0, bytesToRead, 0);
  } finally {
    await handle.close();
  }
  const extension = path.extname(file).toLowerCase();
  if (fileStat.size > contentScanLimit) {
    issues.push(`${file}: artifact exceeds the 5 MiB complete content-scan limit`);
  }
  const expectsReviewedBinary = reviewedBinaryExtensions.has(extension);
  if (expectsReviewedBinary && !hasReviewedBinarySignature(extension, buffer)) {
    issues.push(`${file}: binary extension does not match its required file signature`);
  }
  if (buffer.includes(0)) {
    if (!expectsReviewedBinary) {
      issues.push(`${file}: unscannable NUL-containing artifact is not an allowed binary asset`);
    }
    return { buffer, text: undefined };
  }
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { buffer, text: source };
  } catch {
    if (!expectsReviewedBinary) {
      issues.push(`${file}: artifact is neither valid UTF-8 nor an allowed binary asset`);
    }
    return { buffer, text: undefined };
  }
}

export async function validateRepositoryArtifacts({ root = process.cwd(), files } = {}) {
  const repositoryFiles = files ?? listRepositoryFiles(root);
  const issues = [];
  const parsedArtifacts = new Map();

  for (const file of repositoryFiles) {
    const absolute = path.join(root, file);
    let fileStat;
    try {
      fileStat = await lstat(absolute);
    } catch {
      continue;
    }
    if (fileStat.isSymbolicLink()) {
      if (file.startsWith("tests/fixtures/")) issues.push(`${file}: fixtures may not be symlinks`);
      continue;
    }
    if (!fileStat.isFile()) continue;

    const extension = path.extname(file).toLowerCase();
    const scanned = await readScannableText(absolute, file, fileStat, issues);
    const source = textExtensions.has(extension) ? await readFile(absolute, "utf8") : scanned.text;
    validateNoPrivateArtifact(file, scanned.text, scanned.buffer, issues);
    if (source === undefined) continue;

    if (extension === ".json") {
      const value = parseJson(source, file, issues);
      if (value !== undefined) {
        parsedArtifacts.set(file, value);
        if (file.endsWith("/.codex-plugin/plugin.json")) {
          validatePluginManifest(value, file, root, repositoryFiles, issues);
        }
      }
    } else if (extension === ".yaml" || extension === ".yml") {
      parsedArtifacts.set(file, parseYaml(source, file, issues));
    }

    if (
      file.startsWith("content/curriculum/") &&
      extension === ".md" &&
      !file.endsWith("/README.md") &&
      !file.endsWith("/AGENTS.md")
    ) {
      parseFrontMatter(source, file, issues);
    }
    if (/^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(file)) {
      validateSkillFrontMatter(parseFrontMatter(source, file, issues), file, issues);
    }
    validateDesignTokens(file, source, issues);
  }

  validateTranslations(parsedArtifacts, issues);
  await validateFixtureManifest(root, repositoryFiles, parsedArtifacts, issues);
  if (issues.length > 0) throw new ArtifactValidationError(issues);
  return { filesChecked: repositoryFiles.length };
}
