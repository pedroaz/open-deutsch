# Open Deutsch setup and recovery

Open Deutsch supports Linux x86_64 and ships as an AppImage. Use Node.js 26.5.0 and pnpm 11.0.9. A compatible external Codex CLI (`>=0.146.0 <0.146.1`) is needed for Codex integration and AI actions; the local desktop remains useful for non-AI work without it.

## First checkout

From the repository root:

```text
make setup
make doctor
make check
```

Use `make dev` for the development stack or `make prd` for the production-like local stack. `make start` is the exact `make prd` alias. Use `make status`, `make logs`, `make logs-errors`, and `make kill` only for the Open Deutsch-owned lifecycle.

## Data root

During onboarding, choose a private learner data directory outside the checkout when possible. Open Deutsch stores its SQLite database, attachments, research staging/cache, logs, and redacted diagnostics below that root. The bootstrap pointer stores only the selected path, format, and generation; it does not store learner text, credentials, or research content.

The app warns when a choice is inside a Git worktree, broadly readable, or an install directory. Research files remain under `research/staging/{notes,downloads,candidates,validation}` until an explicit review and promotion; canonical curriculum remains in `content/curriculum` and is read-only in packaged applications.

For a disposable development reset, stop the owned stack with `make kill`, remove only the disposable data root and redirected Codex/XDG directories created for that run, then rerun setup. Reset and diagnostic commands never target the learner's real selected root. An explicitly requested live journey warns without pausing, may use the selected root, and cleans up through learner-visible UI actions.

## Codex integration

The versioned source is the scoped local marketplace entry in `.agents/plugins/marketplace.json`, whose plugin payload is `plugins/open-deutsch`.

```text
make plugin-status
make install-plugin
make refresh-plugin
make uninstall-plugin
```

The commands use only the `open-deutsch-local` marketplace and `open-deutsch` plugin. Installation and refresh verify the installed version and MCP discovery before reporting success; uninstall removes only that scoped plugin and marketplace entry. The desktop Settings page provides the same explicit actions and shows the verified result.

## Diagnostics and recovery

- `make doctor` checks pinned tools, package health, and local prerequisites without changing user state.
- `make plugin-status` reports missing, installed, stale, or failed-start integration state.
- `make logs` and `make logs-errors` show or follow the merged bounded lifecycle, desktop, App Server, MCP, and bootstrap logs; `make logs-clear` requires confirmation before clearing them.
- If the selected root is unavailable, choose or recover a new root through Settings. Do not copy SQLite files or staging content manually into the checkout.
- If a packaged AppImage needs replacement, close Open Deutsch, replace the AppImage manually, and reopen it. No automatic updater is included and the external bootstrap pointer is preserved.

The application does not run Git commands, manage branches, or promote research without explicit approval. The maintainer owns all Git staging, review, commit, and publication decisions.

## Supported degradation

Listening and speaking remain Codex Voice workflows. Open Deutsch prepares, persists, reopens, and deletes bounded structured context and accepts explicit structured results or summaries; it has no local audio subsystem, audio files, full-transcript storage, copied-scenario continuation, session picker, generic launcher, or UI automation. The desktop reports `OD_HANDOFF_VOICE_SESSION_UNSUPPORTED` for direct opening, then guides the learner to start a new empty Voice task and ask for the prepared activity, which the plugin reads through MCP.
