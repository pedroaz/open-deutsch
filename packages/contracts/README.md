# Contracts

This package is the single owner of shared boundary schemas and their inferred TypeScript types.

## Runtime schema convention

- Define every IPC, MCP, AI structured-output, persisted JSON metadata, and test-fixture boundary once with the package's pinned Zod 4 export.
- Mint every top-level object boundary with `strictBoundaryObject`. The owned capability makes runtime parsing reject raw `z.object` schemas that would silently strip unknown keys while advertising a closed JSON Schema. Nested object schemas must also use `z.strictObject` unless a documented protocol explicitly permits extension keys.
- Parse untrusted values with `parseBoundary`/`safeParseBoundary`; never rely on a TypeScript assertion as validation.
- Derive TypeScript types with `z.input`, `z.output`, or `z.infer`; do not maintain parallel handwritten shapes.
- Use `toBoundaryJsonSchema` for MCP/AI JSON Schema. It targets Draft 2020-12 and fails on cycles or unrepresentable transforms instead of weakening them to `unknown`.
- Keep wire/persisted schemas JSON-compatible. Convert richer runtime values outside the boundary or with a separately tested codec whose wire schema remains explicit.
- `validationIssues` retains only bounded paths with redacted string-key markers plus diagnostic codes, never raw field names, dynamic keys, messages, or values. Project it into the shared application error model; do not expose raw validation objects across IPC or MCP.

## Common scalar convention

- Entity identifiers are opaque lowercase prefixed strings. Prefixes distinguish entity families at runtime; Zod brands distinguish them at compile time. Business code never infers dates, ownership, ordering, or other meaning from an identifier.
- `DataRootGeneration` is a positive safe integer and is not interchangeable with an entity identifier.
- `UtcInstant` is a canonical ISO 8601 UTC string with exactly millisecond precision; `CalendarDate` is a date-only ISO string; `DurationMilliseconds` is a non-negative safe integer.
- Production adapters own random/monotonic identifier generation and wall-clock reads. Deterministic tests use `tests/support/contract-factories.ts`, whose sequence and instant are explicit.

## Error boundary convention

- `OpenDeutschError` is a closed union of 14 stable categories. Each category fixes one English diagnostic code, localization key, and matching log-reference code in both runtime validation and generated JSON Schema.
- Error payloads carry no arbitrary details, causes, raw protocol data, learner text, paths, or model output. Diagnostic adapters log separately after redaction and return only the correlation-based reference.
- User messages come from the complete static EN/DE `safeErrorMessages` catalogs. Errors carry a message key, never caller-provided display text.
- Log references contain the stable code, correlation ID, canonical occurrence time, and optional run/session IDs. They are safe join keys, not log content.

## Desktop IPC boundary

The preload bridge accepts only the closed semantic request, response, and event unions exported from `ipc.ts`. It exposes readiness, selected-root status/choice, projected Codex integration/account/model/rate-limit state, and four bounded learning operations. Data-root choice returns only a display name and generation; the renderer never receives a filesystem capability. Codex projections exclude email, credentials, tokens, raw protocol objects, opaque credit payloads, and arbitrary App Server methods. Learning operations accept product inputs only—never caller-selected working directories, sandbox/network/tool/approval settings, shell commands, or generic prompts. Main and preload must parse both directions at runtime rather than relying on the `OpenDeutschDesktopBridge` TypeScript interface alone.

## MCP boundary

The initial `mcpToolContracts` catalog defines eight bounded local tools for focused learner, practice, and curriculum reads plus activity, attempt-feedback, listening-result, weekly-plan, and Voice-summary writes. Every call is tied to the selected data-root generation. Every write has an idempotency key and returns whether it replayed a prior result. Every result has a bounded model-readable summary and uses the shared safe error boundary on failure.

Weekly-plan replacement is the only destructive initial tool. It requires an exact preview identifier and explicit confirmation; the other writes are additive. No delete, arbitrary database, filesystem, generic prompt, audio, transcript, network, or shell tool is exposed. MCP handlers must use the catalog schemas directly and must not weaken its annotations or confirmation policy.

## App Server adapter boundary

The App Server contract exposes semantic lifecycle, managed-account, model, rate-limit, workload, cancellation, and shutdown commands only. It does not expose JSON-RPC methods, thread/turn IDs, credentials, generic prompts, or protocol objects. Runtime discovery accepts only the exercised stable Codex version, and account login accepts only Codex-managed browser or device-code flows.

Callers select one of four product workloads and resolved model/effort choices. They cannot provide a working directory, sandbox, network, tool, approval, timeout, instruction, or output-schema policy. `appServerWorkloadPolicies` fixes those values per workload: an owned disposable workspace, ephemeral thread, workspace-only explicit reads/writes, no network/shell/web/MCP/dynamic tools, no approvals or interactive input, one absolute deadline, and one workload-specific structured-output schema. Production adapter construction must additionally use the owned in-memory sandbox capability; these serializable contracts do not replace that ownership proof.

`OpenDeutschAppServerAdapter` is parameterized by the four validated product-output types. Its `runOperation` result correlates workload, schema identifier, and typed validated output while omitting App Server thread/turn IDs and raw protocol messages. The implementation must bind each fixed schema identifier to its owned runtime validator before starting a turn; the generic type is not permission for callers to supply schemas or accept unvalidated JSON.
