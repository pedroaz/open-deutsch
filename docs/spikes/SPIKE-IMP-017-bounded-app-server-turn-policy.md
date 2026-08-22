# SPIKE-IMP-017 — Bounded App Server turn policy

- **Status:** complete
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-017, D-036, [ADR-0005](../adr/ADR-0005-codex-app-server-runtime.md), [ADR-0007](../adr/ADR-0007-bounded-app-server-turn-policy.md)
- **Time/scope bound:** deterministic fake/recorded App Server requests only; no account login, model turn, or learner data

## Question and accepted constraints

Can Open Deutsch construct and monitor a correction turn so untrusted learner text cannot broaden its temporary working directory, filesystem, network, shell, MCP, approval, or interaction policy, while cancellation and deadlines remain bounded?

The proof must use an owned disposable root and a fake/recorded protocol boundary. It must not consume account usage or present fake transport behavior as evidence of real App Server sandbox enforcement or model resistance to prompt injection. The real correction remains reserved for `make verify-live` after that confirmation-gated command exists.

## Candidate versions and environment

- Linux x86_64
- Node.js 24.18.1 deterministic client tests
- Request shapes aligned to the accepted `codex-cli 0.146.0` App Server baseline
- Fixed system temporary-parent selection independent of inherited `TMPDIR`, `TEMP`, and `TMP`
- Official [App Server](https://developers.openai.com/codex/app-server/), [configuration](https://developers.openai.com/codex/config-reference/), [sandboxing](https://developers.openai.com/codex/sandbox/), and [permissions](https://developers.openai.com/codex/permissions/) contracts

## Success and blocker criteria

- **Success:** only an owned marked temporary workspace can mint a policy; requests disable shell, web, network, MCP, and approvals; learner text remains JSON data under fixed instructions; forbidden activity interrupts and rejects; cancellation and one absolute deadline cover startup, notifications, interruption, and close; all owned files are removed.
- **Release blocker:** a broad/caller-forged/learner root is accepted, learner text can mutate request policy, a forbidden tool or approval can proceed, a startup or interrupt RPC can hang beyond the deadline, cleanup can target an unowned path, or deterministic tests require account use.

## Disposable proof

`createBoundedTurnSandbox` selects `/tmp` or `/var/tmp` only after excluding unsafe configured roots, creates a unique private sandbox/workspace and ownership marker, and mints a frozen policy in a module-private capability set. Request builders accept only that exact capability. Cleanup validates the marker, parent, and prefix, invalidates the policy, and removes only the exact owned root.

The recorded transport captures `thread/start`, `turn/start`, and `turn/interrupt`. The thread is ephemeral and carries fixed instructions plus `web_search = disabled`, `shell_tool = false`, an empty MCP map, and `approvalPolicy = never`. The turn repeats the no-approval boundary, supplies a restricted workspace-write sandbox with no network, requires a structured schema, and serializes the adversarial learner text into a single JSON value.

The client rejects every recorded execution/tool/approval/input category in scope and interrupts the turn. One absolute deadline races every RPC and notification read. Hung `thread/start`, hung `turn/start`, and hung `turn/interrupt` fixtures prove bounded rejection and transport close.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" node --test --test-global-setup=./tests/support/node-disposable-data.mjs tests/bounded-app-server-turn.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" pnpm exec eslint scripts/lib/bounded-app-server-turn.mjs tests/bounded-app-server-turn.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Evidence and observations

- The focused pinned suite passes 20/20.
- A payload containing forged `cwd`, approval, network, shell, web, and MCP instructions remains byte-for-byte learner data after JSON decoding; policy fields remain fixed.
- Recorded command, web, MCP, approval, user-input, command-output, and hook events each produce a policy violation and exactly one interrupt request.
- Cancellation interrupts an active turn. Hung startup and interruption requests terminate through the absolute deadline and close the transport.
- Field-consistent policies naming `/` or the disposable learner-data root are rejected because they were not minted by the owned factory. A cloned policy that enables network is rejected for the same reason.
- No Codex process, account login, model request, normal Codex home, or learner artifact was used.

## Alternatives and negative results

- **Public root-to-policy constructor:** Rejected after adversarial review showed it could legitimately mint `/` as both sandbox and workspace.
- **Field-only policy validation:** Rejected because matching arrays do not establish ownership or safe containment.
- **Timeout only on notification reads:** Rejected after a fake transport proved `thread/start`, `turn/start`, or `turn/interrupt` could otherwise remain pending indefinitely.
- **Prompt-only tool denial:** Rejected in favor of request configuration plus fail-closed event monitoring.
- **Live turn during this spike:** Rejected by scope. It would consume account usage and requires explicit confirmation through the later live-verification command.

## Decision or explicit blocker

[ADR-0007](../adr/ADR-0007-bounded-app-server-turn-policy.md) accepts the owned-capability policy, fixed no-tool request, fail-closed monitor, and absolute RPC deadline as the deterministic desktop turn boundary. No IMP-017 deterministic blocker remains. Real-runtime and semantic prompt-injection evidence is intentionally deferred to the confirmation-gated live workflow.

## Cleanup verification

- **Processes stopped:** The proof creates no subprocess. Fake transports are closed on bounded startup/interrupt failure.
- **Artifacts removed:** The ownership-checked test sandbox and workspace are removed by the suite hook.
- **Artifacts retained:** Only source, deterministic tests, this report, and the ADR.
- **Private/account state:** No account, credential, normal Codex configuration, learner root, or learner text was accessed.

## Follow-up

Use this policy in the later App Server adapter and IPC path. Add the real correction, sandbox-observation canaries, and learner-text injection probe only to the explicit `make verify-live` workflow after its owning item creates that target.
