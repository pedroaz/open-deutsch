# ADR-0002 — Vitest projects and V8 coverage baseline

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-010; `docs/testing-strategy.md`; ADR-0001

## Context

Open Deutsch needs fast TypeScript tests that can run from one root command or a named workspace package, share deterministic clocks/identifiers, and enforce coverage on critical domain code. The existing Node test runner remains useful for JavaScript repository/tooling checks, but it does not provide the planned TypeScript project and coverage workflow.

## Decision

- Pin Vitest 4.1.10, `@vitest/coverage-v8` 4.1.10, and its required Vite peer at 8.2.1. All support Node.js 24.18.1.
- Use the current `test.projects` configuration in one root `vitest.config.mjs`; do not introduce the deprecated workspace configuration.
- Give each application/shared package a named project and local test script, while `pnpm run test:unit` runs all projects once from the root.
- Use V8 coverage with checked-in inclusion and threshold policy for critical domain source. Start at 100% for the initial two-line clock seam; future critical domain code must add tests or deliberately revise the policy with evidence.
- Keep reusable deterministic TypeScript fixtures under `tests/support` and typecheck package/test sources through `tsconfig.test.json`.
- Keep existing Node tests for repository scripts/configuration and compose both runners in `test:fast`.

## Evidence

- The [current Vitest guide](https://vitest.dev/guide/) requires Node.js 20 or newer and Vite 6 or newer; the pinned Node.js 24.18.1, Vite 8.2.1, and Vitest 4.1.10 combination satisfies those requirements.
- The [official project guidance](https://vitest.dev/guide/projects.html) identifies `test.projects` as the current monorepo mechanism and notes that coverage is configured for the overall process.
- The [official coverage guidance](https://vitest.dev/guide/coverage.html) recommends the V8 provider and describes AST-based remapping in current Vitest.
- The root run executes the shared-support and domain projects, the domain package command selects only that project, and the V8 report covers `packages/domain/src/clock.ts` at 100% statements/functions/branches/lines.

## Validation commands

```text
pnpm --filter @open-deutsch/domain test
pnpm --silent dlx node@24.18.1 node_modules/vitest/vitest.mjs run
pnpm --silent dlx node@24.18.1 node_modules/vitest/vitest.mjs run --coverage
pnpm run typecheck
make test-fast
```

Expected result: the package command reports only the domain project; the root run reports every non-empty project once; six Vitest tests pass; critical-domain coverage meets all 100% thresholds; test TypeScript is strict; and the fast gate includes both Node and Vitest suites without live-account use.

## Rejected alternatives

- **Use only `node:test`:** retained for JavaScript tooling tests but rejected as the sole runner because the accepted strategy requires package-oriented TypeScript projects, shared fixtures, and integrated coverage.
- **Use the deprecated Vitest workspace configuration:** rejected in favor of the current `test.projects` API documented by Vitest.
- **Use Istanbul coverage initially:** rejected because current Vitest recommends V8, which avoids a pre-instrumentation step and provides AST-remapped accuracy for this V8/Node-only unit layer.
- **Put coverage in each package config:** rejected because Vitest applies coverage at the overall process level; the root policy is the single authority.

## Accepted boundaries and consequences

- Vitest owns deterministic TypeScript unit/integration tests. Playwright Electron journeys, MCP Inspector work, installed-plugin evaluation, and real App Server verification remain separate owning items/commands.
- Empty skeleton projects may explicitly pass with no tests until they gain production code; non-empty test-support and domain projects may not. The root invocation always has committed tests.
- Coverage is collected only by `test:coverage`; normal `test:unit` and `test:fast` stay quick. Coverage output remains ignored.
- The threshold targets critical domain source, not generated declarations, barrel files, UI journeys, or repository scripts. New critical paths should be added deliberately rather than inflating a global percentage with trivial files.
- No Vitest command may invoke `make verify-live`, `make verify-plugin`, learner data, or a real configured data root.

## Supersession

None.
