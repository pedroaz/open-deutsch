# Reusable implementation lessons

Status: active agent guidance
Last updated: 2026-08-15

Record only a discovery that will change future implementation or diagnosis. Do not add ordinary progress, completed checklist items, chat summaries, or speculative advice.

## Entry format

Each entry must include:

- **Date**
- **Component**
- **Lesson**
- **Evidence or reproduction**
- **Durable action or rule**
- **Status** — `candidate`, `promoted`, or `superseded`

Promote a repeatedly validated candidate into the closest `AGENTS.md`, this runbook, an ADR, or the relevant product document. Mark it promoted and link the durable destination. Supersede or remove stale guidance instead of accumulating contradictions.

## Workspace toolchain — Pinned runtime evidence

- **Date:** 2026-08-15
- **Component:** workspace toolchain
- **Lesson:** Passing on a newer host Node.js version is not evidence that the pinned Node.js 24.18.1 runtime works.
- **Evidence or reproduction:** `pnpm --silent dlx node@24.18.1 --test tests/*.test.mjs`
- **Durable action or rule:** Run compatibility-sensitive tests and build tools with Node.js 24.18.1 and report that runtime in acceptance evidence; see `docs/agent/runbook.md`.
- **Status:** promoted

## Make lifecycle — Ownership ambiguity

- **Date:** 2026-08-15
- **Component:** Make lifecycle
- **Lesson:** A dead or reused tracked leader PID cannot safely authorize signalling an apparent process group. Erasing its state also loses the only ownership record.
- **Evidence or reproduction:** `pnpm --silent dlx node@24.18.1 --test tests/lifecycle.test.mjs`
- **Durable action or rule:** Retain and report ambiguous ownership state, fail kill/start safely, and require a deliberate recovery decision; see root `AGENTS.md` and `docs/agent/runbook.md`.
- **Status:** promoted
