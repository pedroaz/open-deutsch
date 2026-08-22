# SPIKE-IMP-020 — Exact cross-surface handoff

- **Status:** complete with release blocker
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-020, D-059, D-075, D-076, [ADR-0010](../adr/ADR-0010-exact-cross-surface-handoff.md)
- **Time/scope bound:** exact activity routing, one disposable MCP-to-dashboard state crossing, and current official Codex/Voice capability validation

## Question and accepted constraints

Can Codex create a persistent desktop activity, can the desktop route to that exact activity, and can Open Deutsch create or open the exact related Codex Voice session without clipboard/manual continuation?

All automated state must be disposable. The spike may exercise Electron routing and a tiny state fixture, but it must not add local audio or pretend a text thread, generic application launch, or UI automation is an exact Voice bridge.

## Candidate versions and environment

- Linux x86_64, Electron 42.7.1, Playwright 1.62.1
- Node.js 24.18.1 and `codex-cli 0.146.0`
- Official [ChatGPT Voice](https://learn.chatgpt.com/docs/features/voice), [Codex App Server](https://learn.chatgpt.com/docs/app-server), and [projects/chats](https://learn.chatgpt.com/docs/projects) documentation fetched 2026-08-15

## Success and blocker criteria

- **Success:** a valid `open-deutsch://activity/<id>` event selects the exact activity; a separate MCP-side process persists an exact prepared activity that a dashboard-side reader sees; a documented host mechanism creates/opens the exact Voice session.
- **Release blocker:** the host exposes only manual Voice UI, generic application opening, text-thread APIs, or undocumented/private navigation; any clipboard/manual-prompt fallback would be required.

## Disposable proof

The Electron compatibility fixture now acquires Electron's single-instance lock, handles custom activity routes through the supported second-instance/open-URL event boundary, parses one narrow route grammar, and sends only the validated activity ID through preload. Playwright launches a real second Electron process with the same disposable profile and `open-deutsch://activity/speaking-a1-1`, waits for that process to exit, and observes the ID delivered to the first window.

`scripts/lib/cross-surface-handoff.mjs` opens a state fixture only after proving an ownership-marked data root beneath a trusted temporary parent. A programmatic MCP SDK client spawns a STDIO server, lists and calls its prepared-activity tool, and the dashboard-side reader returns the same `voice-cafe-a1` ID, title, and `source: "mcp"`. A bounded cross-process lock serializes fixture writes; two concurrent writer processes preserve both exact IDs. Invalid routes and non-disposable roots fail closed.

The capability projection records exact text creation as App Server `thread/start`, exact text continuation as `codex resume <thread-id>`, and exact external Voice session opening as `null` with `OD_HANDOFF_VOICE_SESSION_UNSUPPORTED`.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/cross-surface-handoff.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" pnpm --filter @open-deutsch/desktop test:e2e
PATH="<Node-24.18.1-bin>:$PATH" pnpm exec eslint scripts/lib/cross-surface-handoff.mjs tests/cross-surface-handoff.test.mjs tests/e2e/fixtures/electron-spike tests/e2e/playwright-electron-spike.spec.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Evidence and observations

- Unit/process tests pass 4/4: strict URL routing, real spawned STDIO MCP call to dashboard reader, concurrent cross-process preservation, and the explicit Codex/Voice capability projection.
- Electron/Playwright passes 2/2; a real second Electron process delivers the exact activity ID to the locked first instance, while the SQLite multi-process proof remains green.
- App Server can create/resume exact persistent text threads and returns their IDs. The CLI can resume an exact saved thread ID.
- Official Voice documentation says a chat/task must begin in Voice mode using **Start new voice chat** and an earlier Voice chat is resumed by opening it and selecting **Start voice chat**.
- No official documentation or installed CLI help exposes an external Voice-create/Voice-open API, a Voice parameter on App Server threads, or a stable desktop deep-link contract.
- No model/account call, microphone, audio, normal learner state, or host task mutation was used.

## Alternatives and negative results

- **App Server `thread/start`:** Supports exact text identity but cannot select Voice mode; insufficient.
- **`codex resume <thread-id>`:** Supports exact CLI text continuation but does not open desktop Voice; insufficient.
- **Custom Codex/ChatGPT URL:** No supported exact Voice URL contract was found; rejected rather than guessed.
- **Generic desktop launch:** Does not guarantee the exact session; rejected.
- **Clipboard/manual prompt:** Explicitly prohibited and not implemented.
- **Computer-use/UI automation:** Not a stable integration API and would consume/steer the user's desktop; rejected.

## Decision or explicit blocker

[ADR-0010](../adr/ADR-0010-exact-cross-surface-handoff.md) accepts the activity-route and shared-state halves. Exact desktop-to-Codex Voice session handoff is unsupported by the current documented host surfaces, so `OD_HANDOFF_VOICE_SESSION_UNSUPPORTED` is an explicit release blocker. IMP-020 is complete as a validation spike, but listening/speaking release acceptance is not.

## Cleanup verification

- **Processes stopped:** The spawned writer and both Electron journeys exited cleanly.
- **Artifacts removed:** The activity state, Electron profile, screenshots, traces, and test roots remained under disposable/ignored output and were removed by their harnesses.
- **Artifacts retained:** Narrow route/store capability code, deterministic fixtures/tests, ADR, and this report only.
- **Private/account state:** No normal Codex task, Voice session, learner root, microphone, account, or model usage was touched.

## Follow-up

Revalidate the official Voice/desktop contract before IMP-131–134. Continue non-audio implementation while the external blocker remains; do not weaken the accepted product requirement silently.
