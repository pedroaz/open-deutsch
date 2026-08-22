# ADR-0014 — Shared error and log-reference model

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-024, D-080, docs/logging-strategy.md

## Context

Errors cross renderer, main, MCP, App Server, persistence, and diagnostic boundaries. Raw exceptions and protocol failures can expose learner text, credentials, private paths, or unstable implementation messages. The UI still needs localized recovery text and a stable reference that a person or support agent can correlate with redacted local logs.

## Decision

Use a closed runtime-validated union for validation, not-found, conflict, stale-data-root, database, App Server, authentication, unsupported Codex version, rate-limit, cancellation, model-output, MCP, handoff, and unsupported-operation failures.

Each category owns exactly one stable English `OD_*` diagnostic code and one localization key. Encode category/code/key/reference-code correlation as literal union variants so runtime validation and generated JSON Schema agree. Errors carry no arbitrary detail or caller-provided message field.

Expose a log reference containing the diagnostic code, correlation ID, canonical occurrence instant, and optional run/session IDs. Render user messages only from complete static English/German catalogs; adapters may add recovery actions outside this diagnostic contract. Detailed causes remain in separately redacted bounded logs and never cross merely because an error is serialized.

## Evidence

The contracts suite constructs all 14 categories, proves unique codes/keys, rejects every mismatched category/code/key/reference combination and unknown detail field, verifies complete placeholder-free EN/DE messages, and checks that Draft 2020-12 emits 14 closed variants with literal correlations.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" pnpm --filter @open-deutsch/contracts run build
PATH="<Node-24.18.1-bin>:$PATH" pnpm --filter @open-deutsch/contracts test
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Rejected alternatives

- **Serialize native `Error`:** Rejected because stack, cause, message, and enumerable implementation fields are unstable and may be private.
- **One generic failure code:** Rejected because recovery, diagnostics, and user guidance differ materially by category.
- **Caller-provided localized message:** Rejected because it bypasses catalog completeness and can echo unsafe input.
- **Arbitrary metadata/details map:** Rejected because it creates an unbounded privacy and compatibility channel.
- **Cross-field refinement only:** Rejected because Zod refinements are not represented in JSON Schema; literal union variants keep advertised and runtime contracts aligned.

## Accepted boundaries and consequences

- Codes are stable diagnostics, not localized prose and not HTTP status codes.
- The error envelope is safe to cross IPC/MCP only after schema validation; raw caught values never are.
- The log reference does not prove a log record exists and contains no learner-readable detail by itself.
- Actual logging, rotation, diagnostic export, and redaction implementation remain later work governed by the logging strategy.
- Recovery actions/retry timing are operation-specific and intentionally not guessed in this common error contract.

## Supersession

None.
