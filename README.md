# Open Deutsch

Open Deutsch is a local-first Linux desktop application for learning German with Codex. It combines an Electron study application, portable SQLite learner data, an A1–B2 curriculum inventory with explicitly tracked gaps, a scoped Codex plugin, and a local STDIO MCP server.

The application provides onboarding and data-root management, Dashboard and a self-paced Learning Path, writing correction and contextual help, custom lessons, grammar and reading practice, vocabulary review with deterministic SRS, optional A1 challenges, general History, and four-skill evidence. Practice lists saved activities with pagination, opens Codex-created instructions, and generates reading exercises from the actual German passage. The Dashboard leads with Continue learning and offers independent practice ideas from due words, mistakes and learner interests. The Learning Path contains Course, Progress and Check your German; A1.1/A1.2 load from the published curriculum snapshot, while A2–B2 remain under construction. Course content is authored and checked by the agent, with no separate human approval gate; a missing published course is shown as unavailable. Automatic model selection prefers available GPT-6 Sol for learning and GPT-6 Luna for quick help, with GPT-6 Astra available explicitly. Optional challenges never gate course activities or change the selected learning level. Personal Data explains saved data and its storage locations in tables, with confirmed cleanup for practice, vocabulary or all learning records. Learner records remain in the selected local data root; only explicitly selected, minimized context is sent through Codex-backed actions.

## Supported environment

Open Deutsch targets Linux x86_64 and is packaged as an AppImage. Development uses Node.js 26.5.0 and pnpm 11.0.9; Electron 42 uses its embedded Node.js 24 runtime. The installed ChatGPT/Codex desktop bundle with App Server support is required for AI actions and plugin integration, while local non-AI behavior remains available without Codex.

Open Deutsch does not generate, import, store, or play audio. It prepares configurable listening and speaking activities and keeps them in Practice. **Open in Codex** opens a new chat with a plugin mention and the exact activity reference in the composer. The learner sends the message, then starts Voice in that task where available. MCP retrieves the saved activity and minimal teaching defaults once for the conversation. The link does not send messages, start Voice, or resume an existing task; existing conversations resume from Codex. Scenario text and private paths are not placed in the URL.

## Setup and development

```text
make setup
make doctor
make dev
```

Dependency installation is explicit through `make setup`; other pnpm scripts report stale dependencies instead of reinstalling them. Stop, status and log commands run directly through Node. `make build-mcp-helper` deploys production dependencies from a temporary workspace so packaging does not alter development dependency state.

Use `make debug` to start or attach to development and follow concise INFO+ logs from the current run in the terminal. Earlier runs are available with `make logs SCOPE=history`. Use `make logs LEVEL=debug COMPONENT=app-server` for detailed AI timings, or `make logs LEVEL=error` for failures. Ctrl-C stops log following; `make kill` stops the background app. Use `make help` for the complete public command surface. Production-like local startup is available through `make prd` (`make start` is its alias), and `make kill` stops only an identity-matched process owned by the repository lifecycle tooling.

## Development skills and verification

Concise skills under `.agents/skills` capture working preferences, structural decisions and entry points into the code:

- [Development](.agents/skills/open-deutsch-development/SKILL.md): repository workflow, package boundaries, storage, diagnosis, and packaging entry points.
- [Desktop UI](.agents/skills/open-deutsch-desktop-ui/SKILL.md): design, React controls, localization, and accessibility.
- [Codex integration](.agents/skills/open-deutsch-codex-integration/SKILL.md): App Server, model selection, MCP, and shipped learner skills.
- [Interactive Electron verification](.agents/skills/open-deutsch-electron-verification/SKILL.md): launch, observe, and operate the real app during development.

**There are no automated application tests or saved test journeys.** Agents use `make verify-start`, `make verify-inspect`, `make verify-do`, and `make verify-stop` for targeted interactive verification with real services. AI verification uses GPT-6 Luna and restores the learner's previous settings. `make check` contains only formatting, lint, and TypeScript checks and runs when requested or preparing a PR.

[AGENTS.md](AGENTS.md) contains the short working agreement and source-of-truth links. Inspect current code, schemas and runtime behavior to determine what is implemented. Skills do not contain reference manuals or duplicate implementation documentation. The learner-facing German teacher and curriculum research skills remain packaged under `plugins/open-deutsch/skills`. [Legal notices](docs/licensing.md) and curriculum remain in their own product locations.
