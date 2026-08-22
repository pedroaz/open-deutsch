# ADR-0017 — Production AppImage payload and helper boundary

- **Status:** accepted
- **Date:** 2026-08-21
- **Decision owners:** repository maintainers
- **Related:** IMP-145, IMP-146, IMP-147, D-001, D-002, D-011, D-012, D-013, [ADR-0011](ADR-0011-appimage-packaging-baseline.md), [SPIKE-IMP-022](../spikes/SPIKE-IMP-022-production-appimage.md)

## Context

The early AppImage spike proved the Electron shell and a probe-only helper, but the release path needs the production MCP server, a stable helper command, the reviewed curriculum snapshot, and the versioned Open Deutsch plugin payload. The package must remain replaceable without capturing or rewriting the selected learner root.

## Decision

Use the existing electron-builder 26.15.3/AppImage toolset 1.0.3 baseline with a production `apps/desktop/electron-builder.yml`. The package builds the desktop bundle, embeds the read-only curriculum and plugin snapshot below `process.resourcesPath`, and embeds a production MCP helper under `resources/mcp-helper`.

The helper ships as a stable executable name `open-deutsch` backed by an extension-safe `open-deutsch-mcp.cjs` launcher. It resolves either the packaged colocated server/curriculum or the development plugin layout, rejects ambiguous roots, supports a bounded disposable `--probe`, and launches the production MCP server over inherited STDIO for normal use. The helper deployment is produced outside the workspace and copied atomically so production-only dependency installation cannot prune the development checkout.

Use the simple repository-owned OD mark and explicit Linux desktop metadata, register `open-deutsch://` through the Electron main process, keep `dev.opendeutsch.app` as the stable application identity, set `npmRebuild: false` because SQLite is Node's built-in driver, and ship no updater. A manual AppImage replacement is the supported update/recovery action.

## Evidence

The production helper build emitted `MCP_HELPER_BUILT` with `workspaceDependency:false`; its disposable-root probe resolved the selected root and built-in SQLite from the packaged path. `CI=true make package` built `Open-Deutsch-0.0.0-x86_64.AppImage` without the default Electron icon warning. The extracted-artifact probe launched outside the checkout, verified the curriculum/plugin/helper payload, completed a fake writing correction, closed and relaunched the packaged desktop against the same profile, found the correction in History, probed the helper, and verified manual replacement preserved the bootstrap.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" CI=true make package
PATH="<Node-24.18.1-bin>:$PATH" node scripts/probe-appimage.mjs
PATH="<Node-24.18.1-bin>:$PATH" node --test tests/appimage-spike.test.mjs
```

## Rejected alternatives

- **Probe-only packaged helper:** Rejected for production because it cannot serve the MCP contract; it remains covered by the historical early spike.
- **Extensionless CommonJS Node entry in the ESM deploy package:** Rejected because Node interprets it as ESM; the stable shell name and explicit `.cjs` implementation preserve both command resolution and Electron probing.
- **Workspace-relative server at runtime:** Rejected because a release must not depend on the source checkout or workspace `node_modules`.
- **Automatic updater or bundled Codex:** Rejected because they would add network, signing, account, and mutable-install scope outside the accepted local-first boundary.

## Accepted boundaries and consequences

- The initial package is Linux x86_64 AppImage only and requires a compatible external Codex CLI for AI actions.
- Curriculum, plugin, and helper resources in the package are immutable release snapshots; learner data and research staging remain outside the artifact.
- The helper's normal path is local STDIO only; the bounded `--probe` is an infrastructure verification interface, not a learner-facing tool.
- Packaging uses the built-in SQLite runtime and does not ship a third-party native SQLite addon.
- AppImage replacement is manual; no background update check, updater, signing, or `.deb` package is implied by this decision.

## Supersession

None.
