# Toolchain baseline

Status: current compatibility baseline
Last verified: 2026-08-24

Open Deutsch pins the host development runtime to Node.js 26.5.0 and pnpm 11.0.9. Node.js 26 remains in the Current release phase until its scheduled October 2026 LTS transition, so this is an explicit pre-LTS baseline rather than a general production recommendation. Electron 42.7.1 continues to embed Node.js 24.18.0; `@types/node` remains on the Node 24 API surface to prevent desktop code from compiling against host-only Node 26 APIs, and the Electron SQLite journey verifies database sharing across the two runtimes. The root `package.json`, `.node-version`, and `toolchain.json` are the machine-readable authority. The pnpm patch pin matches the locally verified executable and avoids relying on package-manager self-switching during bootstrap.

The supported Codex CLI range is `>=0.146.0 <0.146.1`, which currently admits only the exercised stable `0.146.0` release. Compatibility coverage verifies App Server STDIO initialization, isolated Codex-managed account lifecycle, restart restoration, logout, credential isolation, no API-key input path, the picker-visible model catalog, supported/default reasoning metadata, optional plan projection, and managed-account rate-limit reads with explicit missing-field fallbacks. Every later Codex patch or minor release requires renewed real protocol evidence before this interval expands.

Run `node scripts/check-toolchain.mjs` for local development. A missing or old Codex installation is a warning there because local non-AI behavior remains usable. Desktop AI and Codex integration installation must call `node scripts/check-toolchain.mjs --require-codex`; that mode fails with a clear install, upgrade, or missing-App-Server message.

Evidence:

- Node.js release status: <https://nodejs.org/en/about/previous-releases>
- pnpm installation and compatibility: <https://pnpm.io/installation>
- Codex App Server and STDIO transport: <https://developers.openai.com/codex/app-server>
- Local capability probe: `codex --version` and `codex app-server --help`
