# Architecture decision records

Status: active convention
Last updated: 2026-08-15

ADRs record durable implementation decisions that are not already fully settled by `docs/decisions.md`. The product decision log remains authoritative for product scope and accepted architecture. An ADR explains how the implementation satisfies those decisions; it must not silently override them.

## When to write an ADR

Write or amend an ADR when work chooses a long-lived dependency, version compatibility range, storage/protocol strategy, security boundary, packaging mechanism, or cross-component contract with meaningful alternatives. Do not create an ADR for routine code organization, progress, or a reversible local refactor.

If the choice changes an accepted product decision, update `docs/decisions.md` first. If evidence is still missing, write a spike report instead of presenting a hypothesis as accepted architecture.

## Naming and lifecycle

- Name files `ADR-NNNN-short-kebab-title.md` using the next unused four-digit number.
- Status is `proposed`, `accepted`, `superseded`, or `rejected`.
- Keep accepted records immutable except for corrections and supersession metadata. A changed decision gets a new ADR that links the old one.
- Link the implementation-plan item, relevant `D-NNN` decisions, spike reports, and affected contracts.
- Never include credentials, learner data, private paths, raw protocol payloads, or unreviewed research content.

Copy `ADR-template.md`, remove instructional comments, and complete every section. An accepted ADR must record exact chosen versions/ranges where compatibility matters, evidence, reproducible validation commands, rejected alternatives with reasons, and the accepted boundaries/non-goals.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR-0001](ADR-0001-toolchain-baseline.md) | accepted | Pinned development toolchain baseline |
| [ADR-0002](ADR-0002-vitest-infrastructure.md) | accepted | Vitest projects and V8 coverage baseline |
| [ADR-0003](ADR-0003-electron-playwright-baseline.md) | accepted | Electron and Playwright Linux automation baseline |
| [ADR-0004](ADR-0004-node-sqlite-baseline.md) | accepted | Built-in Node SQLite baseline |
| [ADR-0005](ADR-0005-codex-app-server-runtime.md) | accepted | Codex App Server runtime and managed authentication baseline |
| [ADR-0006](ADR-0006-app-server-model-account-capabilities.md) | accepted | App Server model and account capability discovery |
| [ADR-0007](ADR-0007-bounded-app-server-turn-policy.md) | accepted | Bounded App Server turn policy |
| [ADR-0008](ADR-0008-local-stdio-mcp-baseline.md) | accepted | Local STDIO MCP baseline |
| [ADR-0009](ADR-0009-supported-local-plugin-lifecycle.md) | accepted | Supported local plugin lifecycle baseline |
| [ADR-0010](ADR-0010-exact-cross-surface-handoff.md) | accepted | Exact cross-surface handoff capability boundary |
| [ADR-0011](ADR-0011-appimage-packaging-baseline.md) | superseded | Early AppImage packaging baseline |
| [ADR-0012](ADR-0012-zod-runtime-schema-baseline.md) | accepted | Zod runtime schema baseline |
| [ADR-0013](ADR-0013-common-identifiers-and-time.md) | accepted | Common identifiers and time values |
| [ADR-0014](ADR-0014-shared-error-and-log-reference.md) | accepted | Shared error and log-reference model |
| [ADR-0017](ADR-0017-production-appimage-payload.md) | accepted | Production AppImage payload and helper boundary |
| [ADR-0018](ADR-0018-linux-package-format.md) | accepted | Initial Linux package format |
