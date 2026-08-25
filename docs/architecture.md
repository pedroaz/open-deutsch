# Architecture

Status: current architecture
Last updated: 2026-08-22

## Technology baseline

- **Workspace:** pnpm workspace
- **Language:** TypeScript
- **Desktop shell:** Electron
- **Renderer:** React + Vite
- **Local database:** SQLite
- **Codex integration:** personal plugin containing skills and a local MCP connection
- **Desktop-native AI:** Codex App Server over STDIO from the Electron backend
- **Renderer system:** accessible React primitives, CSS Modules, shared design tokens, Lucide icons, and i18next-compatible EN/DE catalogs
- **Packaging:** Linux x86_64 AppImage only, with manual replacement and no updater
- **Supported platform:** Linux x86_64
- **Product identity:** Open Deutsch; technical package, application, protocol, and plugin identifiers use `open-deutsch`

Next.js is not part of the baseline. The app does not need a web server, server-side rendering, or web deployment, and Electron already provides the local backend boundary.

## Workspace layout

```text
open-deutsch/
├── apps/
│   ├── desktop/             # Electron main/preload + React/Vite renderer
│   └── mcp-server/          # separately launchable local STDIO MCP server
├── packages/
│   ├── domain/              # learner, exercise, correction, vocabulary rules
│   ├── persistence/         # SQLite schema, migrations, repositories
│   ├── contracts/           # validated IPC, MCP, and AI result schemas
│   └── codex-client/        # narrow App Server adapter for desktop AI actions
├── plugins/
│   └── open-deutsch/
│       ├── .codex-plugin/
│       │   └── plugin.json
│       └── skills/
│           ├── german-teacher/
│           │   └── SKILL.md
│           └── curriculum-research/
│               └── SKILL.md
├── content/
│   └── curriculum/          # reviewed Git-tracked Markdown/YAML
├── docs/
├── AGENTS.md                 # development-agent operating contract
├── Makefile                  # public developer and user-facing commands
├── package.json
└── pnpm-workspace.yaml
```

This layout is the current package boundary. New packages should be introduced only when a distinct ownership or runtime boundary requires them.

## Process and dependency boundaries

```text
Electron renderer
  -> typed preload/IPC
Electron main
  -> shared domain services
  -> SQLite persistence
  -> Codex App Server over STDIO

Codex plugin
  -> teaching/research skills
  -> local MCP command over STDIO
Local MCP server
  -> shared domain services
  -> same SQLite persistence
```

- The renderer must not open SQLite, handle raw credentials, or spawn App Server directly.
- Electron main owns desktop process lifecycle, App Server interaction, and privileged filesystem access.
- The MCP server is independently launchable because Codex owns its STDIO process lifecycle.
- Desktop and MCP entry points reuse domain and persistence packages rather than reimplementing learner rules.
- SQLite access must use migrations, short transactions, and a concurrency mode appropriate for the desktop and MCP processes sharing one database.
- The plugin owns Codex-facing instructions and tool registration, not desktop UI or the canonical learner database.
- A compatible, authenticated Codex installation is a prerequisite for AI actions. Open Deutsch does not bundle Codex, collect an API key, or provide an alternate model provider; local non-AI behavior remains available without it.
- App Server operations run with a bounded working directory, explicit sandbox/approval policy, minimal tools, and only the context required by the selected learning action.
- All processes share a redacted structured-event vocabulary that renders to bounded, human-readable local logs with correlation IDs.

## Plugin packaging direction

The plugin is a genuine plugin package because it combines reusable teaching/research skills with a local MCP integration. It contains `.codex-plugin/plugin.json`, a plugin-local `.mcp.json`, and each skill under `skills/<skill-name>/SKILL.md`.

During development, the MCP command may point to the workspace build. For a packaged release, the AppImage contains a version-matched installable plugin payload plus a stable MCP helper command, and the plugin references that helper entry point. The app extracts the payload to a stable versioned runtime location before invoking the supported scoped Codex plugin workflow. Installation validates Codex/version/auth readiness. The release flow validates both fresh-clone development and installed-app paths.

Do not add MCP Apps UI merely to mirror the desktop app. Add compact plugin UI later only when an interaction is materially better inside Codex and still has a text/tool fallback.

## Build and distribution direction

- Expose public workflows through `make help`, `make setup`, `make dev`, `make prd`, `make start`, `make kill`, `make check`, and the explicitly requested `make test` live journey. Make delegates to exact pinned pnpm workspace scripts.
- Build the MCP server before wiring its command into the plugin manifest.
- Produce a Linux x86_64 AppImage.
- Ask the learner to choose the single self-contained application data root during onboarding. Keep only a minimal pointer to it in the platform-appropriate configuration directory.
- Do not add an automatic backup/snapshot subsystem or data-folder migration workflow.
- Do not add automatic application updates. Document a manual AppImage replacement flow that preserves the selected data-root pointer.
- Package the reviewed opinionated base curriculum as a read-only release snapshot. The application never runs Git commands; the maintainer manages curriculum Git history externally.
- Package with electron-builder using the pinned AppImage toolset.

## Supported integration behavior

1. The desktop and MCP processes can open the same local learner database safely.
2. Codex can call one read tool and one write tool through the supported installed plugin/MCP connection.
3. The desktop can run one bounded correction through App Server and persist the validated result.
4. The renderer receives only typed application data through preload/IPC.
5. An AppImage and the MCP helper can resolve the user-selected data root after restart through the shared bootstrap configuration.
6. Open Deutsch prepares structured listening/speaking context and returns an explicit unsupported-handoff state because the current host has no supported exact Codex Voice bridge. Codex can create an exact persistent desktop activity through MCP. Neither direction uses clipboard/manual continuation UI or generic launch fallbacks.

## Live journey boundary

- Keep App Server, plugin-installation status, native dialogs, and bootstrap resolution behind narrow production adapters.
- Do not maintain unit, component, mock-service, fixture-driven, coverage, artifact-validation, or unattended end-to-end suites.
- Add a Playwright Electron journey only for a user-visible behavior the user explicitly requests. Run the production build with the connected Codex account, real App Server, default application profile, and selected learner data.
- Print a warning immediately before a live journey without pausing for confirmation. The application must already be closed; the runner never kills an existing process.
- Live journeys use visible product actions for cleanup and never direct database cleanup. They capture no screenshots, traces, videos, DOM dumps, learner text, prompts, or model output; failures expose only bounded diagnostic codes and report when manual cleanup is required.
- `make check`, pull-request gates, CI, and unattended automation run only Prettier, ESLint, and strict TypeScript checks. Live journeys never join those gates.

See `testing-strategy.md`.

## Official plugin references

- [Build plugins](https://developers.openai.com/plugins/build/plugins)
- [Connect from ChatGPT and Codex](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Codex App Server](https://developers.openai.com/codex/app-server)
