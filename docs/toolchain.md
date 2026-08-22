# Toolchain baseline

Status: accepted implementation baseline  
Last verified: 2026-08-15

Open Deutsch pins Node.js 24.18.1 and pnpm 11.0.9. Node.js 24 is the current LTS line, and pnpm 11 is the stable pnpm line compatible with Node.js 24. The root `package.json`, `.node-version`, and `toolchain.json` are the machine-readable authority. The pnpm patch pin matches the locally verified executable and avoids relying on package-manager self-switching during bootstrap.

The supported Codex CLI range is `>=0.146.0 <0.146.1`, which currently admits only the exercised stable `0.146.0` release. IMP-015 verified that release with App Server STDIO initialization, isolated Codex-managed account lifecycle, restart restoration, logout, credential isolation, and no API-key input path. IMP-016 additionally verified the picker-visible model catalog, supported/default reasoning metadata, optional plan projection, and managed-account rate-limit read with explicit missing-field fallbacks. Every later Codex patch/minor requires renewed real protocol evidence before this interval expands.

Run `node scripts/check-toolchain.mjs` for local development. A missing or old Codex installation is a warning there because local non-AI behavior remains usable. Desktop AI and Codex integration installation must call `node scripts/check-toolchain.mjs --require-codex`; that mode fails with a clear install, upgrade, or missing-App-Server message.

Evidence:

- Node.js release status: <https://nodejs.org/en/about/previous-releases>
- pnpm installation and compatibility: <https://pnpm.io/installation>
- Codex App Server and STDIO transport: <https://developers.openai.com/codex/app-server>
- Local capability probe: `codex --version` and `codex app-server --help`
