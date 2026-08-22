# ADR-0006 — App Server model and account capability discovery

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-016, D-036, D-060, [ADR-0005](ADR-0005-codex-app-server-runtime.md), [SPIKE-IMP-016](../spikes/SPIKE-IMP-016-app-server-model-account-capabilities.md)

## Context

Open Deutsch needs model and reasoning choices that reflect the learner's current Codex runtime/account rather than a hardcoded subscription matrix. It also needs optional plan and rate-limit status for useful settings/errors without leaking raw account objects, freezing dynamic catalogs, or inventing entitlement from a plan label. The App Server response contains more detail than product layers need, so catalog invariants, projection, pagination, and missing-field behavior require a durable decision.

## Decision

For the exercised `codex-cli >=0.146.0 <0.146.1` interval, use App Server `model/list` with `includeHidden: false` as the sole source of picker-visible model IDs and reasoning capabilities. Follow cursors with a bounded page count. Project only model ID, display name, `isDefault`, `defaultReasoningEffort`, supported effort names, and input modalities.

Fail closed on malformed entries, duplicate IDs/efforts, hidden entries in a visible-only response, more than one runtime default, or an advertised default effort that conflicts with a nonempty supported list. Never choose the first model/default when runtime metadata is absent or ambiguous.

Read managed ChatGPT account state for optional plan type and call `account/rateLimits/read` for status. Prefer `rateLimitsByLimitId` when supplied and fall back to the legacy `rateLimits` bucket. Project only bucket ID, optional plan type, primary/secondary used-percent/window/reset fields, reached classification, and the integer available reset-credit count. Do not project credit IDs, titles, descriptions, raw account objects, or entitlement claims.

## Evidence

[SPIKE-IMP-016](../spikes/SPIKE-IMP-016-app-server-model-account-capabilities.md) records real isolated signed-out and explicitly confirmed managed-account probes against `codex-cli 0.146.0`. The signed-out probe returned a nonempty catalog with complete effort metadata and classified rate limits as requiring a managed account. The signed-in probe returned a larger dynamic visible catalog, exactly one runtime default, complete supported/default effort metadata, plan information, and a successful modern multi-bucket rate-limit read. It immediately logged out, read signed-out state, closed cleanly, and removed disposable account state.

Retained ignored evidence contains only reviewed projections. No raw token, email, login URL/code/ID, API key, reset-credit detail row, normal Codex-home state, or learner data was retained. Deterministic tests cover pagination, official input-modality fallback, missing reasoning/default metadata, duplicate/inconsistent catalog rejection, ambiguous runtime defaults, multi-bucket projection, legacy/unavailable fallback, and credit-detail omission.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/app-server-probe.test.mjs
HOME="<poison-path>" CODEX_HOME="<poison-path>" OPENAI_API_KEY="<poison-sentinel>" CODEX_API_KEY="<poison-sentinel>" PATH="<Node-24.18.1-bin>:$PATH" node scripts/probe-app-server-capabilities.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

The explicitly confirmed account proof additionally used `pnpm spike:app-server:capabilities:authenticated`, completed device authorization, read only projected capability state, and passed after logout/cleanup. It remains outside deterministic gates and must never run automatically.

Under Node.js 24.18.1, the focused App Server suite passed 11/11. Both real capability probes emitted their PASS markers and exited their owned App Server with code zero.

## Rejected alternatives

- **Hardcode model names or infer them from plan type:** Rejected. The signed-in and signed-out catalogs differed, and runtime availability can change independently of subscription labels.
- **Include hidden models in the learner picker:** Rejected. Open Deutsch requests only picker-visible models and fails closed if that contract is violated.
- **Select the first model/default on missing or conflicting metadata:** Rejected. Automatic omits an explicit model; ambiguous defaults are invalid.
- **Invent missing reasoning choices:** Rejected. Missing default remains `null`, missing supported efforts remains empty, exact choices are unavailable, and later execution omits an unavailable override.
- **Expose raw rate-limit/account responses:** Rejected. Credit records and account identity are unnecessary for learner status and expand the privacy boundary.
- **Treat signed-out rate-limit errors as empty quota:** Rejected. Signed-out status is classified as requiring a managed account; signed-in method failure is an integration error, not zero usage.

## Accepted boundaries and consequences

- The model catalog is dynamic and account/runtime-specific. No observed model ID, plan label, effort set, or bucket count becomes a permanent entitlement promise.
- Zero runtime defaults is valid and maps to Automatic with no explicit model. More than one default is invalid.
- Missing `inputModalities` maps to `text` and `image` as documented for backward compatibility.
- Missing plan type is displayed as unavailable and never drives entitlement.
- Missing effort metadata disables exact selection; semantic defaults omit unavailable overrides and let the runtime decide rather than silently naming another model/effort.
- Missing rate-limit buckets map to unavailable status; the app must not invent remaining usage or reset timing. Usage-limit errors preserve learner work and offer retry when real reset information exists.
- Saved unavailable preferences remain stored, temporarily fall back to runtime Automatic with a visible notice, and are revalidated after sign-in/runtime/catalog changes.
- This ADR does not define production contracts, preference persistence/UI, rate-limit localization, or turn policy. Those remain with later owning items.
- Real account reads remain explicit, interactive, isolated, immediately logged out, and outside ordinary tests/CI.

## Supersession

None.
