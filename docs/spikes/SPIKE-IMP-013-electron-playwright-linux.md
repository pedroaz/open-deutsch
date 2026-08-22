# SPIKE-IMP-013 — Electron and Playwright on Linux

- **Status:** complete
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-013, D-040, D-056, D-073, [ADR-0003](../adr/ADR-0003-electron-playwright-baseline.md)
- **Time/scope bound:** one minimal secure window, one native-dialog seam, one screenshot and trace, and clean shutdown on the development Linux host

## Question and accepted constraints

Can the selected Electron release be launched and controlled by the selected Playwright release under Xvfb on Linux while preserving the desktop security boundary and using only disposable test data?

The experiment may not use learner data, a real account, renderer Node integration, a broad preload surface, or an actual operating-system dialog interaction.

## Candidate versions and environment

- Linux 6.17.0 x86_64 with `/usr/bin/xvfb-run` and `/usr/bin/Xvfb`
- Node.js 24.18.1 and pnpm 11.0.9
- Electron 42.7.1
- `@playwright/test` 1.62.1
- A unique restrictive harness directory under a trusted Linux temporary parent supplied the data root, bootstrap pointer, and Electron profile for each run.
- No live-account or model action was in scope.

## Success and blocker criteria

- **Success:** Playwright launches Electron, controls the first renderer window, verifies secure BrowserWindow preferences, stubs and exercises a folder dialog, writes nonempty screenshot/trace evidence, closes Electron with exit code zero, and removes the disposable data harness.
- **Release blocker:** the pinned pair cannot expose both Electron control channels under Xvfb, cannot replace the native dialog without widening renderer privilege, leaks learner state, or leaves an Electron process running.

## Disposable proof

The checked-in `tests/e2e/fixtures/electron-spike/` shell creates one hidden-until-ready BrowserWindow with context isolation and sandboxing enabled and Node integration disabled. Its preload exposes only a `chooseDirectory` method. The Playwright fixture creates per-test disposable data and bootstrap paths, gives Electron a profile inside that sandbox, replaces `dialog.showOpenDialog` through `ElectronApplication.evaluate`, exercises the renderer, records artifacts, and cleans the harness in a fixture `finally` block.

The main module registers `app.whenReady().then(createWindow)` without top-level-awaiting it. Playwright's loader intentionally delays that promise until its Node inspector and Chromium DevTools channels are connected; top-level-awaiting it prevents module evaluation from finishing and deadlocks launch.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" make test-e2e
```

The workspace-owned command expands to:

```text
xvfb-run -a pnpm --workspace-root exec playwright test --config playwright.electron-spike.config.mjs
```

## Evidence and observations

- The deterministic Make gate passed one of one Electron journeys in 737 ms on the recorded environment.
- Playwright controlled the first window, observed the expected title and heading, and completed the stubbed folder-selection interaction.
- Main-process evaluation reported `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
- Ignored output contained `electron-spike.png` (33,574 bytes) and `electron-spike-trace.zip` (89,858 bytes). Visual inspection showed the complete compatibility-spike card and the final “Folder selection stub completed.” status without clipping or overlap.
- `ElectronApplication.close()` completed and the captured child process reported exit code zero.

## Alternatives and negative results

- **Manually supplying `executablePath` and Playwright's private Electron loader:** The launch stalled and was rejected as an unsupported duplication of the default resolver/loader behavior.
- **Top-level `await app.whenReady()` in the ESM fixture:** The Node inspector connected but Chromium DevTools never became ready because Playwright defers readiness until after module evaluation. Replacing the top-level await with a registered continuation removed the circular wait.
- **Electron 43.4.0:** An early diagnostic used it while the fixture still contained the readiness deadlock, so that run was inconclusive rather than evidence of incompatibility. The accepted baseline remains the fully verified 42.7.1 pair.

## Decision or explicit blocker

[ADR-0003](../adr/ADR-0003-electron-playwright-baseline.md) accepts Electron 42.7.1 with `@playwright/test` 1.62.1 and the Xvfb/X11 command as the current Linux desktop automation baseline. No IMP-013 release blocker remains.

## Cleanup verification

- **Processes stopped:** Playwright observed Electron exit code zero; a post-run process check found no process using the disposable profile.
- **Artifacts removed:** The per-test harness removed its owned data root, bootstrap file, Electron profile, and sandbox directory after the run.
- **Artifacts retained:** Only the small reviewed fixture, automated journey, configuration, ADR, and spike report are tracked. Screenshot/trace output remains ignored under `test-results/` and is replaceable.
- **Private/account state:** No learner path, learner content, credential, Codex configuration, or account was read or mutated.

## Follow-up

Keep the compatibility journey in `make test-e2e`; rerun it before accepting Electron or Playwright upgrades. Production desktop journeys may reuse the disposable fixture and main-process dialog-stub pattern.
