# ADR-0010 — Exact cross-surface handoff capability boundary

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-020, D-059, D-075, D-076, [SPIKE-IMP-020](../spikes/SPIKE-IMP-020-exact-cross-surface-handoff.md)

## Context

Open Deutsch requires persistent structured movement in both directions without clipboard or manual-prompt fallbacks. Codex-originated activities must appear on the desktop dashboard. Desktop-originated listening and speaking must open or create the exact related Codex Voice session. A custom `open-deutsch://` route is useful only where the invoking host supports external URL launch.

## Decision

Use canonical `open-deutsch://activity/<activity-id>` routes for exact desktop activity selection and reject every other host, query, fragment, traversal, or malformed identifier. Persist MCP-created prepared activities in the shared data root so dashboard refresh reads the same exact identifier and content; the route is an optional focus mechanism, not the persistence transport.

Accept App Server `thread/start` and recorded thread IDs plus `codex resume <thread-id>` as supported exact text-thread primitives. Do not represent them as Voice handoff. The current official ChatGPT Voice contract requires a chat/task to begin in Voice mode through desktop UI and documents resuming by opening the earlier Voice chat and selecting **Start voice chat**. No documented external API, CLI command, App Server method, or desktop deep link creates or opens an exact Voice-mode session.

Therefore `OD_HANDOFF_VOICE_SESSION_UNSUPPORTED` is a release blocker for every accepted listening/speaking workflow. Do not build clipboard text, manual prompt instructions, a generic “open ChatGPT” action, UI automation, or an undocumented URL as a substitute. Revalidate official host capabilities before implementing the later Voice items; release remains blocked until a supported exact bridge exists or the product authority explicitly changes D-075/D-076.

## Evidence

[SPIKE-IMP-020](../spikes/SPIKE-IMP-020-exact-cross-surface-handoff.md) records a real second Electron 42.7.1 process delivering an exact activity route through the single-instance boundary, a real SDK client calling a spawned STDIO MCP tool whose prepared activity the dashboard-side reader sees unchanged, concurrent cross-process writes, and the supported/blocked Codex capability matrix.

The official [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server) documents `thread/start`, `thread/resume`, and durable thread IDs. The official [projects and chats documentation](https://learn.chatgpt.com/docs/projects) documents `codex resume` for exact saved chats. The official [ChatGPT Voice documentation](https://learn.chatgpt.com/docs/features/voice) documents only UI creation/resumption of Voice-mode chats and requires Voice mode at chat/task start.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/cross-surface-handoff.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" pnpm --filter @open-deutsch/desktop test:e2e
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Rejected alternatives

- **Treat App Server text threads as Voice sessions:** Rejected. Voice mode has a distinct host lifecycle and allowance; text-thread identity does not activate it.
- **Open the ChatGPT application generically:** Rejected. It does not select or create the exact related Voice session.
- **Clipboard or manual continuation prompt:** Rejected by D-076 and incapable of exact identity preservation.
- **Automate desktop clicks or invent a private deep link:** Rejected. UI automation and undocumented schemes are not stable product contracts.
- **Store activity context only in the route:** Rejected. MCP and desktop share persistent state; routing only selects an already-persisted exact activity.

## Accepted boundaries and consequences

- Electron handles a valid custom route delivered through its supported `second-instance`/`open-url` events. Whether Codex itself launches that scheme is optional and currently unproven.
- MCP-to-dashboard activity creation is supported and does not require launching the desktop.
- The spike store serializes cross-process writers; its lock/state fixture is evidence only, not the later SQLite production design.
- Exact Codex text-thread creation/resumption is supported but does not satisfy the Voice requirement.
- The capability projection uses an explicit `null` Voice bridge plus stable blocker code, never an optimistic fallback.
- Later contract and UI work may model and display the blocker, but must not claim listening/speaking release readiness while it remains.

## Supersession

None.
