# Desktop boundaries

Follow root `AGENTS.md` and [the desktop UI skill](../../.agents/skills/open-deutsch-desktop-ui/SKILL.md).

- Keep main, preload, and renderer TypeScript projects separate. Renderer is browser-only; main owns filesystem, processes, SQLite, App Server, and plugins.
- Keep context isolation and sandboxing enabled and Node integration disabled. Never use Electron `remote`. Preload/IPC stays narrow, typed, and runtime-validated in both directions.
- Verify changed behavior using [the interactive Electron skill](../../.agents/skills/open-deutsch-electron-verification/SKILL.md), real services, and GPT-6 Luna for AI calls. No automated tests or saved journeys.
- Session screenshots/UI snapshots are allowed; learner content, paths, credentials, and raw protocols never enter application logs or diagnostic errors. Restore settings and clean up only the session's newly created records through the UI.
