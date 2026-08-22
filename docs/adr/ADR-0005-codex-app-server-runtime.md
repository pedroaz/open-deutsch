# ADR-0005 — Codex App Server runtime and managed authentication baseline

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-015, D-017, D-018, D-060, [SPIKE-IMP-015](../spikes/SPIKE-IMP-015-codex-app-server-runtime.md)

## Context

Open Deutsch needs bounded desktop-native AI actions while preserving the accepted requirement to reuse an existing Codex installation and Codex-managed personal authentication. A durable baseline is required for executable compatibility, local transport, account lifecycle ownership, isolation, and the boundary that prevents API keys or raw authentication material from entering the application or renderer.

## Decision

Use an existing stable `codex-cli` in the range `>=0.146.0 <0.146.1`, which admits only the exercised `0.146.0` release, and own one App Server child over JSONL STDIO. Initialize with the documented `initialize` request and `initialized` notification. Codex owns ChatGPT credentials and their persistence; Open Deutsch may start only the managed `chatgpt` browser or `chatgptDeviceCode` flows, read projected account state, observe account events, and request logout.

Open Deutsch does not expose API-key, external-token, Bedrock, or other authentication inputs. It rejects unsupported login shapes before sending them and rejects credential-shaped protocol fields rather than forwarding or persisting them. Application-facing account state contains only signed-in/signed-out/unsupported status, managed auth mode, and plan type when present.

Discovery and App Server launch must share a scrubbed environment. Isolation-sensitive probes replace both `HOME` and `CODEX_HOME`, remove ambient OpenAI, Codex, AWS, and Azure credential variables, use disposable Open Deutsch data, bound subprocess/request/event waits, and close owned children on initialization or workflow failure.

## Evidence

[SPIKE-IMP-015](../spikes/SPIKE-IMP-015-codex-app-server-runtime.md) records a real `codex-cli 0.146.0` signed-out journey and an explicitly confirmed managed ChatGPT journey. Both initialized App Server twice. Browser and device-code event shapes were observed; signed-in account state survived an App Server restart; logout produced final signed-out state; all children exited cleanly; poisoned normal home/config and credential variables were not used; and retained evidence contains no email, user code, URL, raw token, or protocol object.

The deterministic suite checks range edges and prerelease rejection, bounded version/initialization failure with child cleanup, environment scrubbing, recursive credential-field rejection, managed-only login parameters, redacted account projection, login-state settling, and confirmation routing. The first live attempt revealed an event/read race and failed closed; a bounded state-settling regression and the repeated real journey then passed.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/app-server-probe.test.mjs
HOME="<poison-path>" CODEX_HOME="<poison-path>" OPENAI_API_KEY="<poison-sentinel>" CODEX_API_KEY="<poison-sentinel>" PATH="<Node-24.18.1-bin>:$PATH" node scripts/probe-app-server-runtime.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

The explicitly confirmed account proof additionally used `pnpm spike:app-server:authenticated`, supplied the exact interactive confirmation, completed device authorization, and passed. It is not part of deterministic gates and must never be invoked automatically.

Under Node.js 24.18.1, the focused suite passed 8/8 and the real signed-out/authenticated probes emitted their respective PASS markers with clean owned-process exits.

## Rejected alternatives

- **Bundle Codex or accept any CLI version:** Rejected. Open Deutsch requires an existing compatible executable, and unverified protocol revisions fail closed until their range is deliberately expanded.
- **API-key or externally managed token login:** Rejected. It creates a parallel credential/billing path and would expose secrets to an application that does not need to own them.
- **Use normal `HOME` or `CODEX_HOME` for unattended proof:** Rejected. It risks reading or mutating real account/configuration state and invalidates isolation evidence.
- **Forward raw App Server account/protocol objects:** Rejected. The renderer and general application layers need only narrow projected state.
- **Assume login completion makes account reads immediately consistent:** Rejected after the first live attempt exposed the event/read race. The client waits for the managed account update and bounded projected-state convergence.

## Accepted boundaries and consequences

- The accepted compatibility range is `>=0.146.0 <0.146.1`; every later patch/minor requires renewed real protocol evidence and a superseding compatibility decision before support expands.
- App Server is an owned local STDIO child, not a network listener, and every failure path must retain cleanup ownership.
- Only Codex-managed ChatGPT browser/device-code authentication is supported. There is no API-key fallback or application-managed OAuth/token refresh.
- Raw credentials, email, login URLs/codes, and unrestricted protocol objects do not cross the adapter boundary or enter retained evidence.
- Local non-AI behavior remains available when Codex is missing or unsupported; desktop AI and integration features fail with an actionable compatibility error.
- This ADR does not yet accept model catalog, reasoning-effort, plan/rate-limit fallback semantics, turn sandbox enforcement, or production adapter/IPC details. Those belong to IMP-016, IMP-017, and later owning items.
- Real-account checks remain explicit, interactive, disposable, and outside ordinary tests, CI, `make check`, and `make test-all`.

## Supersession

None.
