# ADR-0003 — Electron and Playwright Linux automation baseline

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-013, D-040, D-056, D-073, [SPIKE-IMP-013](../spikes/SPIKE-IMP-013-electron-playwright-linux.md)

## Context

Open Deutsch needs deterministic Linux desktop journeys that exercise the real Electron main and renderer processes without learner data or native-dialog interaction. Playwright labels its Electron API experimental, so the repository needs an exact proven dependency pair and a reproducible headless command before desktop implementation grows around it.

## Decision

Pin Electron 42.7.1 and `@playwright/test` 1.62.1. Launch Electron through Playwright's default `_electron.launch` resolution, run the desktop suite through `xvfb-run -a`, force the Electron Ozone backend to X11, and allocate every test a disposable Open Deutsch data/bootstrap environment.

Native operating-system dialogs are stubbed from the Electron main-process evaluation boundary. Production BrowserWindow security remains explicit and is asserted by the journey: context isolation and sandboxing are enabled, while Node integration is disabled.

## Evidence

The [IMP-013 spike](../spikes/SPIKE-IMP-013-electron-playwright-linux.md) launched a first window on Linux, controlled its renderer, replaced `dialog.showOpenDialog`, captured a screenshot and Playwright trace, and observed a clean Electron exit code of zero. The checked-in fixture also exposed an Electron/Playwright lifecycle constraint: an ESM main module must not top-level-await the Playwright-deferred `app.whenReady()` promise.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" make test-e2e
```

Expected result on Linux with Xvfb installed: one Electron compatibility journey passes, produces nonempty ignored screenshot/trace artifacts, and exits cleanly. The accepted evidence used Node.js 24.18.1 and pnpm 11.0.9.

## Rejected alternatives

- **Explicit Electron executable plus a manually injected Playwright loader:** Rejected because it duplicates Playwright's internal launch contract and is unnecessary when the pinned root Electron dependency is resolvable normally.
- **Headless Chromium in place of Electron:** Rejected because it cannot prove main-process evaluation, BrowserWindow preferences, preload isolation, native-dialog stubbing, or Electron shutdown.
- **Wayland for the unattended Linux gate:** Deferred because Xvfb provides the required deterministic display server and the current delivery gate is explicitly X11/Xvfb based.

## Accepted boundaries and consequences

- This establishes compatibility only for Electron 42.7.1 with Playwright 1.62.1 on the Linux/Xvfb path; dependency upgrades must rerun the spike journey and update or supersede this ADR.
- `_electron` remains an experimental Playwright API, so the focused compatibility journey stays in the deterministic test suite.
- The dialog replacement is test-only and occurs in the main process; it does not add a renderer-native capability.
- The spike proves launch, first-window control, security preferences, dialog stubbing, artifact capture, and clean close. It does not prove packaging, AppImage behavior, every desktop journey, or Wayland support.

## Supersession

None.
