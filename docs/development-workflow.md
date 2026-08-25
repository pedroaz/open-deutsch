# Development workflow

Status: current engineering guidance
Last updated: 2026-08-24

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

## Quality and live-journey targets

- `make typecheck`
- `make lint`
- `make lint-fix`
- `make format`
- `make format-check`
- `make check`
- `make test`
- `make doctor`
- `make package`

`make check` combines formatting, linting, and strict TypeScript checks without running a user journey. `make test` is not a completion gate: it warns, then launches the production Electron application without a confirmation prompt and runs only explicitly requested live Playwright journeys against the connected account and selected learner data. It is never part of CI or scheduled automation. Development startup reuses valid TypeScript build information instead of forcing a clean compile on every launch. Lifecycle readiness uses a bounded 60-second startup window so a necessary clean Electron watch build can initialize without weakening failure cleanup.

## Live verification boundary

The repository has no automated regression suite, unit/component suite, fake-service journey, prompt corpus, or coverage gate. A new Playwright journey is added only when the user asks for that user-visible workflow. Every live run warns about account usage and learner-data mutation without pausing, avoids private artifacts, and uses visible product cleanup rather than direct database cleanup.

## Plugin targets

- `make install-plugin`
- `make refresh-plugin`
- `make plugin-status`
- `make uninstall-plugin`

Use only documented stable local marketplace and CLI behavior. Do not use App Server plugin operations documented as under development in production. Commands must scope changes to the Open Deutsch marketplace/plugin and preserve unrelated configuration. When a stable automatic action is unavailable, print the exact supported installation step; the product must not pretend installation succeeded.

The repository-scoped source is `.agents/plugins/marketplace.json` with the `open-deutsch` payload under `plugins/open-deutsch`. The adapter verifies version and MCP discovery after install/refresh and reports failures explicitly. See [setup and recovery](setup.md) for the disposable reset boundary and the exact user workflow.

## Code quality baseline

- Strict TypeScript across Node, Electron, renderer, and contracts.
- ESLint flat configuration with TypeScript, React, hooks, imports, accessibility, Electron security, unsafe `any`, and package-boundary enforcement.
- Prettier owns formatting.
- Runtime schemas validate IPC, MCP, AI results, curriculum metadata, and persisted JSON boundaries.
- No mandatory Git hooks initially; repository commands and Codex instructions are authoritative.
