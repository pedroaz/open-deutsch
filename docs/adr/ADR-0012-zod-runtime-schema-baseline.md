# ADR-0012 — Zod runtime schema baseline

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-022, D-025, packages/contracts

## Context

Open Deutsch needs one TypeScript-compatible runtime schema system across Electron IPC, MCP tools, AI structured outputs, persisted JSON metadata, and deterministic fixtures. Parallel type and validation definitions would drift, while permissive conversion could weaken external boundaries silently.

## Decision

Adopt exact `zod@4.4.3` in `@open-deutsch/contracts`. Shared schemas are the runtime authority and their TypeScript input/output types are inferred from the same declarations. Top-level object boundaries must be minted by the contracts-owned `strictBoundaryObject` capability; parsing and JSON Schema helpers reject unowned schemas at runtime. Nested objects are strict unless a documented external protocol explicitly permits extension keys.

Use Zod 4's first-party `z.toJSONSchema` through `toBoundaryJsonSchema`, targeting JSON Schema Draft 2020-12 and throwing for cycles or unrepresentable types. This keeps MCP and AI structured-output projections derived from the same authority without a second conversion dependency. Use the MCP SDK's Standard Schema support when registering these Zod schemas.

## Evidence

The contracts suite exercises all five boundary classes, strict unknown-key rejection, inferred TypeScript output, nested issue paths, Draft 2020-12 projection, and fail-closed conversion of an unrepresentable transform. The package builds without Node ambient globals and exports its compiled ESM/types entry point.

Zod 4.4.3 is stable, zero-dependency, TypeScript-first, and includes first-party JSON Schema conversion. The MCP TypeScript SDK 2 documentation accepts Standard Schema objects, explicitly including Zod 4, for tool input/output schemas.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" pnpm --filter @open-deutsch/contracts run build
PATH="<Node-24.18.1-bin>:$PATH" pnpm --filter @open-deutsch/contracts test
PATH="<Node-24.18.1-bin>:$PATH" make check
```

Expected result: the contracts build and focused tests pass under strict TypeScript, followed by the deterministic repository gate.

## Rejected alternatives

- **Valibot:** Viable Standard Schema and smaller modular bundles, but rejected here because the application has no demonstrated bundle-pressure constraint and Zod is already the MCP SDK's runtime schema graph with first-party JSON Schema conversion.
- **ArkType:** Viable Standard Schema, but its syntax/type system would add a second conceptual layer without a current product benefit.
- **Handwritten guards plus interfaces:** Rejected because runtime and compile-time definitions can drift and JSON Schema would require another authority.
- **`zod-to-json-schema`:** Rejected because Zod 4 provides stable first-party forward conversion; another converter is unnecessary.

## Accepted boundaries and consequences

- The exact version remains pinned until a deliberate dependency update reruns contract and protocol gates.
- `z.fromJSONSchema` is experimental and is not part of this baseline.
- JSON Schema conversion is one-way from owned Zod schemas; imported arbitrary JSON Schema is out of scope.
- Schema validation retains only bounded issue paths with redacted string-key markers and Zod diagnostic codes, not raw field names, dynamic keys, messages, or values. It does not localize user messages or define application error codes; IMP-024 owns that projection.
- Schema choice does not define domain entities. IMP-023 onward owns concrete contracts.

## Supersession

None.
