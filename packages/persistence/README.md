# Persistence

This package owns the self-contained learner data root, SQLite migrations, and repository adapters shared by Electron main and the independently launched MCP process.

## Data-root layout

`resolveDataRootLayout` defines one portable root containing a versioned identity manifest, `open-deutsch.sqlite3`, attachments, research staging/cache, bounded operational logs (`desktop.log`, `app-server.log`, and `mcp-server.log`), redacted diagnostics, and an explicitly test-only directory. Production directory creation omits test-only storage. The manifest stores only root identity, format version, generation, and creation time; it contains no bootstrap path, learner content, backup metadata, or Git state.

The layout is lexical only. Canonicalization, ownership, permissions, symlink rejection, creation, and recognition of existing roots belong to the safe selection boundary. Callers must not interpret this helper as proof that a filesystem path is trusted.

## Bootstrap pointer

The OS configuration directory contains one strict private JSON pointer with the canonical selected-root path, monotonically increasing generation, root-format version, and selection time only. `writeBootstrapPointer` uses a same-directory exclusive writer lock, optimistic generation comparison, a unique private temporary file, file synchronization, atomic rename, and directory synchronization. It validates that the target manifest already carries the next generation before publishing the switch.

`readBootstrapPointer` distinguishes unconfigured, malformed pointer, missing/noncanonical/invalid target, generation mismatch, and ready states without guessing or rewriting data. Bootstrap and active data-root directories must be owned by the current user and cannot be group/world writable. Desktop and MCP processes retain a `{dataRoot, rootGeneration}` lease; every repository transaction rechecks it before work and before commit, so any pointer/root/generation change fails with `OD_DATA_ROOT_STALE` until the process reopens against the new selection. A switch only changes this pointer and target manifest—it never copies or deletes either dataset.

## Linux root selection

`inspectDataRootChoice` canonicalizes an absolute learner-owned writable directory, rejects symlinks in every existing path component, recognizes a valid existing manifest, and chooses the exact private empty directory or a private `open-deutsch-data/` child for unrelated non-empty or group/world-writable choices. The learner-selected parent may be group/world writable, as is common for folders created under a cooperative Linux umask, but the active data root may not be. It reports broadly permissioned, Git-worktree, and known-install-root warnings and never chmods existing directories.

The returned plan is a process-owned capability. `materializeDataRootSelection` consumes it once, rechecks the filesystem to close ordinary picker-to-write races, creates only the selected dedicated root and stable internal directories with mode 0700, writes the manifest atomically with mode 0600, validates ownership/types, and leaves unrelated files untouched. Test-only storage is created only with an explicit test-mode option.

## SQLite baseline and migrations

`openDataRootDatabase` opens only the database inside a currently valid bootstrap/root-generation lease. It pre-creates new database files with mode 0600, rejects symlink/non-file targets, configures WAL, foreign keys, a bounded 2-second busy timeout, and untrusted schemas off, then enables SQLite defensive mode after migration. The public handle exposes health metadata and idempotent close—not raw SQL.

Migrations are an ordered contiguous internal ledger. Each migration runs under `BEGIN IMMEDIATE`, advances `user_version` in the same transaction, and rolls back completely on failure. A database with a higher `user_version` than the current ledger fails closed. The only reset API verifies the exact disposable harness marker, run ID, fixed trusted temporary parent, canonical `data/` root, and regular database/sidecar files before deleting those three test artifacts; it cannot reset an ordinary learner root.

## Initial production schema

`openDeutschMigrations` owns sixteen ordered schema versions. Versions 1–3 cover learner settings/preferences, started lesson/exercise snapshots, answers, complete positional objective evaluations, feedback, and finalized correction/mistake evidence. Version 4 adds candidate/active/suspended vocabulary and optimistic SRS review transitions. Version 5 stores local advisory plan history and structured Voice summaries. Version 6 stores prepared activities, typed handoffs, filterable History reconstruction, and portable relative attachment metadata. Versions 7–9 add the immutable idempotency ledger, audited attempt deletion, and the dataset-portable first-AI privacy acknowledgement. Versions 10–12 add the default teaching-profile setting, plan-generation History compatibility, and immutable generated targeted-practice payloads linked separately from mistake evidence. Versions 13–16 add correction vocabulary candidates, generated vocabulary lesson sets, MCP attempt feedback, and versioned persistent handoff continuation context. Foreign keys, checks, triggers, domain parsing, and leased finalization transactions reject orphaned, contradictory, stale-root, malformed, or partially finalized records.

`OpenDeutschRepository` is the shared semantic adapter for Electron and MCP. It validates domain inputs, owns short leased transactions, performs optimistic vocabulary transitions/audited deletion, derives generation provenance from its private leased handle, and returns reconstructed domain values without exposing raw SQL or a database connection. Prepared activities accept only closed reference/request context—never arbitrary payloads, transcripts, audio paths, credentials, protocol objects, or filesystem paths. Specialized attempt/correction finalizers use the same leased transaction boundary.

Retryable writes claim an immutable `(operation, idempotencyKey)` ledger entry in the same transaction as their state change. An exact replay returns `replayed: true`; reuse with a different payload or entity fails with `OD_IDEMPOTENCY_CONFLICT`. Failed writes roll back their claim, so a corrected retry can proceed without duplicating attempts, reviews, plans, Voice summaries, or prepared activities.

This package owns SQLite and data-root adapters. UI, IPC, and MCP handlers consume repository interfaces rather than embedding SQL.
