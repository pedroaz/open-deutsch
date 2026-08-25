# Live user-journey verification

Status: current engineering guidance
Last updated: 2026-08-25

Open Deutsch uses tests only when the maintainer explicitly requests a concrete live user journey. Tests are agent-operated functional checks, not an automated regression suite or a completion gate.

## Static quality checks

`make check` runs only Prettier formatting checks, ESLint, and strict TypeScript project-reference checks. It performs no model calls, UI automation, synthetic workflow, fixture validation, or learner-data mutation.

## Live journeys

`make test` currently runs the requested custom-Practice journey. It:

- builds and launches the production Electron application;
- uses the selected real learner dataset and connected Codex account;
- drives only learner-visible UI with Playwright;
- uses the real App Server and model response without mocks, fake executables, seeded output, or direct database setup;
- warns that it may consume account usage and mutate learner data, then starts without an interactive prompt;
- creates, opens, verifies, and deletes one generated lesson through the application UI.

The journey temporarily selects Luna with exact medium reasoning through the production Settings UI, records the prior generation preference, and restores it before exit. It records prepared-activity and candidate-vocabulary counts before generation begins. A successful run restores both counts through the user-facing prepared-lesson deletion action. A failed run may retain the generated lesson rather than risk deleting an unrelated learner record.

The live runner requires Open Deutsch to be closed. It never kills a process automatically. Screenshots, traces, video, page dumps, learner content, prompts, and model output are excluded from test artifacts and diagnostics. Failures use bounded diagnostic codes.

## Adding tests

Do not add or run a journey merely because code changed, a pull request is being prepared, or broader coverage would be useful. Add a Playwright journey only when the user explicitly asks for that user-visible behavior to be tested. Each journey uses production boundaries, real services, visible UI actions, and an explicit cleanup path when it writes temporary learner records.

Unit tests, component tests, mocked integration tests, deterministic end-to-end suites, coverage thresholds, prompt corpora, artifact validators, and CI test matrices are intentionally outside the repository strategy.
