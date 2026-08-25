# Codex development runbook

Status: active agent guidance
Last updated: 2026-08-25

This runbook is the operating companion to the root `AGENTS.md`. The accepted workflow remains authoritative in `docs/development-workflow.md`.

## Start and orient

1. Read the user's request, the affected code, and the relevant living product or architecture documents.
2. Run `git status --short` and preserve unrelated changes.
3. Run `make help` to discover the public surface.
4. Use `make setup` on the pinned Node.js 26.5.0 host runtime when dependencies or toolchain state need validation. Electron 42 still embeds Node.js 24, so use the Electron gates for mixed-runtime evidence. A different host Node version is diagnostic noise, not pinned-runtime evidence.

Codex discovers root and nested `AGENTS.md` files from the repository root toward the current directory; closer guidance applies later. The current convention follows the [official OpenAI AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Everyday loop

- Inspect code and redacted logs while editing.
- Run `make check` only when the user asks for static verification or a pull request is being prepared.
- Add or run a live Playwright journey only when the user explicitly requests that user-visible workflow.

## Lifecycle and logs

- `make dev` starts the development stack in the background and waits for a correlated readiness record.
- `make prd` builds first, starts the production-like stack, and waits for health. `make start` is its alias.
- `make status` reports only recorded `dev` and `prd` state.
- `make kill` signals only a live, identity-matched owned process group. It is idempotent for stopped modes and fails nonzero while retaining state if ownership cannot be proven safely.
- `make logs` follows merged lifecycle, desktop, App Server, MCP, and bootstrap logs; `make logs-errors` filters warning/error records.
- `make logs-clear` resolves the bounded Open Deutsch log targets and requires interactive confirmation before removing known current and rotated files.

Lifecycle state and startup logs live below the ignored `.runtime/` directory. Do not delete a retained orphan/PID-reuse record merely to unblock a start. First inspect the state, `/proc` identity, and logs; if exact ownership cannot be established, stop and request a deliberate recovery decision.

## Focused failure diagnosis

- Toolchain: `pnpm run toolchain:check`; add `:integration` only to check the installed Codex/App Server capability without performing a model turn.
- TypeScript: run the affected project with `pnpm exec tsc -b <config> --force`, then restore the broad `make typecheck` gate.
- Lint/format: use `pnpm run lint` or `pnpm run format:check`; use fix commands only for intended files.
- Electron: inspect bounded live-journey failure codes and redacted main-process logs; live runs do not retain traces, screenshots, video, or DOM dumps.
- MCP: inspect the built STDIO entrypoint directly when diagnosing it; keep STDOUT clean and inspect redacted STDERR.
- App Server: verify the pinned CLI and documented capability directly without fake processes.
- Packaging: use `make package` and inspect generated metadata and launch behavior in a disposable environment.

## Live-account boundary

`make test` is user-requested functional verification. Never invoke it from CI, `make check`, scheduled automation, or as a speculative diagnostic. The runner explains that it uses the managed personal Codex account and selected learner data and may consume usage or change records, then proceeds without a confirmation prompt.

## Disposable-state recovery

- Resolve and print a disposable target before deleting or clearing anything.
- Operational diagnostics use only disposable roots. An explicitly requested live journey may use the selected learner root after warning without pausing.
- Prefer the owning Make command for lifecycle/log cleanup.
- Preserve a failed live record when UI cleanup cannot identify it safely; never perform hidden database cleanup.
- Never use broad process matching, broad globs, or recursive deletion aimed at a workspace, home, Codex home, or unresolved environment variable.

## Completion evidence

Record the commands and outcomes that prove the requested change, including the pinned runtime where compatibility matters. Review `git diff --check`, changed files, ignored/generated artifacts, and privacy-sensitive output before handing the work back to the user.
