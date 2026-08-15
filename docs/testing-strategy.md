# Agent-oriented testing strategy

Status: accepted planning direction  
Last updated: 2026-08-15

## Objectives

The test system should let Codex or another coding agent verify most changes quickly from the terminal, interact with the real Electron renderer when needed, and reserve model/account-dependent checks for explicit smoke runs.

The default loop must be:

- deterministic;
- safe for the learner's real data;
- independent of a live OpenAI account;
- fast enough to run repeatedly;
- inspectable through concise failures plus traces/screenshots when UI automation fails.

## Testing layers

| Layer | Main tool | Expected speed | What it proves |
| --- | --- | --- | --- |
| Static validation | TypeScript, linting, schema/manifest checks | Seconds | Packages, contracts, plugin files, and curriculum metadata are structurally valid. |
| Unit tests | Vitest | Seconds | Domain rules, feedback modes, scheduling, selectors, and pure transformations. |
| Persistence integration | Vitest + real temporary SQLite | Seconds | Migrations, repositories, transactions, and recurring-mistake/SRS queries. |
| IPC and AI contracts | Vitest + fake process fixtures | Seconds | Renderer/main boundaries and App Server JSON-RPC handling without a live account. |
| MCP protocol tests | MCP SDK client spawning the STDIO server | Seconds | Tool discovery, schemas, reads/writes, errors, and persistence against a temporary dataset. |
| Renderer/component tests | Testing Library + Vitest where useful | Seconds | Focused interaction and accessibility without launching Electron. |
| Electron journeys | Playwright Test using Electron automation | Tens of seconds | Onboarding, writing, correction display, history, vocabulary, and restart behavior. |
| Deterministic plugin checks | Manifest/schema validators + mocked tool/skill fixtures | Seconds | Packaging, instructions, workflow contracts, and prompt-corpus expectations without a live account. |
| Live plugin verification | Installed local plugin + fixed prompt corpus, manually invoked | Minutes/variable | Supported installation, skill activation, tool choice, follow-ups, and one complete real Codex workflow. |
| Live functional verification | Real App Server and the learner's Codex account, manually invoked | Slow/variable | Authentication, model discovery, and one real structured correction. This is not an automated test gate. |

## Fast default commands

Expose stable Make targets so a learner or agent does not need to discover package commands. Each Make target delegates to an exact pnpm workspace script:

- `make test-fast` — static checks, unit tests, SQLite integration, contracts, and MCP protocol tests.
- `make test-e2e` — deterministic Electron Playwright journeys with fake AI/auth.
- `make test-plugin` — deterministic plugin manifest, schema, fixture, and prompt-corpus contract checks; no host account and no model usage.
- `make verify-plugin` — manually verify the installed plugin and one fixed live Codex workflow; warn and require confirmation because it consumes account usage.
- `make verify-live` — manually invoke one real App Server correction verification; warn and require confirmation because it consumes account usage.
- `make test` — exact convenience alias for `make test-fast`.
- `make doctor` — verify required binaries, compatible Codex installation/auth state, Playwright/Electron launch support, plugin development installation, and writable temporary paths.
- `make check` — formatting, linting, strict type checking, deterministic tests, plugin/curriculum validation, and other completion gates.

Target `make test-fast` at well under one minute, preferably under 20 seconds once the project is warm. Keep slow tests separately tagged and runnable by name or affected package.

## Safe test data

- Every test run creates a unique temporary data root and bootstrap pointer.
- Plugin installation tests also use a disposable isolated Codex configuration/home. If the supported CLI cannot isolate configuration, unattended tests remain read-only and real-host mutation moves behind confirmed `make verify-plugin`.
- Never infer or reuse the learner's configured data root in automated tests.
- Seed named scenarios such as `new-learner`, `writing-with-errors`, `recurring-dative`, and `vocabulary-due`.
- Use real SQLite for persistence tests rather than mocking repository behavior.
- Keep small, reviewed German correction fixtures for deterministic UI tests.
- Clean temporary data after success and preserve the failing fixture path when it helps diagnosis.

## Testing desktop-native AI without spending usage

Put a narrow App Server adapter behind a process interface. Most tests should launch a fake JSON-RPC process that can replay:

- account signed in/signed out events;
- model catalogs and supported efforts;
- streaming progress;
- valid structured corrections;
- malformed outputs, cancellation, rate limits, and process crashes.

Contract fixtures should be schema-checked so they cannot silently drift from the adapter's expected protocol.

Keep one separate live verification that:

1. Is started manually through `make verify-live` and never discovered by Vitest or Playwright test patterns.
2. Displays a clear usage warning before the real model turn.
3. Uses the existing Codex-managed personal account.
4. Reads the current model catalog, performs one short fixed German correction with an explicitly selected model/reasoning setting, validates the structured result, and runs harmless controlled canary attempts that prove the real runtime denies out-of-sandbox filesystem, disabled-tool, and network access.
5. Uses a disposable data root rather than the learner's normal dataset.
6. Prints a concise pass/fail report for correction and enforced isolation and does not become a CI or `test:all` dependency.

