# SPIKE-IMP-021 — Early AppImage

- **Status:** complete
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-021, D-011, D-012, D-013, [ADR-0011](../adr/ADR-0011-appimage-packaging-baseline.md)
- **Time/scope bound:** Linux x86_64 package construction, resource loading, selected-root resolution, native runtime loading, and manual artifact replacement

## Question and accepted constraints

Can a minimal Open Deutsch AppImage launch independently of the checkout, read its immutable curriculum/plugin/helper resources, resolve a separately selected disposable data root, load the chosen SQLite runtime, and survive manual artifact replacement without mutating that pointer?

The spike must never touch normal learner or host configuration. It does not add an updater, release signing, production branding, or a production MCP server.

## Candidate versions and environment

- Linux x86_64, Electron 42.7.1
- Node.js 24.18.1, pnpm 11.0.9
- electron-builder 26.15.3 with AppImage toolset 1.0.3
- Built-in `node:sqlite` / SQLite 3.53.1 in the packaged Electron runtime observed by this run

## Success and blocker criteria

- **Success:** one AppImage builds; extraction and launch occur under a disposable directory outside the checkout; packaged curriculum, plugin, and helper are readable; shell and helper resolve the exact selected root; built-in SQLite loads; replacement leaves the bootstrap unchanged.
- **Blocker:** package launch depends on checkout files, state is written beside immutable resources, a native dependency cannot load, or replacement changes the selected-root pointer.

## Disposable proof

`scripts/probe-appimage.mjs` creates an ownership-marked disposable harness, redirects HOME, all temp variables, and every XDG root, copies the AppImage into a temporary installation directory, and extracts it without FUSE. It launches `AppRun` under Xvfb with X11 selected explicitly. The shell writes bounded evidence only into the disposable data root.

The probe then runs the packaged helper with Electron's executable in `ELECTRON_RUN_AS_NODE` mode. Both processes compare canonical bootstrap and environment roots and open in-memory built-in SQLite. Finally, the probe replaces the installed AppImage from the build artifact, re-extracts and relaunches it, and verifies that both the artifact hash and bootstrap hash remain exact.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" make package
PATH="<Node-24.18.1-bin>:$PATH" pnpm run spike:appimage
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/appimage-spike.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Evidence and observations

- electron-builder produced `Open-Deutsch-0.0.0-x86_64.AppImage` with an ASAR shell and explicit curriculum/plugin/helper resources.
- Two outside-checkout packaged-shell launches reported `packaged: true`, exact data-root resolution, curriculum visibility, plugin name `open-deutsch`, helper presence, and SQLite 3.53.1.
- The packaged helper independently reported exact data-root resolution and SQLite 3.53.1.
- Manual artifact replacement retained the source artifact hash and the exact bootstrap hash. No automatic updater was included.
- `make package` runs the real extracted-artifact probe after every build. The focused infrastructure/source-helper suite passed 4/4, including poisoned temp-root replacement; source-helper coverage is not presented as packaged runtime evidence. No private data, Codex account, model, or network service was used.

## Alternatives and negative results

- **Run the development Electron entry point:** Rejected because it does not prove packaged paths or ASAR/resource behavior.
- **Mount through FUSE:** Not required; extraction gives a deterministic host-compatible proof and avoids a FUSE dependency.
- **Ship a native SQLite addon:** Rejected after IMP-014; built-in `node:sqlite` avoids external ABI/rebuild risk.
- **Treat replacement as migration/update orchestration:** Rejected. This spike proves artifact replacement preserves the pointer, not schema migrations, rollback, download, or signing.

## Decision

Accept the baseline in [ADR-0011](../adr/ADR-0011-appimage-packaging-baseline.md). Continue using `process.resourcesPath` for immutable package resources and the bootstrap pointer for all mutable state.

## Cleanup verification

- **Processes stopped:** Both Xvfb/Electron launches and helper processes exited successfully.
- **Artifacts removed:** Extracted package, temporary installation, HOME/XDG trees, evidence, and disposable data root were removed by the ownership-checking harness.
- **Artifacts retained:** Ignored release AppImage/build output plus source configuration, probe, tests, ADR, and this report.
- **Private/account state:** No normal learner root, Codex home, account, model, plugin install, or network mutation was used.

## Follow-up

Replace the probe-only helper with the production MCP server at its implementation item. Add final icons, signing, provenance, and release verification in the packaging/release phase.
