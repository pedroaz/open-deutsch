# Codex implementation runbook

Status: active agent guidance
Last updated: 2026-08-15

This runbook is the operating companion to the root `AGENTS.md`. The accepted workflow remains authoritative in `docs/development-workflow.md`.

## Start and orient

1. Read the active item in `docs/implementation-plan.md`, its dependencies, and its named authority documents.
2. Run `git status --short` and preserve unrelated changes.
3. Run `make help` to discover the public surface.
4. Use `make setup` on the pinned Node.js 24.18.1 runtime when dependencies or toolchain state need validation. A different host Node version is diagnostic noise, not pinned-runtime evidence.

Codex discovers root and nested `AGENTS.md` files from the repository root toward the current directory; closer guidance applies later. The current convention follows the [official OpenAI AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Everyday loop

- Use a focused package command or named Node test while editing.
- Run `make test-fast` after code or configuration changes.
- Run `make check` before completing a broad deterministic slice.
- Use `make test-e2e` for Electron journeys and `make test-plugin` for plugin/MCP structure when their owning checklist items have implemented them.
- An `[UNAVAILABLE]` command means its later dependency is not implemented; record it as unavailable, never as passing evidence.

## Lifecycle and logs

- `make dev` starts the development stack in the background and waits for a correlated readiness record.
- `make prd` builds first, starts the production-like stack, and waits for health. `make start` is its alias.
- `make status` reports only recorded `dev` and `prd` state.
- `make kill` signals only a live, identity-matched owned process group. It is idempotent for stopped modes and fails nonzero while retaining state if ownership cannot be proven safely.
- `make logs` follows lifecycle logs; `make logs-errors` filters warning/error records.
- `make logs-clear` resolves the bounded lifecycle log directory and requires interactive confirmation before removing only known rotated log names.

Lifecycle state and startup logs live below the ignored `.runtime/` directory. Do not delete a retained orphan/PID-reuse record merely to unblock a start. First inspect the state, `/proc` identity, and logs; if exact ownership cannot be established, stop and request a deliberate recovery decision.

## Focused failure diagnosis

- Toolchain: `pnpm run toolchain:check`; add `:integration` only to check the installed Codex/App Server capability without performing a model turn.
- TypeScript: run the affected project with `pnpm exec tsc -b <config> --force`, then restore the broad `make typecheck` gate.
- Lint/format: use `pnpm run lint` or `pnpm run format:check`; use fix commands only for intended files.
- Electron: inspect the first Playwright trace, screenshot, renderer console, and main-process log before rerunning.
- MCP: spawn the same built STDIO entrypoint used by the plugin; keep STDOUT clean and inspect redacted STDERR.
- App Server: verify the pinned CLI and documented capability first, then use fake JSON-RPC fixtures for routine tests.
- Packaging: use `make package` only after its owning packaging item is implemented; inspect generated metadata and launch behavior in a disposable environment.

## Live-account boundary

`make verify-live` and `make verify-plugin` are manual functional verification. Never invoke either from tests, CI, `make check`, `make test-all`, an unattended loop, or as a speculative diagnostic. Immediately before either command, explain that it may consume the managed personal Codex account, obtain explicit user confirmation, and use disposable Open Deutsch data. Confirmation for one command does not authorize the other.

## Disposable-state recovery

- Resolve and print a disposable target before deleting or clearing anything.
- Use only test-created roots, never the learner's selected root or real bootstrap pointer.
- Prefer the owning Make command for lifecycle/log cleanup.
- Preserve a failed test root when it contains useful redacted evidence; otherwise remove only that exact generated root.
- Never use broad process matching, broad globs, or recursive deletion aimed at a workspace, home, Codex home, or unresolved environment variable.

## Completion evidence

Record the commands and outcomes that prove the item, including the pinned runtime where compatibility matters. Review `git diff --check`, changed files, ignored/generated artifacts, and privacy-sensitive output. Update the implementation checkbox only after the required evidence succeeds.
