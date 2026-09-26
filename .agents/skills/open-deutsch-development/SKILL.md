---
name: open-deutsch-development
description: Develop and maintain Open Deutsch, including repository workflow, package boundaries, persistence, diagnostics, and packaging. Use for implementation work, not German tutoring.
---

# Open Deutsch development

Read root and scoped `AGENTS.md`, inspect `git status --short`, and preserve concurrent work and learner data. Work from the repository root. Current code, schemas, and runtime observations establish what is implemented; inspect them before changing behavior. Skills hold durable decisions and workflow, not feature inventories or parallel implementation documentation.

## Find the owner

Paths below are relative to the repository root. Follow imports and callers rather than assuming a file is the whole feature.

- Commands and pinned tools: `Makefile`, `package.json`, `.node-version`, `toolchain.json`; lifecycle and logs: `scripts/lifecycle.mjs`, `scripts/lib/lifecycle.mjs`, `scripts/lib/log-view.mjs`.
- Desktop wiring: `apps/desktop/src/main/backend.ts`, `apps/desktop/src/preload/`, `apps/desktop/src/renderer/App.tsx` and the affected renderer component.
- Wire contracts: `packages/contracts/src/`; deterministic learner rules and runtime validation: `packages/domain/src/`.
- Storage: `packages/persistence/src/repository.ts`, `migrations.ts`, `sqlite.ts`, `data-root-layout.ts`, `data-root-selection.ts`, and the feature's persistence module.
- Course format and loading: `packages/contracts/src/learning-path.ts`, `packages/persistence/src/learning-path.ts`; curriculum inventory and validation: `content/curriculum/` and `packages/domain/src/curriculum.ts`.
- Packaging: `apps/desktop/electron-builder.yml`, `scripts/build-mcp-helper.mjs`; integrations: use [the Codex integration skill](../open-deutsch-codex-integration/SKILL.md).

## Structural decisions

- Electron main owns filesystem, processes, SQLite and App Server; renderer stays browser-only behind narrow validated preload/IPC. Desktop and independently launched STDIO MCP reuse shared contracts, domain and persistence.
- SQLite owns mutable private learner state. Reusable curriculum is repository product data packaged read-only. Keep learner files, credentials and research scratch material out of Git. The selected data root is portable; no automatic backups, folder-copy workflow or updater.
- Runtime-validate AI, IPC, MCP and persisted inputs. Preserve data-root generations, leases, idempotency and transactional migrations. Use one current contract; follow the root development-reset policy for incompatible learning formats.
- Keep learning activities self-paced and distinguish participation from skill evidence. Voice stays in Codex; Open Deutsch stores bounded structured results, not audio or transcripts. Model capabilities come from the connected runtime.

## Work and verify

Use `make help` and inspect its target implementation for command details. Inspect relevant redacted logs before bug fixes (`make logs-once`); resolve lifecycle ownership before stopping a process. Add only bounded diagnostics when evidence is missing.

Verify affected behavior through [interactive Electron verification](../open-deutsch-electron-verification/SKILL.md). Use [the UI skill](../open-deutsch-desktop-ui/SKILL.md) for renderer work. No automated application tests or saved journeys. Run `make check` only on request or when preparing a PR. Review the exact change and report actual observations and limitations. Commit only on explicit request.

Keep skills concise: change a skill when a durable decision or workflow changes. Do not add reference manuals, implementation summaries, runbooks or progress files. Put runtime details in their owning code. Legal notices and authored curriculum remain product files in `docs/` and `content/curriculum/`.
