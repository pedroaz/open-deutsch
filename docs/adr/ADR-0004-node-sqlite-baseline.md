# ADR-0004 — Built-in Node SQLite baseline

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-014, D-032, D-041, D-042, D-043, D-046, [SPIKE-IMP-014](../spikes/SPIKE-IMP-014-sqlite-electron-node.md)

## Context

The Electron main process and a separately launched Node MCP helper must safely share one SQLite database in the selected local data root. The driver therefore has to work in Electron 42.7.1 and pinned Node.js 24.18.1, support migrations and bounded lock waiting, and avoid preventable Linux AppImage native-module risk.

## Decision

Use the built-in `node:sqlite` `DatabaseSync` API supplied by the supported runtimes. The accepted runtime pair exposes SQLite 3.53.1 from Electron 42.7.1's embedded Node.js 24.18.0 and from the external Node.js 24.18.1 toolchain. Do not add a third-party SQLite native addon.

Each process opens its own connection, enables foreign keys, WAL journal mode, and a bounded busy timeout, and keeps write transactions short. Schema migrations are ordered, transactional, and tracked with SQLite `user_version`; an application must refuse a database newer than its supported schema. Databases must remain on a local filesystem because WAL shared-memory semantics are not a network-filesystem contract.

## Evidence

The [IMP-014 spike](../spikes/SPIKE-IMP-014-sqlite-electron-node.md) created a version-one database under disposable data, migrated it to version two inside Electron, then held a write transaction from a separate pinned Node process while Electron attempted a second write. WAL plus the busy timeout serialized both writes, retained both rows, and closed both processes cleanly. Both runtimes reported SQLite 3.53.1.

Node 24.18.1 documents `node:sqlite` as release-candidate stability and provides the synchronous `DatabaseSync` API plus the connection timeout option. Electron documents that third-party native addons require Electron-specific ABI rebuilds. The built-in driver is compiled into Electron itself, so it adds no `.node` payload, rebuild step, or ASAR unpack rule to an AppImage. [Node SQLite API](https://nodejs.org/download/release/v24.18.1/docs/api/sqlite.html), [Electron native-module guidance](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules/)

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" make test-e2e
PATH="<Node-24.18.1-bin>:$PATH" make check
```

Expected result on the accepted Linux/Xvfb environment: the SQLite journey reports the exact runtime/SQLite versions, WAL, schema version two, bounded lock serialization, two intact rows, and clean process exits. The deterministic repository gate must also remain green.

## Rejected alternatives

- **`better-sqlite3` 12.10.0:** Mature and ergonomic, but it is a native addon. Electron requires target-ABI rebuilds, electron-builder must rebuild/unpack it, and the current upstream release notes temporarily roll back Electron 42 prebuild support. Keep it only as a fallback if a required capability cannot be implemented with the pinned built-in API. [better-sqlite3 releases](https://github.com/WiseLibs/better-sqlite3/releases)
- **`sqlite3`:** Also a native addon with rebuild and AppImage unpacking cost, while its callback-oriented API does not improve this short-transaction local workload.
- **`sql.js`/WASM:** Avoids an addon but does not provide the ordinary shared SQLite file-locking model needed by Electron and a separate MCP process.
- **A database server or remote/libSQL client:** Rejected because the accepted product is local-first, serverless, and uses a self-contained data folder.

## Accepted boundaries and consequences

- The persistence package may depend on the `node:sqlite` built-in only from Node-owning processes; the renderer never imports or opens SQLite.
- `DatabaseSync` blocks its owning JavaScript thread. Queries and transactions must stay bounded; expensive work may later move to a dedicated worker without changing the database format.
- `node:sqlite` is release-candidate API in Node 24. Driver/runtime upgrades require the compatibility journey and migration suite to pass before acceptance.
- WAL supports concurrent readers and serializes writers; it does not permit unbounded transactions or databases on network filesystems. Use a bounded busy timeout and useful typed lock errors.
- Built-in SQLite removes third-party native addon handling from AppImage packaging. The complete packaged-path launch remains an acceptance check for the early AppImage and final packaging items; this decision does not claim those broader packages are already built.
- Application migrations, repositories, permissions, corruption behavior, root-generation switching, and recovery are implemented and tested in their owning persistence items.

## Supersession

None.
