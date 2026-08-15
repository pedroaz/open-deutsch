# Open Deutsch

A local-first German-learning companion built entirely around the Codex desktop experience.

Product discovery is complete and implementation follows the dependency-ordered canonical plan. The repository currently contains the pinned toolchain foundation; subsequent workspace and product capabilities are tracked in that plan.

## Toolchain

Development uses Node.js 24.18.1 and pnpm 11.0.9. A compatible existing Codex CLI (currently 0.146.0 or newer) is required only for desktop AI and Codex integration workflows; local non-AI behavior remains available without it. See [the toolchain baseline](docs/toolchain.md).

## Planning documents

- [Canonical implementation TODO](docs/implementation-plan.md)
- [Product requirements](docs/product-requirements.md)
- [Baseline architecture](docs/architecture.md)
- [Historical sequencing rationale](docs/mvp-roadmap.md)
- [Agent-oriented testing](docs/testing-strategy.md)
- [Design direction](docs/design-direction.md)
- [Development workflow](docs/development-workflow.md)
- [Logging strategy](docs/logging-strategy.md)
- [Codex agent structure](docs/agent-structure.md)
- [Component boundaries](docs/component-boundaries.md)
- [Desktop-native AI](docs/desktop-ai.md)
- [Model selection and reasoning](docs/model-selection.md)
- [Storage strategy](docs/storage-strategy.md)
- [Curriculum research mode](docs/research-mode.md)
- [Decision log](docs/decisions.md)
- [Product interview](docs/interview.md)
