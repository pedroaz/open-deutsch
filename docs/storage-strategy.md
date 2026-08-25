# Storage strategy

Status: current architecture
Last updated: 2026-08-24

## Decision

Use a hybrid storage model:

- **SQLite** is the canonical store for private, mutable learner state.
- **Markdown and YAML** hold reviewed, reusable curriculum and configuration that belong in Git.
- **JSON** is an interchange format for AI result validation, optional import/export, and unreviewed staging—not the primary learner database.
- Ordinary files hold larger attachments such as imported texts or images, with their metadata recorded in SQLite. Audio is neither captured nor played by Open Deutsch.

The selected driver is the supported runtimes' built-in `node:sqlite` `DatabaseSync` API. Electron main uses its embedded Node 24 runtime while the separate MCP process uses the pinned Node 26.5.0 host runtime; each owns a connection to the same local file. Connections enable foreign keys, WAL, and a bounded busy timeout; writes use short transactions and ordered transactional `user_version` migrations. This avoids a third-party native addon, Electron ABI rebuild, and SQLite-specific AppImage unpack rule.

## Vocabulary review scheduling

Vocabulary candidates remain separate from active review cards until the learner confirms each card. Stage intervals are 1, 3, 7, 14, and 30 calendar days, with explicit `again`, `hard`, `good`, and `easy` transitions. Due queries include overdue cards, and review sessions carry the saved example and source context while alternating recognition and production. Main-process timestamps are validated and injected; the domain never reads the ambient clock.

## Why SQLite owns learner state

Attempts, corrections, mistake evidence, vocabulary cards, spaced-repetition scheduling, weekly plans, and relationships among them are structured and frequently updated. SQLite provides transactions, migrations, indexes, and reliable queries without introducing a server or cloud dependency.

A directory of JSON, YAML, or Markdown records would initially look simpler, but would make atomic updates, schema evolution, recurring-mistake queries, and spaced-repetition scheduling more fragile. Human-readable export remains important; human-editable files do not need to be the operational database.

## Storage boundaries

### Local application data

Store in SQLite:

- learner profile and preferences;
- AI workflow model preferences;
- weekly plan;
- generated exercises once started;
- attempts, answers, feedback, and correction evidence;
- mistake categories and recurring-pattern evidence;
- vocabulary candidates, active cards, and review schedule;
- Voice session summaries;
- general activity-history records and cross-surface handoff identifiers;
- references to local attachments;
- schema and application migration state.

During onboarding, the learner selects the data root. The database is created there and must be ignored by Git. A repository clone starts with an empty learner database.

Keep a minimal bootstrap file in the operating system's standard per-user application configuration location. It stores the selected data-root path, a monotonically increasing root-generation identifier, and non-sensitive startup metadata so both the desktop app and installed MCP helper can locate the same database. It must not contain learning history or authentication credentials. Dataset switches invalidate cached MCP state and require the MCP process to reopen against the new generation before serving another tool call.

The picker should suggest a sensible Linux location but require the learner to confirm or choose it. Resolve and validate the target, reject unsafe symlink traversal and paths outside the approved root, verify it is writable, and create application-owned files with restrictive permissions where possible. If it contains an existing Open Deutsch data manifest, offer to open it; if it is an unrelated non-empty directory, ask for a new subdirectory. Warn clearly before using a Git worktree so private activity is not committed accidentally.

Keep bounded, rotated, human-readable diagnostic logs beneath the selected root in a dedicated `logs/` directory. Logs use correlation IDs and redacted event summaries; they exclude credentials, authentication material, full prompts, learner text, correction bodies, and source contents by default.

### Version-controlled repository content

Store in Markdown and YAML:

- A1–B2 curriculum map;
- reviewed lessons and everyday-life guides;
- teaching profiles and pedagogy rules;
- exercise format definitions and rubrics;
- source metadata and review dates;
- default application policy that should apply to new clones.

The release build packages this reviewed content as an opinionated, read-only base-curriculum snapshot. The application may layer personalized derivatives in local storage, but it does not run Git commands or mutate the maintainer's repository history.

Prefer Markdown for prose intended for review and YAML for small structured metadata. Avoid putting private learner activity into front matter or repository files.

### Generated staging and exchange

Use schema-validated JSON for:

- App Server results before they are committed to SQLite;
- optional import and portable export;
- staged curriculum candidates awaiting review;
- temporary diagnostic artifacts.

Generated staging remains ignored by Git until the maintainer deliberately copies or accepts reusable material into the reviewed curriculum and manages the Git change externally.

## Single-folder portability direction

- Keep SQLite, attachments, and local research staging together beneath the selected data root.
- Do not create automatic backups, managed snapshots, or a backup subsystem.
- Do not implement **Move data folder**. Choosing another valid data root switches which dataset the app opens; it does not copy or delete data.
- Allow the learner to point the app at an existing Open Deutsch data root and recreate the bootstrap pointer.
- A learner may manually copy the self-contained folder while the app and MCP server are stopped.
- Optional JSON/Markdown export can be added for inspection or interoperability, but it is not required for restoring the app.
- Never require raw Codex task history to reopen the learning record.

## Privacy baseline

- Rely on operating-system file permissions and the learner's disk encryption.
- Create and maintain Open Deutsch-owned files with restrictive Linux permissions where possible, and reject permission or symlink boundary violations at runtime.
- Clearly disclose that the selected folder contains readable local learning data.
- Clearly disclose that model requests send the selected exercise or research context to OpenAI through the installed Codex client even though the resulting learning record remains local.
- Defer application-level SQLite encryption until there is a concrete requirement.

## Runtime integrity

Persistence preserves these invariants directly through runtime validation, transactions, migrations, and bounded operational diagnostics:

- generated exercises, attempts, corrections, and mistake-history views remain reconstructable;
- vocabulary review schedules update transactionally;
- an existing data root reopens without Codex task data;
- older supported databases migrate atomically;
- switching roots cannot read or write the stale dataset;
- logs remain redacted and bounded, and diagnostics exports remain explicit;
- owned files retain restrictive permissions and symlink escapes fail closed.

Deleting an unstarted generated prepared activity is one atomic repository operation. It refuses deletion when exercises have started, retained MCP feedback exists, or sourced vocabulary has been confirmed. Otherwise it records the required opaque vocabulary-deletion tombstones, removes only unconfirmed vocabulary candidates sourced exclusively from that activity, then removes the activity and its cascading generated payload/context records. Tombstones retain no candidate content.
