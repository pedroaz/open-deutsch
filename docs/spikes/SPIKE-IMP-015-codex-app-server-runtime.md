# SPIKE-IMP-015 — Codex App Server runtime and managed account lifecycle

- **Status:** complete
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-015, D-017, D-018, D-060, [ADR-0005](../adr/ADR-0005-codex-app-server-runtime.md)
- **Time/scope bound:** one disposable signed-out runtime journey plus one separately confirmed managed-login, restart, and logout journey

## Question and accepted constraints

Can Open Deutsch use an existing compatible `codex` executable over App Server STDIO for initialization and Codex-managed ChatGPT account state, including signed-out browser/device login events, restart restoration, and logout, without exposing credentials or adding an API-key authentication path?

The spike may use only a restrictive disposable data root and disposable `HOME`/`CODEX_HOME`. It must not read the normal Codex configuration, learner data, or ambient provider credentials. The authenticated half is outside deterministic gates and may run only after the user's explicit confirmation because it touches a real managed account.

## Candidate versions and environment

- Linux 6.17.0 x86_64
- Node.js 24.18.1 for the probe client
- Existing `codex-cli 0.146.0`
- Recorded compatible Codex range: `>=0.146.0 <0.146.1` (the exercised stable `0.146.0` release only)
- App Server JSONL over owned STDIO, following the documented `initialize`/`initialized` handshake and account methods
- Unique disposable data, home, and Codex-home directories for each run; ambient OpenAI, Codex, AWS, and Azure credential variables are removed before both version discovery and App Server launch

