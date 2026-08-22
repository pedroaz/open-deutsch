# ADR-0015 — Deterministic vocabulary review scheduling

- **Status:** accepted
- **Date:** 2026-08-20
- **Decision owners:** repository maintainers
- **Related:** IMP-098–102, D-030, packages/domain/src/vocabulary.ts

## Context

Vocabulary extracted from corrections and generated activities is useful evidence, but it must not silently become a learner commitment. Once confirmed, review needs to remain understandable and testable without delegating interval decisions to a model or reading an ambient clock in domain code.

## Decision

Keep candidates in a separate `candidate` state until explicit learner confirmation. A confirmed card starts at stage 1. Reviews accept exactly `again`, `hard`, `good`, or `easy` and use the fixed stage intervals `{1: 1, 2: 3, 3: 7, 4: 14, 5: 30}` calendar days. `again` returns to stage 1 for one day; `hard` keeps the current stage with half the stage interval, rounded down and bounded to one day; `good` advances one stage; `easy` advances two stages. Stage 5 remains the maximum.

The main process supplies validated UTC review timestamps; domain and persistence code do not read the system clock. Due queries include overdue cards and order by due date then opaque vocabulary ID. A review session alternates recognition and production cards in that stable order and carries the saved example and source context.

## Evidence

Domain tests cover grade transitions and calendar scheduling. Persistence tests cover candidate confirmation, due/overdue session creation, deterministic recognition/production ordering, review history, suspension/resume, editing, and deletion. The renderer test covers confirmation, source navigation, due review, and rescheduling.

## Validation commands

```text
pnpm exec vitest run --project domain --project persistence --project desktop
make test-fast
```

## Rejected alternatives

- **Model-selected intervals:** Rejected because scheduling must be explainable, bounded, and reproducible.
- **Implicit confirmation on extraction:** Rejected because correction and exercise evidence is a suggestion, not an active review commitment.
- **Ambient `Date` reads in domain code:** Rejected because it makes transitions nondeterministic and complicates clock-injected tests.

## Accepted boundaries and consequences

- This is intentionally a simple MVP schedule, not a claim of optimal retention science.
- Sessions are generated from the current due query and are not completion ledgers; each review remains the durable event.
- Editing learner text does not silently rewrite prior review history.

## Supersession

None.
