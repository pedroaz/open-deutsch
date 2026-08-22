import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactValidationError,
  parseFrontMatter,
  validateRepositoryArtifacts,
} from "../scripts/lib/artifact-validation.mjs";

async function withArtifactTree(entries, callback) {
  const root = await mkdtemp(path.join(tmpdir(), "open-deutsch-artifacts-"));
  const files = {
    "tests/fixtures/manifest.yaml": "schemaVersion: 1\nfixtures: []\n",
    ...entries,
  };
  try {
    for (const [file, source] of Object.entries(files)) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    await callback(root, Object.keys(files).sort());
  } finally {
    await rm(root, { recursive: true });
  }
}

async function expectIssues(entries, expectedPatterns) {
  await withArtifactTree(entries, async (root, files) => {
    await assert.rejects(validateRepositoryArtifacts({ root, files }), (error) => {
      assert.ok(error instanceof ArtifactValidationError);
      for (const pattern of expectedPatterns) {
        assert.match(error.message, pattern);
      }
      return true;
    });
  });
}

test("the complete repository artifact inventory is valid", async () => {
  const result = await validateRepositoryArtifacts();
  assert.ok(result.filesChecked > 100);
});

test("JSON, YAML, curriculum metadata, plugin manifests, and skills fail closed", async () => {
  await expectIssues(
    {
      "broken.json": '{"missing":}',
      "duplicate.json": '{"same": 1, "same": 2}',
      "broken.yaml": "duplicate: one\nduplicate: two\n",
      "aliased.yaml": "value: &shared one\ncopy: *shared\n",
      "content/curriculum/a1/greetings.md": "# Missing metadata\n",
      "plugins/demo/.codex-plugin/plugin.json": JSON.stringify({
        name: "Not Stable",
        version: "1.0",
        description: "",
        skills: "../../escape",
      }),
      "plugins/empty/.codex-plugin/plugin.json": JSON.stringify({
        name: "empty-plugin",
        version: "1.0.0",
        description: "Declares a missing skills directory",
        skills: "./skills/",
      }),
      "plugins/demo/skills/helper/SKILL.md": "---\nname: Bad Name\n---\n\nInstructions\n",
    },
    [
      /broken\.json: invalid JSON/,
      /duplicate\.json: invalid JSON: Map keys must be unique/,
      /broken\.yaml: invalid YAML/,
      /aliased\.yaml: invalid YAML: Alias resolution is disabled/,
      /greetings\.md: required YAML front matter/,
      /plugin name must use stable kebab case/,
      /plugin version must be an exact stable semantic version/,
      /skills must be a relative plugin directory/,
      /declared skills directory must contain at least one SKILL\.md/,
      /description must be a non-empty string/,
      /skill name must use kebab case/,
    ],
  );
});

test("front matter accepts a YAML mapping and rejects scalar metadata", () => {
  const issues = [];
  assert.deepEqual(
    parseFrontMatter("---\nname: example\ndescription: useful\n---\nBody\n", "SKILL.md", issues),
    { name: "example", description: "useful" },
  );
  assert.deepEqual(issues, []);
  const scalarIssues = [];
  assert.equal(parseFrontMatter("---\njust text\n---\n", "lesson.md", scalarIssues), undefined);
  assert.match(scalarIssues.join("\n"), /must be a mapping/);
});

test("English and German catalogs require the same nonblank string keys", async () => {
  await expectIssues(
    {
      "apps/desktop/src/locales/en.json": JSON.stringify({ navigation: { home: "Home" } }),
      "apps/desktop/src/locales/de.json": JSON.stringify({ navigation: { settings: "" } }),
    },
    [
      /missing translation key navigation\.home/,
      /missing translation key navigation\.settings/,
      /must not be blank/,
    ],
  );
});

test("fixture inventory rejects undeclared, missing, duplicate, and oversized artifacts", async () => {
  await expectIssues(
    {
      "tests/fixtures/manifest.yaml": [
        "schemaVersion: 1",
        "fixtures:",
        "  - path: tests/fixtures/missing.txt",
        "    purpose: Missing fixture",
        "  - path: tests/fixtures/missing.txt",
        "    purpose: Duplicate fixture",
        "",
      ].join("\n"),
      "tests/fixtures/undeclared.txt": "reviewed fixture\n",
    },
    [/declared fixture does not exist/, /fixture paths must be unique/, /declared exactly once/],
  );
});

test("design policy rejects inline styles and raw color or layout literals", async () => {
  await expectIssues(
    {
      "apps/desktop/src/renderer/Card.tsx":
        "export const Card = () => <div style={{ color: 'red' }} />;\n",
      "apps/desktop/src/renderer/Card.module.css": [
        ".card {",
        "  color: red;",
        "  background: oklch(50% 0.2 20);",
        "  border: 1px solid transparent;",
        "  padding: 12px;",
        "}",
        "",
      ].join("\n"),
      "apps/desktop/src/renderer/tokens.css": ":root { --wrong-color: #fff; }\n",
    },
    [
      /inline style objects/,
      /uses a raw color/,
      /uses a raw dimension/,
      /must use the --od- prefix/,
    ],
  );
});

test("credential-like values and private database or environment files are rejected", async () => {
  const secret = ["sk", "thisLooksLikeARealCredential12345"].join("-");
  const projectSecret = ["sk", "proj", "this-is-a-long-hyphenated-test-token-123456789"].join("-");
  const privateKey = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  const pngWithSecret = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
    Buffer.from(projectSecret),
  ]);
  await expectIssues(
    {
      ".env.local": "SAFE_TEST_VALUE=not-used\n",
      "config.env": "SAFE_TEST_VALUE=not-used\n",
      Makefile: `TOKEN=${projectSecret}\n`,
      "assets/hidden.png": pngWithSecret,
      "assets/not-an-image.gif": "plain text with a misleading suffix\n",
      "invalid-utf8.txt": Buffer.from([0xc3, 0x28]),
      "nul-hidden": Buffer.from(`safe\0${projectSecret}\n`),
      "notes.txt": `${secret}\n${privateKey}\n`,
      "tests/fixtures/learner.sqlite": "SQLite format 3",
      "learner.sqlite-wal": "private sidecar",
      "tests/fixtures/manifest.yaml": [
        "schemaVersion: 1",
        "fixtures:",
        "  - path: tests/fixtures/learner.sqlite",
        "    purpose: Must be rejected as private data",
        "",
      ].join("\n"),
    },
    [
      /\.env\.local: environment files with real values/,
      /config\.env: environment files with real values/,
      /Makefile: credential-like OpenAI secret/,
      /assets\/hidden\.png: credential-like OpenAI secret/,
      /assets\/not-an-image\.gif: binary extension does not match its required file signature/,
      /invalid-utf8\.txt: artifact is neither valid UTF-8 nor an allowed binary asset/,
      /nul-hidden: unscannable NUL-containing artifact is not an allowed binary asset/,
      /notes\.txt: credential-like OpenAI secret/,
      /private key material/,
      /private database\/key material/,
      /learner\.sqlite-wal: private database\/key material/,
    ],
  );
});
