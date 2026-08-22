# Open Deutsch desktop

The desktop workspace owns the Linux Electron application. Its TypeScript projects keep privileged main-process code, the narrow sandboxed preload, and browser-only React renderer separate.

## Local workflows

- `make dev` builds and watches main, preload, and renderer entrypoints, then reports ready only after the renderer bridge is usable.
- `make prd` builds production assets before launching the same owned background lifecycle.
- `make status` reports exact owned process state; `make kill` stops the complete owned process group.
- `pnpm --filter @open-deutsch/desktop test` runs component tests.
- `make test-e2e` builds and launches production Electron journeys under Xvfb.

The development-only component gallery is enabled by the test harness or `OPEN_DEUTSCH_DESKTOP_GALLERY=1` in test mode. It is not a production route.

## Boundaries

The renderer receives only validated, renderer-safe contracts. It never imports Electron, Node, persistence, filesystem, process, or Codex-client APIs. Full learner paths remain in Electron main; the folder flow sends only an opaque proposal ID, safe display basename, and bounded warnings to the renderer.

The selected folder contains readable local learning records and is not application-encrypted. AI actions separately disclose that selected text and minimized context are sent to OpenAI through installed Codex. The first-action acknowledgement is stored in the selected dataset, never renderer local storage.
