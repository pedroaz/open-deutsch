import { lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { strictBoundaryObject, z } from "@open-deutsch/contracts";

import { resolveDataRootLayout } from "./data-root-layout.js";

export const researchStagingBuckets = ["notes", "downloads", "candidates", "validation"] as const;
export const researchStagingBucketSchema = z.enum(researchStagingBuckets);

export const researchStagingManifestSchema = strictBoundaryObject({
  schemaVersion: z.literal(1),
  artifactId: z.string().regex(/^curriculum-stage_[0-9a-z]{16,64}$/u),
  band: z.enum(["a1", "a2", "b1", "b2"]),
  domain: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  status: z.enum(["draft", "validated", "approved", "rejected"]),
  candidatePath: z.string().min(1).max(240),
  sourceSummaryPath: z.string().min(1).max(240),
  validationReportPath: z.string().min(1).max(240),
});

export type ResearchStagingBucket = (typeof researchStagingBuckets)[number];
export type ResearchStagingManifest = z.infer<typeof researchStagingManifestSchema>;
export type ResearchStagingLayout = Readonly<{
  dataRoot: string;
  stagingRoot: string;
  cacheRoot: string;
  notes: string;
  downloads: string;
  candidates: string;
  validation: string;
}>;

export const researchStagingMaximumBytes = 2 * 1024 * 1024;

export function resolveResearchStagingLayout(dataRoot: string): ResearchStagingLayout {
  const root = resolveDataRootLayout(dataRoot);
  return Object.freeze({
    dataRoot: root.dataRoot,
    stagingRoot: root.researchStaging,
    cacheRoot: root.researchCache,
    notes: path.join(root.researchStaging, "notes"),
    downloads: path.join(root.researchStaging, "downloads"),
    candidates: path.join(root.researchStaging, "candidates"),
    validation: path.join(root.researchStaging, "validation"),
  });
}

function currentUid(): number {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("OD_RESEARCH_STAGING_PLATFORM_UNSUPPORTED");
  return uid;
}

function assertRelativePath(relativePath: string): string {
  if (
    relativePath.length === 0 ||
    relativePath.length > 240 ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("OD_RESEARCH_STAGING_PATH_INVALID");
  }
  const normalized = path.posix.normalize(relativePath.replaceAll(path.sep, "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.endsWith("/..") ||
    normalized.includes("\\")
  ) {
    throw new Error("OD_RESEARCH_STAGING_PATH_INVALID");
  }
  return normalized;
}

async function assertNoSymlinkTraversal(candidate: string): Promise<void> {
  const normalized = path.normalize(candidate);
  const parsed = path.parse(normalized);
  let cursor = parsed.root;
  for (const segment of normalized.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink()) throw new Error("OD_RESEARCH_STAGING_SYMLINK_UNSAFE");
      if (cursor !== normalized && !metadata.isDirectory()) {
        throw new Error("OD_RESEARCH_STAGING_TRAVERSAL_INVALID");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function ensureDirectory(directory: string): Promise<void> {
  await assertNoSymlinkTraversal(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("OD_RESEARCH_STAGING_DIRECTORY_INVALID");
  }
  if (metadata.uid !== currentUid()) throw new Error("OD_RESEARCH_STAGING_NOT_OWNED");
  await assertNoSymlinkTraversal(directory);
}

export async function ensureResearchStagingLayout(
  dataRoot: string,
): Promise<ResearchStagingLayout> {
  const layout = resolveResearchStagingLayout(dataRoot);
  await ensureDirectory(layout.stagingRoot);
  await ensureDirectory(layout.cacheRoot);
  for (const directory of [layout.notes, layout.downloads, layout.candidates, layout.validation]) {
    await ensureDirectory(directory);
  }
  return layout;
}

function bucketDirectory(layout: ResearchStagingLayout, bucket: ResearchStagingBucket): string {
  return layout[bucket];
}

export async function writeResearchStagingFile(input: {
  dataRoot: string;
  bucket: ResearchStagingBucket;
  relativePath: string;
  content: string;
}): Promise<string> {
  if (Buffer.byteLength(input.content, "utf8") > researchStagingMaximumBytes) {
    throw new Error("OD_RESEARCH_STAGING_FILE_TOO_LARGE");
  }
  const layout = await ensureResearchStagingLayout(input.dataRoot);
  const relativePath = assertRelativePath(input.relativePath);
  const directory = bucketDirectory(layout, input.bucket);
  const target = path.resolve(directory, relativePath);
  const contained = path.relative(directory, target);
  if (contained === "" || contained.startsWith("..") || path.isAbsolute(contained)) {
    throw new Error("OD_RESEARCH_STAGING_PATH_INVALID");
  }
  await assertNoSymlinkTraversal(path.dirname(target));
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await assertNoSymlinkTraversal(path.dirname(target));
  const file = await open(target, "wx", 0o600);
  try {
    await file.writeFile(input.content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  return target;
}

export async function readResearchStagingFile(input: {
  dataRoot: string;
  bucket: ResearchStagingBucket;
  relativePath: string;
}): Promise<string> {
  const layout = resolveResearchStagingLayout(input.dataRoot);
  const relativePath = assertRelativePath(input.relativePath);
  const directory = bucketDirectory(layout, input.bucket);
  const target = path.resolve(directory, relativePath);
  const contained = path.relative(directory, target);
  if (contained === "" || contained.startsWith("..") || path.isAbsolute(contained)) {
    throw new Error("OD_RESEARCH_STAGING_PATH_INVALID");
  }
  await assertNoSymlinkTraversal(target);
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("OD_RESEARCH_STAGING_FILE_INVALID");
  }
  if (metadata.size > researchStagingMaximumBytes) {
    throw new Error("OD_RESEARCH_STAGING_FILE_TOO_LARGE");
  }
  return readFile(target, "utf8");
}

export async function writeResearchStagingManifest(
  dataRoot: string,
  manifest: ResearchStagingManifest,
): Promise<string> {
  const parsed = researchStagingManifestSchema.parse(manifest);
  return writeResearchStagingFile({
    dataRoot,
    bucket: "validation",
    relativePath: `${parsed.artifactId}.json`,
    content: `${JSON.stringify(parsed, null, 2)}\n`,
  });
}

export async function removeResearchStagingFile(input: {
  dataRoot: string;
  bucket: ResearchStagingBucket;
  relativePath: string;
}): Promise<void> {
  const layout = resolveResearchStagingLayout(input.dataRoot);
  const relativePath = assertRelativePath(input.relativePath);
  const directory = bucketDirectory(layout, input.bucket);
  const target = path.resolve(directory, relativePath);
  await assertNoSymlinkTraversal(target);
  await unlink(target);
}
