# ADR-0013 — Common identifiers and time values

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-023, IMP-011, packages/contracts

## Context

Shared records cross IPC, MCP, AI, persistence, and fixture boundaries. Plain strings make unrelated identifiers interchangeable, while runtime `Date` objects and implicit wall-clock reads do not survive JSON boundaries deterministically.

## Decision

Represent each entity identifier as an opaque lowercase string with a fixed family prefix, an underscore separator, and a 16–64 character lowercase base-36 token. Apply a distinct Zod brand to every identifier family. The token remains opaque: consumers must not infer time, ordering, shard, ownership, or origin from it.

Cover learner, activity, exercise, attempt, correction, mistake, vocabulary, review, plan, Voice session, curriculum topic, model request, persistent handoff, history entry, run, session, and correlation identifiers. Represent data-root generation separately as a positive safe integer.

Represent instants as canonical UTC ISO 8601 strings with exactly millisecond precision, calendar dates as ISO date-only strings, and durations as non-negative safe integer milliseconds. Runtime/domain adapters may convert values after validation, but wire and persistence contracts remain JSON scalars.

Keep production ID generation and time reads outside the contracts package. Shared deterministic tests use an explicit sequence/start instant factory and never randomness, the system clock, sleeps, or identifier parsing.

## Evidence

The contracts suite checks all 17 identifier families against every other family, malformed/case/length rejection, compile-time brand inference, data-root generation bounds, canonical instants and real calendar dates, safe duration bounds, repeatable sequences, sequence exhaustion, and monotonic fixed fixture time.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" pnpm --filter @open-deutsch/contracts run build
PATH="<Node-24.18.1-bin>:$PATH" pnpm --filter @open-deutsch/contracts test
PATH="<Node-24.18.1-bin>:$PATH" pnpm run typecheck
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Rejected alternatives

- **One generic ID string:** Rejected because it permits accidental cross-entity assignment and weak runtime diagnostics.
- **Bare UUID values everywhere:** Rejected as the public contract because they do not identify the expected entity family; an adapter may use UUID entropy inside the opaque token only if it fits the accepted alphabet/length.
- **Timestamps encoded in IDs:** Rejected because consumers could acquire hidden ordering/time coupling.
- **JavaScript `Date` across boundaries:** Rejected because JSON serialization changes the runtime type and timezone/precision assumptions become implicit.
- **Epoch milliseconds for human calendar dates:** Rejected because calendar dates are not instants and timezone conversion can change the intended date.

## Accepted boundaries and consequences

- This ADR defines validation/type shape, not the production entropy algorithm; a later adapter must provide collision-resistant generation.
- IDs are case-sensitive and never reused across families.
- UTC instants require `.sssZ`; offset timestamps and precision variants must be normalized before validation.
- Calendar dates carry no timezone or time-of-day.
- Test factories are support code and must not be imported by production packages.

## Supersession

None.
