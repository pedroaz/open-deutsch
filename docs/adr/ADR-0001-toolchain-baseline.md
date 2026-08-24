# ADR-0001 — Pinned development toolchain baseline

- **Status:** superseded
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-003, IMP-005, IMP-006; `docs/toolchain.md`

## Context

Open Deutsch needs reproducible workspace, type, lint, and test behavior while also integrating with a separately installed Codex CLI. The host initially exposed Node.js 26.5.0, but passing under that newer runtime would not prove compatibility with the repository baseline. Tool versions also need to remain peer-compatible and diagnosable without making Codex a prerequisite for non-AI local work.

## Decision

- Pin Node.js exactly to 24.18.1 for implementation and acceptance evidence.
- Pin pnpm exactly to 11.0.9 and record it in both `package.json` and `toolchain.json`.
- Use Codex CLI 0.146.0 as the initial App Server capability baseline for desktop-AI/integration operations; keep non-AI local checks available when Codex is absent. [ADR-0005](ADR-0005-codex-app-server-runtime.md) now controls the narrower verified integration interval.
- Pin the checked-in quality stack through `package.json` and `pnpm-lock.yaml`, including TypeScript 6.0.3 with ESLint 9.39.5 and typescript-eslint 8.67.0.
- Treat `toolchain.json`, `.node-version`, the root manifest, and frozen lockfile as machine-readable authority; `docs/toolchain.md` is the human-readable summary.

## Evidence

- Node.js 24 is the selected LTS line and pnpm 11 supports it, with upstream references recorded in `docs/toolchain.md`.
- Codex CLI 0.146.0 was the first local baseline verified to expose the documented `codex app-server` STDIO capability.
- Strict anchored diagnostics reject prerelease/trailing version text and distinguish optional local use from required integration capability.
- The selected TypeScript/ESLint combination passes peer checks; the locally available TypeScript 7 line did not satisfy the selected typescript-eslint peer range.

## Validation commands

```text
pnpm install --frozen-lockfile
pnpm peers check
pnpm --silent dlx node@24.18.1 scripts/check-toolchain.mjs
pnpm --silent dlx node@24.18.1 --test tests/toolchain-diagnostics.test.mjs
pnpm --silent dlx node@24.18.1 node_modules/typescript/bin/tsc -b --force
```

Expected result: frozen resolution and peer validation succeed; toolchain diagnostics report PASS for Node.js and pnpm, Codex is an optional warning unless integration mode is requested, all diagnostics tests pass, and the project-reference build completes under Node.js 24.18.1.

## Rejected alternatives

- **Use the host Node.js 26 runtime as acceptance evidence:** rejected because it is outside the declared support range and can hide Node.js 24 incompatibilities.
- **Adopt TypeScript 7 immediately:** rejected for this baseline because it was outside the selected typescript-eslint peer support; reconsider only with a peer-clean quality stack and full gate evidence.
- **Allow loose or self-switching package-manager versions:** rejected because bootstrap behavior would vary by machine and obscure which runtime produced the evidence.
- **Require Codex for every local command:** rejected because domain/UI work that does not use AI must remain usable and testable without an installed or authenticated Codex CLI.

## Accepted boundaries and consequences

- Compatibility-sensitive acceptance evidence must name and use Node.js 24.18.1; a newer host-only pass is insufficient.
- pnpm patch drift is a diagnostic failure until this ADR and machine-readable pins are intentionally updated.
- Codex 0.146.0 was the minimum development capability baseline. [ADR-0005](ADR-0005-codex-app-server-runtime.md) narrows the verified App Server integration interval to `>=0.146.0 <0.146.1`; IMP-016 still must validate the model/account capability subset.
- This ADR does not select Electron, SQLite, Playwright, packaging, schema, or application-library versions; their owning spikes/items must record separate evidence.
- Upgrades require peer checks, pinned-runtime tests, updated machine-readable pins/documentation, and either an amended proposed record or a superseding ADR when the compatibility boundary changes materially.

## Supersession

[ADR-0020](ADR-0020-node-26-toolchain-baseline.md) replaces the host Node.js 24.18.1 baseline with Node.js 26.5.0 while preserving the Electron Node 24 compatibility surface.
