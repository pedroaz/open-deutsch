# ADR-0011 — AppImage packaging baseline

- **Status:** superseded
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-021, D-011, D-012, D-013, [SPIKE-IMP-021](../spikes/SPIKE-IMP-021-early-appimage.md), [ADR-0017](ADR-0017-production-appimage-payload.md)

## Context

Open Deutsch needs a Linux AppImage that can run outside its source checkout, carry immutable application resources, and keep the learner-selected data root separate from the replaceable application artifact. The early package must expose packaging failures before feature code depends on an untested layout.

## Decision

Use Electron 42.7.1 with electron-builder 26.15.3 and its pinned AppImage toolset 1.0.3. Package the application in ASAR, copy the reviewed curriculum snapshot, plugin manifest, and probe-only MCP helper through `extraResources`, and locate them through Electron's `process.resourcesPath`.

Keep mutable state exclusively behind the external bootstrap/data-root pointer. Set `npmRebuild: false`: the accepted SQLite baseline is the runtimes' built-in `node:sqlite`, so this package has no third-party native addon to rebuild or unpack. Do not include an automatic updater. Installation and update remain a manual replacement of the AppImage artifact; replacing it must neither rewrite nor migrate the selected root pointer.

## Evidence

[SPIKE-IMP-021](../spikes/SPIKE-IMP-021-early-appimage.md) records a real x86_64 AppImage built and extracted without FUSE, then launched under Xvfb from an owned temporary directory outside the checkout. The packaged shell read all expected resources, resolved the selected disposable root, and opened built-in SQLite. The packaged helper independently resolved the same root and SQLite runtime. Replacing and re-extracting the installed artifact preserved both its exact source hash and the bootstrap hash.

`make package` builds and immediately executes this extracted-artifact probe; source-helper unit coverage is only a contract check and is not accepted as package evidence.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" make package
PATH="<Node-24.18.1-bin>:$PATH" pnpm run spike:appimage
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/appimage-spike.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

Expected result: one `Open-Deutsch-0.0.0-x86_64.AppImage`, successful shell/helper JSON evidence, three focused tests, and the deterministic repository gate pass on Linux x86_64.

## Rejected alternatives

- **Electron Forge AppImage maker:** Rejected because Forge does not provide a first-party AppImage maker; adding a community maker would introduce another packaging boundary.
- **Loose source checkout or installed `node_modules`:** Rejected because it does not test the distributable resource layout.
- **Bundled mutable learner data:** Rejected because application replacement must not replace or capture the selected learner root.
- **Automatic updater:** Deferred. It is not required by the accepted manual replacement boundary and would add network, signing, and rollback scope.

## Accepted boundaries and consequences

- The baseline is Linux x86_64 only and does not add Windows support.
- The packaged curriculum and plugin files are immutable snapshots; editable/researched content belongs under the selected data root.
- The packaged MCP file is a probe-only helper, not the later production STDIO server.
- Built-in SQLite proves native runtime availability without an external ABI-bearing addon.
- Extraction with `--appimage-extract` validates the package on hosts where FUSE mounting is unavailable.
- Default Electron artwork remains acceptable only for this early spike; production branding and release signing are later work.

## Supersession

Superseded for the production AppImage payload by [ADR-0017](ADR-0017-production-appimage-payload.md). This record remains as the historical early-package baseline and evidence.