The protocol and managed-login candidates are based on the official [Codex App Server documentation](https://developers.openai.com/codex/app-server/), including its account and authentication section.

## Success and blocker criteria

- **Success:** a compatible existing CLI initializes twice over STDIO; an isolated signed-out account can start and cancel browser and device-code login; logout and account notifications work; restart reads the expected state; a separately confirmed managed login restores across restart and then logs out; all children stop; no raw token or API-key input crosses the probe boundary.
- **Release blocker:** the compatible CLI cannot initialize, required managed-account methods/events are unavailable, isolated state is not restored, raw credential material is required or returned, cleanup leaks a process, or explicit managed-login confirmation cannot be obtained.

## Disposable proof

The signed-out probe creates a disposable harness, then places distinct `HOME` and `CODEX_HOME` directories inside that sandbox. The exact same scrubbed environment is used for `codex --version` and `codex app-server --stdio`. It initializes, reads an initially signed-out account, starts and cancels both documented managed ChatGPT login modes, observes completion/account notifications, calls logout, closes the server, restarts it, and verifies the isolated account remains signed out.

The client rejects unsupported login types and any extra login parameters before sending JSONL. It also recursively rejects credential-shaped response fields and persists only projected account status, auth mode, plan type, booleans, version, and clean exit codes. Timeout paths forcibly close locally owned children. A fake hung executable proves both version and initialization timeouts terminate their child.

The authenticated companion uses the same isolation and projection and is routed through the interactive confirmation wrapper. After approval, it performed device-code login, verified signed-in account state, closed/restarted and verified restoration, immediately logged out, verified signed-out state, and removed the disposable Codex home.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/app-server-probe.test.mjs
HOME="<poison-path>" CODEX_HOME="<poison-path>" OPENAI_API_KEY="<poison-sentinel>" CODEX_API_KEY="<poison-sentinel>" PATH="<Node-24.18.1-bin>:$PATH" node scripts/probe-app-server-runtime.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

The authenticated command is intentionally omitted from deterministic validation. After explicit confirmation, the public command is:

```text
PATH="<Node-24.18.1-bin>:$PATH" pnpm spike:app-server:authenticated
```

It warns about real managed-account use and requires an exact interactive `yes` before invoking the internal probe.

## Evidence and observations

- The focused deterministic suite passed 8/8 under Node.js 24.18.1, including compatible-range edges, version/init timeouts with PID cleanup, environment scrubbing, recursive credential rejection, managed-only login parameters, redacted account projection/state settling, and confirmation routing.
- The real signed-out journey passed with `codex-cli 0.146.0`. Both initializations returned a user agent; browser and device-code login starts returned their documented event shapes and were cancelled; logout notified; both owned servers exited with code zero; restart remained signed out.
- A poisoned normal `HOME`, `CODEX_HOME`, `OPENAI_API_KEY`, and `CODEX_API_KEY` did not affect the successful journey, and neither poisoned filesystem path was created.
- Ignored `test-results/app-server-spike/signed-out-runtime.json` contains only bounded redacted evidence. No URL, user code, email, token, or raw protocol object is retained.
- `rawTokensObserved=false` and `apiKeyPathExposed=false` in the signed-out evidence.
- After explicit confirmation, the managed device-code journey reported signed-in ChatGPT state, restored the same projected auth mode and plan type after closing and restarting App Server, logged out, observed the signed-out account update, and read final signed-out state. Both App Server children exited with code zero.
- The first explicitly confirmed attempt exposed an ordering race in the probe: `account/login/completed` arrived before the immediately following `account/read` reflected the signed-in state. The probe failed closed and removed its disposable Codex home. The corrected probe waits for `account/updated` and uses a bounded projected-state poll; its new regression test and the repeated real journey passed.
- Ignored `test-results/app-server-spike/authenticated-runtime.json` contains projected status/auth mode/plan type, booleans, version, and exit codes only. It records `rawTokensObserved=false` and `normalCodexHomeUsed=false`.

## Alternatives and negative results

- **Codex-managed browser/device-code login:** Accepted candidate. App Server owns credential persistence and refresh, so Open Deutsch does not implement OAuth or receive externally managed tokens.
- **API-key or externally supplied token login:** Rejected. The probe exposes no such input and rejects those protocol shapes.
- **Normal host `HOME`/`CODEX_HOME`:** Rejected. Even version discovery uses the disposable environment so no part of the proof consults normal Codex state.
- **Broader `0.146.x` range:** Rejected as unproven. Parser tests cannot establish protocol compatibility for an unexercised patch, so `0.146.1` and later fail closed until renewed real evidence supports an expanded interval.
- **Unbounded executable calls:** Rejected. Version, initialize, requests, and notifications have bounded timeouts, and failed initialization closes its locally owned child.
- **Device-code endpoint availability:** One signed-out device-start attempt encountered a transient network failure. Cleanup completed, and an immediate retry of the same isolated proof succeeded. This is an external availability condition, not evidence for weakening the runtime or isolation boundary.

## Decision or explicit blocker

[ADR-0005](../adr/ADR-0005-codex-app-server-runtime.md) accepts Codex App Server JSONL over owned STDIO with the exercised interval `codex-cli >=0.146.0 <0.146.1`, Codex-managed ChatGPT browser/device-code login only, projected account state, disposable isolation for probes, and no API-key or external-token input path. No IMP-015 release blocker remains.

## Cleanup verification

- **Processes stopped:** Both real signed-out App Server children and both authenticated-journey children exited with code zero; fake hung children were killed and their PIDs no longer existed.
- **Artifacts removed:** Each harness removed its disposable data root, `HOME`, `CODEX_HOME`, bootstrap pointer, and runtime files. Poisoned normal-home sentinel paths were never created.
- **Artifacts retained:** Reviewed probe/client/tests, the fake hung fixture, this report, and small replaceable ignored redacted JSON evidence only.
- **Private/account state:** No learner data or normal Codex configuration was used. The explicitly confirmed managed login used only a disposable Codex home, was immediately logged out, retained no credential or identity field, and the harness removed its local account state.

## Follow-up

Use the accepted process/account boundary for IMP-016 model, plan, and rate-limit capability validation. Production adapters and renderer-safe IPC remain owned by their later implementation items.
