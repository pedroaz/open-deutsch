#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputFile = path.join(repositoryRoot, "docs", "third-party-notices.md");
const execFileAsync = promisify(execFile);

function licenseOf(manifest) {
  if (typeof manifest.license === "string" && manifest.license.trim())
    return manifest.license.trim();
  if (Array.isArray(manifest.licenses)) {
    const values = manifest.licenses
      .map((entry) => (typeof entry === "string" ? entry : entry?.type))
      .filter((entry) => typeof entry === "string" && entry.trim());
    if (values.length > 0) return values.join(", ");
  }
  return "UNSPECIFIED (see package metadata)";
}

async function readInstalledPackages() {
  const { stdout } = await execFileAsync(
    "pnpm",
    ["list", "--recursive", "--json", "--depth", "Infinity"],
    { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  const workspaces = JSON.parse(stdout);
  const packages = new Map();
  const visited = new Set();
  async function visitDependencies(dependencies) {
    if (!dependencies || typeof dependencies !== "object") return;
    for (const dependency of Object.values(dependencies)) {
      if (!dependency || typeof dependency !== "object") continue;
      const dependencyPath = dependency.path;
      if (typeof dependencyPath !== "string" || visited.has(dependencyPath)) continue;
      visited.add(dependencyPath);
      try {
        const manifest = JSON.parse(await readFile(path.join(dependencyPath, "package.json")));
        if (
          typeof manifest.name === "string" &&
          manifest.name !== "open-deutsch" &&
          !manifest.name.startsWith("@open-deutsch/")
        ) {
          const key = `${manifest.name}@${manifest.version ?? "unknown"}`;
          packages.set(key, {
            name: manifest.name,
            version: manifest.version ?? "unknown",
            license: licenseOf(manifest),
            homepage: typeof manifest.homepage === "string" ? manifest.homepage : undefined,
          });
        }
      } catch {
        // Ignore optional package metadata that is unavailable on this platform.
      }
      await visitDependencies(dependency.dependencies);
      await visitDependencies(dependency.devDependencies);
      await visitDependencies(dependency.optionalDependencies);
    }
  }
  for (const workspace of workspaces) {
    await visitDependencies(workspace.dependencies);
    await visitDependencies(workspace.devDependencies);
    await visitDependencies(workspace.optionalDependencies);
  }
  return [...packages.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}

const packages = await readInstalledPackages();
const lines = [
  "# Open Deutsch third-party notices",
  "",
  `This inventory covers the ${String(packages.length)} package versions installed from the pinned pnpm lockfile at notice-generation time. Each dependency remains under its own license; consult the package metadata and upstream repository for the complete license text. This file is regenerated with ` +
    "`pnpm run generate:third-party-notices`.",
  "",
  "## Application and assets",
  "",
  "- Open Deutsch application code and the `open-deutsch` OD mark are maintained by the repository maintainers. No separate open-source license grant is declared by this implementation; redistribution must follow the applicable project distribution terms.",
  "- The curriculum snapshot is original or source-attributed content. Authoritative source links and freshness fields are maintained in `content/curriculum/sources.yaml`.",
  "- Researched curriculum is educational material, not formal CEFR certification, legal advice, immigration advice, or an official public-service determination.",
  "- Curriculum attribution: [Council of Europe CEFR Companion Volume](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-companion-volume-and-its-language-versions), [Bundesportal](https://verwaltung.bund.de/leistungsverzeichnis/DE/leistung/99115005104001/herausgeber/HH-S1000020010000000079/region/020000000000), and [Bundesmeldegesetz §17](https://www.gesetze-im-internet.de/bmg/__17.html), as listed in the source registry.",
  "",
  "## Installed package inventory",
  "",
  "| Package | Version | Declared license | Homepage |",
  "| --- | --- | --- | --- |",
  ...packages.map(
    (entry) =>
      `| \`${entry.name}\` | \`${entry.version}\` | ${entry.license.replaceAll("|", "\\|")} | ${entry.homepage ? `[upstream](${entry.homepage})` : "—"} |`,
  ),
  "",
  "## Release boundary",
  "",
  "The Linux AppImage includes this notice, the Open Deutsch licensing note, and the immutable curriculum/plugin/helper snapshot. It does not include learner data, credentials, or a Codex account. A compatible external Codex installation remains a prerequisite for AI actions.",
];
await writeFile(outputFile, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o644 });
process.stdout.write(
  `[PASS] THIRD_PARTY_NOTICES_GENERATED: ${String(packages.length)} package versions\n`,
);