The purpose is to verify real integration functionality occasionally, not to measure every code change or model response.

## Electron interaction

Use Playwright Test's Electron automation for committed end-to-end journeys. It can launch Electron, access the main process, control renderer windows, and stub native dialogs. The current Playwright API labels Electron support experimental, so Milestone 0 must prove the chosen Electron/Playwright versions together.

Test seams should include:

- an explicit test-mode data-root override;
- deterministic native folder-dialog stubbing;
- fake App Server and plugin-status adapters;
- stable roles/labels, using test IDs only when semantic locators are insufficient;
- trace, screenshot, console, and main-process log capture on failure;
- an Xvfb-compatible command for headless Linux environments.

Playwright MCP may be added as an exploratory tool so an agent can inspect and manipulate a running app through CDP when useful. It should not replace committed Playwright tests: scripted assertions, fixtures, and artifacts are the reproducible acceptance gate.

## MCP server testing

Test the local server at three levels:

1. **Tool handler tests:** call domain handlers directly with temporary SQLite.
2. **STDIO protocol tests:** spawn the same built command used by the plugin, connect with an MCP SDK client, list tools, call them, and validate results/errors.
3. **Manual diagnostics:** use MCP Inspector when schemas, transport, or model-readable results need visual inspection.

Representative cases must include valid reads/writes, empty results, missing identifiers, invalid inputs, unavailable data roots, concurrent desktop access, and attempts to write unsupported fields.
They must also prove coordinated data-root generation changes: a running MCP process must never continue serving a stale dataset after the desktop switches roots.

## Plugin and skill evaluations

OpenAI's plugin testing guidance recommends testing each capability first, then the installed complete plugin. Maintain a versioned evaluation corpus containing:

- direct prompts that should activate each skill/tool;
- indirect paraphrases;
- follow-ups using earlier identifiers;
- write requests and confirmation-sensitive behavior;
- negative prompts that must not activate the plugin;
- unsupported/boundary requests;
- expected skill, tool, essential arguments, and required workflow steps.

Run MCP protocol tests on every relevant change. Run deterministic prompt-contract fixtures after changes to skill descriptions, tool names/descriptions/schemas, plugin manifests, or workflow instructions. Record results so regressions can be compared across versions. Run the real installed-host corpus only through `make verify-plugin`; it is functional verification, never an automated unit, end-to-end, CI, or `make test` dependency.

## Agent workflow

When implementation begins, add concise repository instructions—preferably in `AGENTS.md`—that tell an agent to:

1. Run the smallest targeted Make test while editing.
2. Run `make test-fast` before considering a change complete; `make test` is the exact alias.
3. Run the affected Playwright journey for renderer/main-process changes.
4. Run MCP protocol tests and relevant prompt evaluations for plugin/tool changes.
5. Run `make verify-live` or `make verify-plugin` only after explicit confirmation when real integration functionality needs verification; these consume account usage and are not automated tests.
6. Inspect Playwright traces, screenshots, and process logs before retrying a failure.
7. Never point automation at the learner's real data root.
8. Record durable implementation lessons and changed operating constraints in the repository's agent/lessons documents before handing off.

## Required breadth and quality cases

- Cover Dashboard, Practice, Writing, Vocabulary, History, Weekly plan, and Settings/Account in both English and German, with English verified as the default. Include grammar, reading, Codex listening/speaking, and optional diagnostics within Practice.
- Exercise all four learning areas. Speaking and listening journeys assert an exact structured handoff to Codex and return/result handling; they never emulate local audio.
- Cover conversational-partner and strict-corrector behavior, optional placement tests, weekly planning, writing correction/comparison, the selection-aware explanation helper, grammar/vocabulary/custom lessons, simple spaced repetition, and model/reasoning preferences.
- Add accessibility checks for keyboard operation, focus restoration, labels, reduced motion, and contrast, plus visual acceptance screenshots for the component gallery and principal light-mode screens.
- Exercise cancellation, retry, incompatible/missing Codex, model unavailability, rate limits, denied approvals, App Server crashes, schema failures, corrupted local records, unsafe data roots, and stale MCP generations.
- Verify logs are human-readable, correlated across processes, redacted, and bounded under repeated failures.
- Treat curriculum and researched source text as adversarial test inputs to prove they cannot widen sandbox, tool, approval, or output boundaries.

## What is not required initially

- Playwright MCP as a CI dependency.
- Live model calls from automated unit, integration, end-to-end, or CI test suites.
- Automated Voice UI testing.
- Public HTTPS/tunnel testing for a personal local STDIO plugin.
- Pixel-perfect screenshot testing for every state; representative visual acceptance coverage is required.
- A cloud CI service before local deterministic commands are stable.

## Official references

- [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Playwright Electron automation](https://playwright.dev/docs/api/class-electron)
