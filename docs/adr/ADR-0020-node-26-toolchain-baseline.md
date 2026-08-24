# ADR-0020 — Node.js 26 host toolchain baseline

- **Status:** accepted
- **Date:** 2026-08-24
- **Decision owners:** repository maintainers
- **Related:** IMP-003, IMP-013, IMP-014; [ADR-0001](ADR-0001-toolchain-baseline.md), [ADR-0004](ADR-0004-node-sqlite-baseline.md)

## Context

Open Deutsch previously pinned Node.js 24.18.1 for all host development and acceptance commands. The maintainer requested migration to the already installed Node.js 26.5.0 runtime. Node.js 26 is still in its Current phase and is scheduled to enter LTS in October 2026, while Electron 42.7.1 embeds Node.js 24.18.0. The desktop and external MCP helper also share one SQLite database, so a host-only unit-test pass is not sufficient evidence for the migration.

## Decision

- Pin host development, scripts, the external MCP helper, and acceptance commands to Node.js 26.5.0 with the supported range `>=26.5.0 <27.0.0`.
- Keep pnpm pinned to 11.0.9 and Codex CLI in the verified interval `>=0.146.0 <0.146.1`.
- Keep the peer-clean quality stack at TypeScript 6.0.3, ESLint 9.39.5, and typescript-eslint 8.67.0.
- Keep `@types/node` at 24.13.3 while Electron 42 embeds Node.js 24. This deliberately restricts shared and desktop compilation to APIs available in the older runtime; host-only code may not assume Node 26-only APIs without a separately scoped type boundary.
- Keep Electron 42.7.1 and validate the mixed Node 26.5.0/SQLite 3.53.3 and Electron Node 24.18.0/SQLite 3.53.1 database boundary through the existing WAL contention journey.
- Revisit the pre-LTS qualification after Node.js 26 enters LTS or before any runtime-dependent production deployment decision.

## Evidence

- Node.js identifies version 26 as Current and schedules its LTS transition for October 2026; production applications are generally directed to Active or Maintenance LTS releases.
- Node.js 26.5.0 exposes `node:sqlite` with SQLite 3.53.3, while the accepted Electron 42.7.1 runtime exposes Node.js 24.18.0 with SQLite 3.53.1.
- Before changing the pin, strict TypeScript checks and all 356 Vitest tests passed under the installed Node.js 26.5.0 runtime.
- `make setup` and `make doctor` passed under Node.js 26.5.0; doctor reported built-in SQLite 3.53.3 and the expected eight-tool MCP helper.
- `make check` passed 417 artifact checks, 131 Node tests, 356 Vitest tests, formatting, lint, strict TypeScript, and the warm performance budget.
- `make test-e2e` passed all nine Electron journeys, including the mixed Node 26.5.0/SQLite 3.53.3 and Electron Node 24.18.0/SQLite 3.53.1 migration, foreign-key, WAL contention, and retained-write proof.
- `make test-plugin` passed the manifest, skill, prompt, wrapper, artifact, and production STDIO MCP contracts.
- `make package` built and probed the Linux x86_64 AppImage, its Node 24/SQLite 3.53.1 desktop runtime, and its packaged MCP helper without live-account usage.

## Validation commands

```text
node --version
make setup
make doctor
make check
make test-e2e
make test-plugin
make package
```

Expected result: the host reports Node.js 26.5.0; setup and diagnostics accept the pin; deterministic checks pass; the Electron SQLite journey proves migration, foreign-key enforcement, bounded WAL contention, and retained writes across Node 26 and embedded Node 24; plugin/MCP structure and the Linux AppImage package pass without real-account usage.

## Rejected alternatives

- **Continue requiring Node.js 24.18.1:** rejected because the maintainer explicitly requested the Node.js 26 migration and the installed runtime can be validated directly.
- **Allow every Node.js 26 patch without a pin:** rejected because `node:sqlite`, performance budgets, lifecycle behavior, and package output are compatibility-sensitive and need reproducible evidence.
- **Upgrade `@types/node` to 26 globally:** rejected while Electron embeds Node.js 24 because it could make unavailable APIs appear safe in Electron main or shared code.
- **Upgrade Electron solely to align major Node versions:** deferred because Electron 42 remains the accepted application runtime and the mixed-runtime database boundary is directly testable.

## Accepted boundaries and consequences

- Node.js 26.5.0 is a deliberate pre-LTS maintainer baseline, not a claim that all production users should prefer Current releases.
- Historical evidence recorded under Node.js 24.18.1 remains historical and is not rewritten.
- Host Node and Electron Node versions remain different; both sides of the shared SQLite boundary must pass before runtime work is accepted.
- Live Codex and installed-host verification remain outside this migration and still require separate explicit confirmation.
- Any later Node 26 patch, Node 27 migration, Electron major upgrade, or global Node type-surface change requires renewed compatibility evidence and an ADR update or supersession.

## Supersession

Supersedes [ADR-0001](ADR-0001-toolchain-baseline.md) for the active host Node.js baseline. ADR-0001 remains the historical record for the original Node.js 24 decision; [ADR-0004](ADR-0004-node-sqlite-baseline.md) continues to govern the built-in SQLite driver choice.
