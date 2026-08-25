# Desktop-specific instructions

The root instructions still apply. These rules cover Electron main, preload, and renderer work.

- Keep main, preload, and renderer as separate TypeScript projects. The renderer must remain browser-only and must not import Node or privileged package APIs.
- Create every `BrowserWindow` with context isolation and sandboxing enabled and Node integration disabled using explicit safe literals. Do not use Electron `remote` in any form.
- Expose the smallest possible typed preload surface. Runtime-validate every IPC request and response, use explicit channel ownership, and keep filesystem, process, SQLite, App Server, and plugin operations in the main process.
- Never expose learner paths or content through renderer logs, error strings, or live-journey output.
- Add or run a Playwright journey only when the user explicitly requests that user-visible behavior. Use the production app, real services, accessible UI actions, and selected learner data; warn without pausing for confirmation, and do not use mocks or fake adapters.
- Live journeys disable screenshots, traces, video, and DOM dumps. Inspect only bounded diagnostics and redacted application logs on failure.
- Follow `docs/agent/design-direction.md`; the product authority remains `docs/design-direction.md`.
