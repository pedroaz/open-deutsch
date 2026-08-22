# ADR-0019 — Structured Voice boundary and qualitative progress evidence

- **Status:** accepted
- **Date:** 2026-08-21
- **Decision owners:** repository maintainers
- **Related:** IMP-169, IMP-170, IMP-171, IMP-172, IMP-173, [ADR-0010](ADR-0010-exact-cross-surface-handoff.md)

## Context

Open Deutsch can prepare bounded listening and speaking context and can persist structured results, but the accepted exact Codex Voice bridge remains unavailable. The desktop still needs useful evidence views without pretending that a local audio subsystem or a single score exists.

## Decision

Represent listening and speaking preparation as a typed `voiceActivityContext` containing the target level, Germany scenario, difficulty, correction timing, objectives, prompts, answer guidance, and the exact `OD_HANDOFF_VOICE_SESSION_UNSUPPORTED` blocker. Persist only explicit structured listening results or Voice summaries through bounded MCP contracts. Open Deutsch never creates, imports, stores, plays, or transcribes audio locally, and does not offer clipboard, manual-selection, generic-open, or UI-automation fallbacks.

Build Progress from the general History projection. Show separate qualitative writing, speaking, reading, and listening evidence, selected grammar/vocabulary patterns, dated source counts, and links back to History. Do not calculate one composite score or imply CEFR certification. Inferred mistake classifications remain visibly editable through a generation-checked, auditable amendment operation; the amendment changes the effective category without rewriting observations.

## Evidence

Typed IPC, persistence, MCP, renderer, and Electron fixtures cover preparation, the four listening result kinds, no-audio/full-transcript notices, History reconstruction/deletion, four-skill evidence, and learner amendment dispatch. The focused contracts and desktop suites pass after the new channel is rebuilt. Exact Voice handoff remains intentionally unimplemented and is covered as a release-blocking state.

## Consequences

The product can honestly show progress and retain useful structured Voice evidence without claiming an unsupported host capability. The listening/speaking implementation items that require an exact session remain blocked until the supported bridge is revalidated or product authority changes ADR-0010. The Progress view is dependent on the same bounded History projection and refreshes on load, focus, or manual request.

## Accepted boundaries and consequences

The accepted product boundary is structured text evidence only: no local audio, full transcript, clipboard fallback, generic launcher, or composite score. This ADR adds no host capability and does not authorize external account access or a change to the exact-handoff contract.

## Validation commands

```text
make check
make test-e2e
make test-plugin
```

## Supersession

This ADR supersedes no earlier decision. ADR-0010 remains authoritative for exact cross-surface handoff behavior; this ADR records the bounded implementation and its release-blocking state.

## Rejected alternatives

- **Store local audio or full transcripts:** Rejected by the privacy and product boundary; structured outcomes are sufficient for the supported surface.
- **Use one overall progress score:** Rejected because heterogeneous evidence and incomplete Voice coverage would make the result misleading.
- **Treat an inferred mistake as authoritative:** Rejected; learners can amend the effective category while immutable dated observations remain visible.
- **Offer a copy prompt or generic Voice launch:** Rejected by ADR-0010 and the exact-handoff requirement.
