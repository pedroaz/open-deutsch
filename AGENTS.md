# Open Deutsch

Local-first Linux Electron app for German learning: React/Vite renderer, validated preload/IPC, SQLite, and Codex App Server over STDIO. Use the pinned Node/pnpm versions in `.node-version`, `package.json`, and `toolchain.json`.

## Working agreement

- Keep work focused on the requested change, including small fixes needed to build or verify it; inspect current files and `git status --short`, and preserve concurrent work and learner data. Commit only when explicitly requested.
- While the app is under development, do not add or retain compatibility paths solely for superseded app behavior, IPC/MCP inputs, or saved record formats. Use one current contract and update its callers and relevant skill instructions together. During development, explicitly versioned learning-format changes may reset incompatible learning data before current readers run. Retain valid profile/preferences, preserve unrelated files and credentials, and show a durable dismissible notice; never reset on corruption or an unknown newer schema. Keep the SQLite migration ledger.
- **No automated application tests.** Do not add or run unit/component/integration/E2E suites, saved test journeys, fixtures, mocks, coverage gates, or scheduled regression runs. Give the agent an interactive Electron platform to verify the affected behavior while developing.
- Interactive verification uses the real Codex connection and current learner data. Use GPT-6 Luna at its runtime default effort for AI verification, restore prior settings, and clean up only records created by the session through the UI. Do not substitute another model.
- Use documented Make commands. Run `make check` only when static verification is requested or preparing a PR; it contains formatting, lint, and TypeScript checks, not tests. Do not run broad gates after every edit.
- Inspect relevant redacted logs before fixing bugs. Never log learner text, prompts, model output, credentials, raw protocols, or private paths. Signal processes only through exact lifecycle ownership.
- Keep skills focused on durable structural decisions, working preferences and implementation entry points. Current code, schemas and runtime observations establish what is implemented. Do not maintain reference documents inside skills, parallel implementation documentation, standalone runbooks or unsolicited progress/checklist files.

## Skills and sources of truth

Read the skill relevant to the task, then inspect the owning code and its callers.

- [open-deutsch-development](.agents/skills/open-deutsch-development/SKILL.md): repository workflow, structural boundaries, persistence, diagnosis, and code entry points.
- [open-deutsch-desktop-ui](.agents/skills/open-deutsch-desktop-ui/SKILL.md): renderer controls, layout, localization, accessibility, and visual review.
- [open-deutsch-codex-integration](.agents/skills/open-deutsch-codex-integration/SKILL.md): App Server, models, plugin/MCP boundaries, and learner-facing skill maintenance.
- [open-deutsch-electron-verification](.agents/skills/open-deutsch-electron-verification/SKILL.md): operate the real app interactively during development; no test suite.

User instructions and the concise decisions in `AGENTS.md` and skills guide intended changes; inspect source code to determine current behavior. Legal notices stay in `docs/`; curriculum is product data under `content/curriculum/`. Learner-facing skills ship under `plugins/open-deutsch/skills/`. Curriculum authoring includes agent quality checks and publication without a separate human approval step; honor an explicit draft-only request.

Quick start: `make help`, `make setup`, `make dev`; inspect with `make logs-once`, stop with `make kill`. Use `make verify-start` for an exclusive interactive verification session. Closer `AGENTS.md` files add component boundaries.
