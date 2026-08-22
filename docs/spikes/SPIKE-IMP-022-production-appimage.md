# SPIKE-IMP-022 — Production AppImage payload

- **Status:** complete
- **Date:** 2026-08-21
- **Owner:** repository maintainers
- **Related:** IMP-145, IMP-146, IMP-147, [ADR-0017](../adr/ADR-0017-production-appimage-payload.md)
- **Time/scope bound:** one local Linux x86_64 production-package proof with disposable data and a fake Codex process; no account or updater validation

## Question and accepted constraints

Can the production MCP server, plugin snapshot, curriculum snapshot, OD-branded Electron shell, and external data-root pointer share one replaceable AppImage without a workspace dependency or learner-data capture?

The proof may not access a real account, use the learner's configured root, invoke Voice automation, or add an updater.

## Candidate versions and environment

The proof used Node.js 24.18.1, pnpm 11.0.9, Electron 42.7.1, electron-builder 26.15.3, AppImage toolset 1.0.3, and the repository's built-in SQLite runtime on Linux x86_64. The AppImage was extracted into a unique owned temporary directory outside the checkout. The packaged correction used the deterministic fake Codex fixture and an ownership-marked disposable data root.

## Success and blocker criteria

- **Success:** build a standalone helper, extract the AppImage, verify immutable resources and helper SQLite/root resolution, complete and persist one fake correction across restart, and preserve the bootstrap through manual artifact replacement.
- **Release blocker:** any workspace-relative helper resolution, missing resource, default-branded package, root mismatch, failed restart, or automatic updater behavior.

## Disposable proof

`scripts/build-mcp-helper.mjs` deploys the MCP package to a system-temporary staging directory, copies only the production server/dependencies/wrapper/curriculum into ignored `release/mcp-helper`, and removes staging after replacement. `scripts/probe-appimage.mjs` creates an owned harness, extracts the AppImage without FUSE, launches the packaged shell under Xvfb, runs the helper probe, initializes a selected disposable root, uses a fake Codex correction in the packaged UI, relaunches the same profile, and checks History. It then re-extracts a manual replacement and rechecks the shell/bootstrap boundary.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" CI=true make package
PATH="<Node-24.18.1-bin>:$PATH" node scripts/probe-appimage.mjs
PATH="<Node-24.18.1-bin>:$PATH" node --test tests/appimage-spike.test.mjs
```

## Evidence and observations

The helper build emitted a passing `MCP_HELPER_BUILT` record with `workspaceDependency:false`. The extracted package reported `packaged:true`, `dataRootResolved:true`, `curriculumReadOnlySnapshot:true`, plugin `open-deutsch`, helper path `mcp-helper/open-deutsch`, built-in SQLite `3.53.1`, `firstLaunchCorrection:true`, `restartHistory:true`, `sameProfile:true`, `manualReplacementPreservedBootstrap:true`, and `automaticUpdaterIncluded:false`. The branded build no longer emitted the default Electron icon warning.

## Alternatives and negative results

- **Probe-only helper:** insufficient for production MCP use; replaced by the deployed server and retained only in the historical spike.
- **In-workspace production deployment:** caused pnpm production dependency-state churn; staging outside the repository and scrubbing production environment variables preserves the development install.
- **Extensionless CommonJS helper in the ESM package:** failed under Node's package-type rules; the stable shell launcher plus `.cjs` implementation is the accepted boundary.

## Decision or explicit blocker

Accepted by [ADR-0017](../adr/ADR-0017-production-appimage-payload.md). No production packaging blocker remains for the deterministic local path; signing, updater, and `.deb` delivery remain separate decisions.

## Cleanup verification

- **Processes stopped:** the probe closes both packaged Electron launches and waits for owned child processes; the command exits successfully.
- **Artifacts removed:** extracted AppImage directories, disposable profile, fake Codex control file, bootstrap, and data root are removed by ownership-checked cleanup.
- **Artifacts retained:** only the reviewed helper/build/probe/configuration and this redacted report; ignored AppImage/build outputs remain replaceable local build artifacts.
- **Private/account state:** no real learner data, credentials, account, model service, network service, or Voice session was used.

## Follow-up

Decide `.deb` delivery and add third-party/legal notices in IMP-148 and IMP-149. Keep release verification behind deterministic disposable probes.
