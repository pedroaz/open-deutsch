# Artifact validation

Status: accepted repository convention
Last updated: 2026-08-15

Run `make test-fast` for the normal gate or `pnpm run test:artifacts` for the focused inventory. The validator reads Git-tracked files plus non-ignored working-tree files, so a new artifact is checked before it is staged. Ignored private/generated data remains outside the inventory by design; tracked files remain checked even if a later ignore rule matches them.

## Structured artifacts

- Every JSON, YAML, and YML artifact must parse without duplicate YAML keys or aliases.
- Curriculum Markdown below `content/curriculum/` requires YAML mapping front matter except for directory `README.md` and `AGENTS.md` guidance. IMP-035 owns the complete curriculum field schema; this earlier gate guarantees the metadata envelope cannot be omitted or malformed.
- A plugin manifest at `.codex-plugin/plugin.json` requires a stable kebab-case name, exact stable semantic version, nonblank description, and a contained relative skills directory when `skills` is present.
- Every plugin `skills/<name>/SKILL.md` requires YAML mapping front matter with a kebab-case `name` and nonblank `description`.

The plugin and skill baseline follows the current official OpenAI documentation for [building plugins](https://learn.chatgpt.com/docs/build-plugins) and [building skills](https://learn.chatgpt.com/docs/build-skills). Later plugin implementation still rechecks current documentation before adding host-specific fields.

## UI artifacts

Translation catalogs use paired `en` and `de` JSON/YAML files directly below an `i18n` or `locales` directory. Both catalogs must contain the same nonblank string-leaf keys. English remains the initial locale; this check verifies coverage, not translated prose quality.

Desktop CSS defines raw colors and layout dimensions only in `tokens.css` or `design-tokens.css`, where custom properties use the `--od-` prefix. Other CSS consumes variables. Renderer TSX does not use inline style objects.

## Fixtures and privacy

`tests/fixtures/manifest.yaml` inventories every committed fixture with a concise purpose. Fixture paths are unique, sorted, regular non-symlink files, and at most 256 KiB so review remains practical. Generated databases belong in the disposable-data harness, never in the fixture tree.

The repository inventory completely scans every regular artifact up to 5 MiB and rejects private database/key extensions, non-example environment files, private-key material, and credential-shaped OpenAI secrets. Invalid UTF-8, NUL-containing, and oversized files fail closed. Only reviewed image, icon, and font extensions with matching magic signatures may be binary, and their raw bytes still receive the credential scan. This high-confidence deterministic scan complements review and later security tooling; it intentionally does not claim that arbitrary prose can be proven non-private automatically.
