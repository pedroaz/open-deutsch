# Open Deutsch

A local-first German-learning companion built entirely around the Codex desktop experience.

Product discovery is complete and implementation follows the dependency-ordered canonical plan. The repository now includes the Linux Electron desktop, private portable SQLite persistence, the reviewed A1–B2 curriculum snapshot, the scoped Codex plugin with an eight-tool local MCP server, bounded desktop AI contracts, reading/listening/speaking evidence, vocabulary SRS, weekly planning, and four-skill Progress/History views. The remaining unchecked plan items are explicit acceptance boundaries: live account/host verification, exact Codex Voice session handoff, and a literal fresh-clone run.

## Toolchain

Development uses Node.js 24.18.1 and pnpm 11.0.9. A compatible existing Codex CLI (currently the verified range `>=0.146.0 <0.146.1`) is required only for desktop AI and Codex integration workflows; local non-AI behavior remains available without it. See [the toolchain baseline](docs/toolchain.md).

The initial delivery target is Linux x86_64 AppImage. AppImage replacement is manual, the selected learner data root stays outside the replaceable artifact, and no automatic updater or `.deb` package is included. Open Deutsch never generates, imports, stores, or plays local audio. Listening and speaking preparation persists structured context and returns `OD_HANDOFF_VOICE_SESSION_UNSUPPORTED` until the host exposes a supported exact Codex Voice bridge; clipboard, manual-selection, generic-launch, and UI-automation fallbacks are intentionally absent.

## Deterministic acceptance

make setup
make doctor
make check
make test-e2e
make test-plugin
make test-all

All automated commands use disposable roots and never invoke the account-consuming `make verify-live` or `make verify-plugin` gates. Those two commands require separate explicit confirmation immediately before execution.

## Planning documents

- [Canonical implementation TODO](docs/implementation-plan.md)
- [Product requirements](docs/product-requirements.md)
- [Baseline architecture](docs/architecture.md)
- [Historical sequencing rationale](docs/mvp-roadmap.md)
- [Agent-oriented testing](docs/testing-strategy.md)
- [Design direction](docs/design-direction.md)
- [Development workflow](docs/development-workflow.md)
- [Setup and recovery](docs/setup.md)
- [Logging strategy](docs/logging-strategy.md)
- [Codex agent structure](docs/agent-structure.md)
- [Component boundaries](docs/component-boundaries.md)
- [Desktop-native AI](docs/desktop-ai.md)
- [Model selection and reasoning](docs/model-selection.md)
- [Storage strategy](docs/storage-strategy.md)
- [Curriculum research mode](docs/research-mode.md)
- [Decision log](docs/decisions.md)
- [Product interview](docs/interview.md)
