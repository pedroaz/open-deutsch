# Historical sequencing rationale

Status: superseded by `implementation-plan.md`  
Last updated: 2026-08-15

This document no longer defines product scope, milestones, phase gates, or acceptance. The user selected one dependency-ordered implementation TODO that an agent can execute as a single goal and loop. The canonical artifact is [`implementation-plan.md`](implementation-plan.md).

The useful sequencing rationale retained from discovery is:

1. Validate architecture-changing assumptions early: the external Codex/App Server runtime, supported plugin installation, exact bidirectional handoff, Electron/Playwright compatibility, SQLite concurrency, and Linux AppImage packaging.
2. Establish the shared local data, contracts, MCP, desktop shell, design system, localization, logging, and deterministic test foundations.
3. Prove a deep writing correction workflow across both surfaces, including correction history, recurring mistakes, contextual explanations, and model/reasoning preferences.
4. Extend the same foundations across exercise formats, grammar, vocabulary/SRS, reading, optional placement, weekly planning, general History, and four-skill evidence.
5. Keep all speaking/listening/audio activity in Codex Voice and require an exact structured handoff plus explicit structured result capture.
6. Build the opinionated A1–B2 curriculum and Codex research workflow while leaving every Git operation to the maintainer.
7. Validate the full accepted feature breadth, supported plugin flow, manual live verification, security/accessibility/visual quality, and packaged Linux artifact before closing the single goal.

These points explain dependency order only. They must not be interpreted as permission to stop after a narrower MVP. Completion requires every in-scope item in the canonical TODO.

## Non-negotiable current boundaries

- Linux only; no Windows audit or build in the current goal.
- An existing compatible Codex installation and its managed account are required; no bundled Codex and no API-key fallback.
- All audio stays in Codex; Open Deutsch has no audio capture, generation, import, storage, or player.
- Exact structured cross-surface handoff is required; there is no clipboard or manual-prompt fallback.
- The base curriculum is opinionated, reviewed, and Git-tracked, but Open Deutsch never performs Git operations.
- Make is the public command surface; pnpm scripts are implementation details behind complete Make targets.
- Automated tests are deterministic and use disposable data. Real-account App Server and installed-plugin checks are explicit, separately confirmed verification commands.
