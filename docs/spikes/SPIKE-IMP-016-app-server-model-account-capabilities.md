# SPIKE-IMP-016 — App Server model and account capabilities

- **Status:** complete
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-016, D-036, D-060, [ADR-0005](../adr/ADR-0005-codex-app-server-runtime.md), [ADR-0006](../adr/ADR-0006-app-server-model-account-capabilities.md)
- **Time/scope bound:** one disposable signed-out catalog/read classification and one separately confirmed managed-account model/plan/rate-limit read followed by logout

## Question and accepted constraints

Does the accepted `codex-cli 0.146.0` App Server expose the runtime-visible model catalog, supported/default reasoning efforts, current account plan when present, and rate-limit reads needed by Open Deutsch, with explicit safe fallbacks for optional/missing fields?

The catalog is the runtime source of truth; the spike must not infer entitlement from plan labels or freeze dynamic model names. It may retain only projected catalog/capability fields and bounded rate-limit status. It must not retain email, raw account/protocol objects, reset-credit IDs/descriptions, tokens, login URLs/codes, or normal Codex configuration. A managed-account read requires separate explicit confirmation and must end with logout and disposable-state removal.

## Candidate versions and environment

- Linux 6.17.0 x86_64
- Node.js 24.18.1 probe client
- Exercised `codex-cli 0.146.0`, within the accepted `>=0.146.0 <0.146.1` interval
- App Server JSONL over owned STDIO using the IMP-015 environment/process boundary
- Unique disposable data, `HOME`, and `CODEX_HOME`; ambient provider credentials removed for version and App Server subprocesses
- Official [Codex App Server model and account contract](https://developers.openai.com/codex/app-server/)

## Success and blocker criteria

- **Success:** `model/list` returns a nonempty picker-visible catalog; real entries expose supported/default reasoning efforts; pagination is bounded; plan is projected when present; `account/rateLimits/read` succeeds for the confirmed managed account; legacy and multi-bucket limit shapes project safely; optional-field fallbacks are deterministic; all children close and the managed account is logged out.
- **Release blocker:** catalog/model IDs are unavailable or malformed, no model advertises usable effort metadata, rate-limit reads are absent for a signed-in managed account, required fields force entitlement guessing, raw/private fields cross the projection, or cleanup/logout fails.

## Disposable proof

The signed-out probe starts an isolated App Server, verifies the account is signed out, follows `model/list` cursors with a page cap, rejects hidden/malformed/duplicate models, and projects only model ID/display name, runtime-default flag, supported/default efforts, and input modalities. It classifies the signed-out rate-limit response without broadening authentication.

Deterministic fixtures cover two-page catalog aggregation, duplicate and inconsistent effort rejection, missing default/effort metadata, the documented missing-`inputModalities` fallback, multi-bucket/legacy rate-limit projection, and omission of opaque credit records. The authenticated companion is confirmation-gated. After explicit approval it performed device login, projected plan/catalog/rate limits, immediately logged out, verified signed-out state, and removed the disposable Codex home.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/app-server-probe.test.mjs
HOME="<poison-path>" CODEX_HOME="<poison-path>" OPENAI_API_KEY="<poison-sentinel>" CODEX_API_KEY="<poison-sentinel>" PATH="<Node-24.18.1-bin>:$PATH" node scripts/probe-app-server-capabilities.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

After separate explicit confirmation, the account read is invoked with:

```text
PATH="<Node-24.18.1-bin>:$PATH" pnpm spike:app-server:capabilities:authenticated
```

## Evidence and observations

- The deterministic App Server suite passes 11/11 under Node.js 24.18.1; the full gate passes 84 Node tests and 10 Vitest tests.
- The real isolated signed-out probe initialized successfully and returned five picker-visible models. Every observed model advertised a default effort included in a nonempty supported-effort list; one runtime default was identified; none required missing-reasoning fallback.
- Every observed model included text/image modalities. The projector independently covers the official backward-compatible fallback to `text` and `image` when that field is absent.
- The signed-out `account/rateLimits/read` returned an authentication-required protocol error, which the probe classified as `requiresManagedAccount`; it did not invent empty quota or entitlement state.
- Poisoned normal home/config and provider-key variables were not used, neither poisoned path was created, no credential-shaped response field was observed, and the owned App Server exited with code zero.
- Ignored `test-results/app-server-spike/capabilities-signed-out.json` contains projected dynamic capability evidence only. Exact dynamic names/limits are not promoted into product defaults or this durable report.
- After explicit confirmation, the managed-account probe returned plan information, seven picker-visible models, one unambiguous runtime default, and complete supported/default effort metadata for every observed model. The signed-in catalog differed in size from the signed-out catalog, reinforcing that runtime/account discovery—not a frozen list—is authoritative.
- `account/rateLimits/read` succeeded and returned the modern multi-bucket shape with two projected buckets, primary-window data, plan fields, and a reset-credit count. Opaque credit rows and exact personal usage values are not promoted into durable documentation.
- Logout produced projected signed-out state; the owned App Server exited with code zero; `rawTokensObserved=false`; and `normalCodexHomeUsed=false`.
- Ignored `test-results/app-server-spike/capabilities-authenticated.json` retains only the reviewed projection. A value-only scan found no email, token/secret, login code/ID/URL, API key, or URL.

## Alternatives and negative results

- **Hardcoded model/subscription matrix:** Rejected. Catalog availability and limits can change independently of the displayed plan; runtime discovery remains authoritative.
- **Include hidden models:** Rejected for the learner picker. The request uses `includeHidden: false`, and the projector fails closed if a hidden entry crosses that contract.
- **Guess missing default/effort metadata:** Rejected. Missing default remains `null`, missing supported efforts remains an empty list, exact effort choices are unavailable, and semantic execution later omits the unavailable override so App Server chooses its runtime behavior.
- **Guess a default model:** Rejected. If `isDefault` is absent, Automatic omits an explicit model rather than selecting the first catalog entry.
- **Missing input modalities:** Accept the documented backward-compatible `text` and `image` fallback.
- **Missing plan:** Display no plan label and do not infer entitlement.
- **Missing rate-limit buckets/read:** Represent status as unavailable, preserve the learner's work, and avoid reset-time/remaining-usage claims. A signed-in method failure remains a release blocker for this baseline rather than silently passing.
- **Persist reset-credit detail rows:** Rejected. Only the integer available count is projected; opaque IDs, titles, descriptions, and redemption operations are outside this spike/product status boundary.

## Decision or explicit blocker

[ADR-0006](../adr/ADR-0006-app-server-model-account-capabilities.md) accepts runtime `model/list` and managed-account plan/rate-limit reads as the source of truth, with strict catalog invariants, minimized projections, and explicit missing-field fallbacks. No IMP-016 release blocker remains.

## Cleanup verification

- **Processes stopped:** Both signed-out and explicitly confirmed authenticated capability App Servers exited with code zero; no owned process remained.
- **Artifacts removed:** The harness removed disposable data, home, Codex-home, bootstrap, and runtime files; poison sentinel paths were never created.
- **Artifacts retained:** Reviewed projections/probes/tests, this report, and small replaceable ignored redacted JSON evidence only.
- **Private/account state:** No learner data or normal Codex configuration was used. The explicitly confirmed managed account was read only for projected plan/catalog/rate-limit capability, immediately logged out, and its disposable local state was removed.

## Follow-up

Use these projections and fallbacks in the later contracts/adapter/settings items. Continue with IMP-017's fake/recorded bounded-execution policy proof; reserve account-consuming turn execution for the separately confirmed `make verify-live` workflow after it exists.
