# SPIKE-IMP-NNN — Short validation title

- **Status:** planned
- **Date:** YYYY-MM-DD
- **Owner:** repository maintainers
- **Related:** IMP-NNN, D-NNN, ADR-NNNN
- **Time/scope bound:** concrete bound

## Question and accepted constraints

State the single uncertainty and the product/security boundaries the experiment may not relax.

## Candidate versions and environment

Record OS/runtime/tool/dependency versions, isolation root, and whether any explicitly confirmed live-account action is in scope.

## Success and blocker criteria

- **Success:** observable result required to accept a path.
- **Release blocker:** observable failure or missing supported capability that blocks dependent work.

## Disposable proof

Describe the smallest experiment, fixtures, and safety controls. Distinguish throwaway code from any reviewed fixture proposed for reuse.

## Validation commands

```text
exact reproducible command
```

## Evidence and observations

Record concise results, artifact basenames/ignored locations, and redacted failure details. Do not paste credentials, learner content, private paths, or unbounded logs.

## Alternatives and negative results

- **Candidate:** result and why it was accepted, rejected, or deferred.

## Decision or explicit blocker

Link the accepted ADR/product decision and state the boundary it establishes, or write `BLOCKED` with the exact unmet criterion and dependent items.

## Cleanup verification

- **Processes stopped:** command/evidence
- **Artifacts removed:** exact disposable targets
- **Artifacts retained:** small reviewed fixtures/report only, with reason
- **Private/account state:** confirmation that no learner data or unauthorized host mutation was used

## Follow-up

List only work implied by the decision/blocker. Do not turn the spike report into a chronological progress log.
