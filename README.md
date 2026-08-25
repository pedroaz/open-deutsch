# Open Deutsch

Open Deutsch is a local-first Linux desktop application for learning German with Codex. It combines an Electron study application, portable SQLite learner data, an opinionated A1–B2 curriculum, a scoped Codex plugin, and a local STDIO MCP server.

The application provides onboarding and data-root management, Dashboard and Weekly plan views, writing correction and contextual help, custom lessons, grammar and reading practice, vocabulary review with deterministic SRS, optional placement activities, general History, and four-skill evidence. Learner records remain in the selected local data root; only explicitly selected, minimized context is sent through Codex-backed actions.

## Supported environment

Open Deutsch targets Linux x86_64 and is packaged as an AppImage. Development uses Node.js 26.5.0 and pnpm 11.0.9; Electron 42 uses its embedded Node.js 24 runtime. A compatible external Codex CLI (`>=0.146.0 <0.146.1`) is required for AI actions and plugin integration, while local non-AI behavior remains available without Codex.

Open Deutsch does not generate, import, store, or play audio. It can prepare structured listening and speaking activities and save explicit structured results or summaries. The current Codex host does not expose a supported external mechanism for Open Deutsch to create or open an exact Voice session, so direct Voice-session opening is unavailable. This limitation does not block the rest of the application, and no clipboard, generic-launch, or UI-automation fallback is provided.

## Setup and development

```text
make setup
make doctor
make dev
```

Use `make help` for the complete public command surface. Production-like local startup is available through `make prd` (`make start` is its alias), and `make kill` stops only an identity-matched process owned by the repository lifecycle tooling.

## Verification

```text
make check
```

`make check` runs Prettier, ESLint, and strict TypeScript checks only. `make test` is an explicitly requested Playwright journey against the production Electron app, connected Codex account, and selected learner data. It warns that it may consume usage or change learner records, then starts without an interactive confirmation prompt.

## Documentation

- [Product requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [Component boundaries](docs/component-boundaries.md)
- [Setup and recovery](docs/setup.md)
- [Development workflow](docs/development-workflow.md)
- [Testing strategy](docs/testing-strategy.md)
- [Design direction](docs/design-direction.md)
- [Desktop-native AI](docs/desktop-ai.md)
- [Model selection](docs/model-selection.md)
- [Storage strategy](docs/storage-strategy.md)
- [Logging strategy](docs/logging-strategy.md)
- [Curriculum research mode](docs/research-mode.md)
- [Toolchain](docs/toolchain.md)
- [Licensing and attribution](docs/licensing.md)
