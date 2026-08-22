# ADR-0007 — Bounded App Server turn policy

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-017, D-036, [ADR-0005](ADR-0005-codex-app-server-runtime.md), [SPIKE-IMP-017](../spikes/SPIKE-IMP-017-bounded-app-server-turn-policy.md)

## Context

Open Deutsch sends untrusted learner writing to Codex App Server but does not need tools, project files, network access, approvals, or interactive questions to return a structured correction. A desktop request must therefore carry a narrowly constructed policy that learner text cannot modify, and the client must fail closed if the server attempts a capability outside that policy. Cancellation and deadlines must also cover startup, active-turn interruption, and transport shutdown so a hung RPC cannot keep an owned process alive indefinitely.

## Decision

Create each bounded turn inside an owned, marked temporary sandbox selected independently of inherited temp-directory variables. Mint its policy as an in-memory capability that callers cannot reproduce with matching object fields. The only writable and explicit readable root is a private workspace below that sandbox; the filesystem root, learner-data roots, sibling roots, and caller-built policy objects are invalid. Cleanup verifies the ownership marker and invalidates the capability before removing only that exact sandbox.

Start an ephemeral thread with approvals set to `never`, shell disabled, web search disabled, no configured MCP servers, and fixed base/developer instructions. Start its turn with network disabled, restricted read access, one writable workspace root, a required structured-output schema, and learner text serialized only as a JSON data field. Never merge learner-provided objects into request policy.

Treat command execution, file changes, web search, image view, MCP/dynamic/collaboration tools, hooks, diffs, approvals, and user-input requests as policy violations. Interrupt the active turn and reject rather than approving or continuing. Apply one absolute deadline to `thread/start`, `turn/start`, notification reads, `turn/interrupt`, and interrupted completion; close the transport on startup or interrupt failure.

## Evidence

[SPIKE-IMP-017](../spikes/SPIKE-IMP-017-bounded-app-server-turn-policy.md) records a fake/recorded boundary under `codex-cli 0.146.0` protocol assumptions. Deterministic tests prove the fixed thread/turn request, JSON learner-data boundary, owned policy capability, restricted roots, disabled network/shell/web/MCP/approvals, fail-closed event handling, cancellation, absolute deadlines, and cleanup for hung startup and interruption requests.

The proof does not execute an account-consuming correction and does not claim that a model ignored the adversarial learner text. Real runtime enforcement and prompt-injection behavior remain reserved for the explicitly confirmed `make verify-live` workflow after that target exists.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" node --test --test-global-setup=./tests/support/node-disposable-data.mjs tests/bounded-app-server-turn.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" pnpm exec eslint scripts/lib/bounded-app-server-turn.mjs tests/bounded-app-server-turn.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Rejected alternatives

- **Accept caller-provided roots after structural validation:** Rejected. A structurally consistent policy can still name `/`, a learner-data root, or another broad location.
- **Rely only on prompt instructions:** Rejected. Tool, filesystem, network, approval, and event restrictions must be machine-enforced request and client invariants.
- **Place learner text directly in instructions or merge parsed learner data into requests:** Rejected. The text remains an explicitly serialized untrusted data field beneath fixed instructions.
- **Wait indefinitely for startup or interruption:** Rejected. Cancellation that cannot bound every owned RPC is not a reliable desktop boundary.
- **Claim the recorded transport proves real model or sandbox behavior:** Rejected. That requires a separately confirmed live correction against the accepted runtime.

## Accepted boundaries and consequences

- The policy capability is process-local and valid only until its owned sandbox is cleaned up.
- Platform-default read access remains enabled because App Server/runtime dependencies may need it; explicit readable roots remain limited to the private workspace.
- An empty isolated Codex configuration plus disabled shell/web settings prevents intended tool exposure. The client additionally rejects observed forbidden activity; it does not silently recover from it.
- A policy violation, malformed response, timeout, cancellation, failed interrupt, or ambiguous cleanup is an error. No interactive approval fallback exists.
- The fake transport proves construction and client reactions, not server enforcement or semantic model obedience.
- Production adapter wiring, user-visible error mapping, retry behavior, and the confirmation-gated live correction belong to later implementation items.

## Supersession

None.
