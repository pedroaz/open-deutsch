# Development workflow

Status: current engineering guidance
Last updated: 2026-08-22

## Command boundary

Make is the documented human-facing command surface. Make targets delegate to complete pnpm workspace scripts and print the underlying command before execution. Package-local pnpm commands remain available to Codex agents for narrow diagnosis and targeted tests.

`make help` must list every public target with a concise English explanation.

## Required lifecycle targets

- `make setup` — install and validate the pinned toolchain and dependencies.
- `make dev` — start the hot-reload development stack in the background.
- `make prd` — build all required packages, start the production-like desktop stack in the background, wait for a startup signal, and fail clearly if startup fails.
- `make start` — documented alias for `make prd`.
- `make status` — show only Open Deutsch-owned process and health state.
- `make kill` — idempotently stop only tracked Open Deutsch processes.
- `make logs` — follow current human-readable logs.
- `make logs-errors` — show/follow warnings and errors.
- `make logs-clear` — explicitly remove only bounded Open Deutsch log files after confirming the resolved target.

Development and production-like runs record exact PIDs and mode-specific state in an ignored runtime directory. Never kill by broad process-name matching. Detect stale PIDs and refuse to target processes whose identity no longer matches.

## Required quality and test targets

- `make typecheck`
- `make lint`
- `make lint-fix`
- `make format`
- `make format-check`
- `make check`
- `make test-fast`
- `make test`
- `make test-e2e`
- `make test-plugin`
- `make test-all`
- `make doctor`
- `make package`

`make test-fast` is the everyday sub-20-second target where practical. `make test` is an exact convenience alias for `make test-fast`. `make check` is deterministic and combines formatting, linting, strict types, and the complete fast gate. `make test-all` includes every deterministic local gate, including Electron journeys and plugin/MCP checks, and never invokes a real OpenAI account. Lifecycle readiness uses a bounded 30-second startup window so the Electron watch build can initialize without weakening failure cleanup.

## Explicit live verification targets

- `make verify-live` — warn, require explicit confirmation, then perform the one fixed real-account App Server correction verification against disposable data.
- `make verify-plugin` — warn, require explicit confirmation, then run the installed-host skill/tool prompt evaluation inventory.

Neither target is called by normal tests, CI, `make check`, `make test-all`, or unattended automation.

## Plugin targets

- `make install-plugin`
- `make refresh-plugin`
- `make plugin-status`
- `make uninstall-plugin`

Use only documented stable local marketplace and CLI behavior. Do not use App Server plugin operations documented as under development in production. Commands must scope changes to the Open Deutsch marketplace/plugin and preserve unrelated configuration. When a stable automatic action is unavailable, print the exact supported installation step; the product must not pretend installation succeeded.

The repository-scoped source is `.agents/plugins/marketplace.json` with the `open-deutsch` payload under `plugins/open-deutsch`. The adapter verifies version and MCP discovery after install/refresh and reports failures explicitly. See [setup and recovery](setup.md) for the disposable reset boundary and the exact user workflow.

## Code quality baseline

- Strict TypeScript across Node, Electron, renderer, contracts, and tests.
- ESLint flat configuration with TypeScript, React, hooks, imports, accessibility, Electron security, unsafe `any`, and package-boundary enforcement.
- Prettier owns formatting.
- Runtime schemas validate IPC, MCP, AI results, curriculum metadata, and persisted JSON boundaries.
- No mandatory Git hooks initially; repository commands and Codex instructions are authoritative.
