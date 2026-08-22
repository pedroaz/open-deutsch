# Desktop-specific instructions

The root instructions still apply. These rules cover Electron main, preload, and renderer work.

- Keep main, preload, and renderer as separate TypeScript projects. The renderer must remain browser-only and must not import Node or privileged package APIs.
- Create every `BrowserWindow` with context isolation and sandboxing enabled and Node integration disabled using explicit safe literals. Do not use Electron `remote` in any form.
- Expose the smallest possible typed preload surface. Runtime-validate every IPC request and response, use explicit channel ownership, and keep filesystem, process, SQLite, App Server, and plugin operations in the main process.
- Never expose learner paths or content through renderer logs, error strings, screenshots, or test artifacts. UI tests use a unique disposable data root and fake account/AI adapters.
- For affected UI behavior, run the focused component or journey test, then `make test-e2e` when available. Inspect Playwright traces, screenshots, renderer console, and main-process logs on failure.
- Visually verify meaningful states in the development gallery and affected screen at standard and narrow widths, in English and German. Check keyboard operation, visible focus, accessible names, reduced motion, overflow, and input preservation.
- Follow `docs/agent/design-direction.md`; the product authority remains `docs/design-direction.md`.
