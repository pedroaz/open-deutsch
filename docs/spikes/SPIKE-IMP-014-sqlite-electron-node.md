# SPIKE-IMP-014 — SQLite in Electron and a second Node process

- **Status:** complete
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-014, D-032, D-041, D-042, D-043, D-046, [ADR-0004](../adr/ADR-0004-node-sqlite-baseline.md)
- **Time/scope bound:** one disposable two-version migration, one deliberately contended cross-process write, reopen/query evidence, and driver/packaging comparison

## Question and accepted constraints

Can one SQLite driver support the Electron main process and a separately launched Node.js MCP process against the same local database, including migrations and bounded concurrent writes, without creating avoidable native AppImage packaging risk?

The spike must use a unique disposable learner-data root, keep SQLite out of the renderer, use no learner/account state, and preserve the accepted single-folder/local-filesystem architecture.

## Candidate versions and environment

- Linux 6.17.0 x86_64 with Xvfb
- Electron 42.7.1, embedding Node.js 24.18.0 and SQLite 3.53.1
- External Node.js 24.18.1, also exposing SQLite 3.53.1
- `node:sqlite` `DatabaseSync` from each runtime
- Comparison candidates: `better-sqlite3` 12.10.0, `sqlite3`, and `sql.js`/WASM
- A restrictive per-test disposable harness supplied the database and Electron profile paths. No real account, Codex configuration, or learner data was in scope.

## Success and blocker criteria

- **Success:** the same file opens from Electron and another Node process; a version-one database migrates transactionally inside Electron; both report WAL; a contended write waits within the configured bound and both writes survive; connections/processes close; and the adopted path has a credible AppImage packaging boundary.
- **Release blocker:** runtime/API mismatch, native addon ABI cannot serve both processes, migrations corrupt or lose schema state, concurrent writes fail/corrupt data, an owned process remains running, or the driver cannot be packaged in the Linux AppImage architecture.

## Disposable proof

The Playwright test creates a version-one STRICT table with external Node's built-in driver, closes it, and launches Electron against that file. Electron opens it with a 2-second timeout, enables WAL/foreign keys, migrates it to version two inside `BEGIN IMMEDIATE`, and exposes only test-local main-process operations through Playwright evaluation.

A second pinned Node process then opens the same file, begins an immediate transaction, inserts a row, signals that it owns the write lock, and holds it for 300 ms. Electron attempts its own insert during that lock. Its connection waits rather than failing or corrupting state, then commits after the first process. The test reads both ordered rows, closes the database, closes Electron, and lets the disposable harness remove the database, WAL/SHM files, profile, bootstrap, and root.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" make test-e2e
PATH="<Node-24.18.1-bin>:$PATH" make check
```

The focused diagnostic is:

```text
xvfb-run -a pnpm exec playwright test --config playwright.electron-spike.config.mjs tests/e2e/playwright-sqlite-spike.spec.mjs
```

## Evidence and observations

- Electron reported version 42.7.1, embedded Node.js 24.18.0, SQLite 3.53.1, `journal_mode=wal`, `foreign_keys=1`, and migrated `user_version=2`.
- Both Electron and external Node rejected an orphan insert against the migrated foreign-key fixture, behaviorally proving enforcement on each connection.
- The external Node 24.18.1 process opened the migrated database and held an immediate write transaction. Electron's competing insert waited 337 ms, within the configured 2-second busy timeout.
- The final rows were `external-node / legacy` and `electron-main / electron-main`, proving the version-two column default, successful migration, serialized cross-process writes, and intact ordering.
- The focused SQLite journey passed in 925 ms. It retained a 338-byte ignored `sqlite-spike-evidence.json`; the full Make E2E gate also passed both Electron journeys.
- The built-in module is part of both runtime executables and produces no application `.node` dependency. Therefore AppImage packaging needs no Electron addon rebuild or `asarUnpack` rule for SQLite; the later early-AppImage spike still verifies the complete packaged executable and helper path.

## Alternatives and negative results

- **`node:sqlite` `DatabaseSync`:** Accepted. It passed the runtime, migration, WAL contention, close, and clean-data tests without a third-party dependency. Its Node 24 API is release-candidate stability, so exact runtime pins and regression coverage remain mandatory. [Node 24.18.1 SQLite documentation](https://nodejs.org/download/release/v24.18.1/docs/api/sqlite.html)
- **`better-sqlite3` 12.10.0:** Rejected for the baseline. It provides a mature synchronous API and recommends WAL, but is a native addon; Electron documents target-ABI rebuild requirements, electron-builder must rebuild/unpack native modules, and upstream 12.10.0 temporarily rolled back Electron 42 prebuild support. [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [Electron native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules/), [electron-builder contents](https://www.electron.build/docs/contents/)
- **`sqlite3`:** Rejected because it retains the native ABI/rebuild/ASAR burden without a capability needed by this product.
- **`sql.js`/WASM:** Rejected because its persistence model does not supply the ordinary shared-file WAL locking required by two local processes.
- **Network filesystem:** Rejected for the database root. SQLite documents WAL shared-memory requirements and one-writer semantics; the supported data root is a local filesystem. [SQLite WAL](https://sqlite.org/wal.html)

## Decision or explicit blocker

[ADR-0004](../adr/ADR-0004-node-sqlite-baseline.md) adopts the pinned runtimes' `node:sqlite` `DatabaseSync` with WAL, foreign keys, short transactions, transactional `user_version` migrations, and bounded busy waits. No IMP-014 release blocker remains.

## Cleanup verification

- **Processes stopped:** The external Node writer exited with code zero; Playwright closed Electron and observed exit code zero.
- **Artifacts removed:** The fixture removed its owned database, `-wal`/`-shm` companions, Electron profile, bootstrap, and disposable roots.
- **Artifacts retained:** Reviewed fixture/spec code, the ADR/report, and replaceable ignored 338-byte JSON evidence only.
- **Private/account state:** No learner path/content, credential, Codex configuration, or account was accessed or mutated.

## Follow-up

Implement the production adapter, typed errors, full migration ledger, permissions, and corruption/root-generation tests in the owning persistence items. Revalidate the built-in driver through the early AppImage and final packaging journeys.
