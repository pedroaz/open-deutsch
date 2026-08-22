# Validation spike reports

Status: active convention
Last updated: 2026-08-15

A spike answers one bounded uncertainty with a disposable proof. It is not production completion, a placeholder implementation, or permission to weaken an accepted boundary.

## Start and scope

- Name reports `SPIKE-IMP-NNN-short-kebab-title.md` so the owning checklist item is explicit.
- Define the question, time/scope bound, prerequisites, candidate versions, success criteria, failure/release-blocker criteria, and data/account safety before running commands.
- Use a unique temporary workspace/data/Codex home when isolation is required. Never use learner data, private research staging, real credentials in fixtures, or an account-consuming check unless the specific Make target has just received explicit user confirmation.
- Record exact tool/dependency versions and the environment that produced the result.

## Separate completion rule

A spike is complete only when all of these are true:

1. The disposable proof was run and the exact commands plus concise evidence are recorded.
2. Tested candidates and rejected alternatives are recorded honestly, including negative results.
3. The accepted boundary is captured in a linked ADR/product decision, or an explicit release blocker is recorded with the unmet criterion.
4. Throwaway processes and artifacts are cleaned, while only small reviewed fixtures that became durable tests remain tracked.
5. The cleanup is verified and the report says what was removed, retained, or intentionally preserved.

The implementation-plan spike checkbox is marked only after that rule is satisfied. Production UI, generalized adapters, and placeholder fallbacks are not required unless the item says so, and their absence must not be hidden as production success.

Copy `SPIKE-template.md` for each spike. Store large traces, packages, private paths, raw protocol dumps, and generated databases only in ignored/disposable locations; link a redacted summary rather than committing them.
