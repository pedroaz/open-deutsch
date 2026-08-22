# Decision log

This file records product and architecture decisions. Items marked **Proposed** still require confirmation.

## D-001 — Product is local-first

- Status: Accepted
- Date: 2026-08-15
- Decision: Store learner data and application state locally. Do not create an Open Deutsch cloud backend in the first version.
- Clarification: Ordinary OpenAI/Codex model and Voice traffic is allowed. "Local-first" does not mean offline AI.

## D-002 — Reuse Codex Voice

- Status: Accepted
- Date: 2026-08-15
- Decision: Speaking practice uses Voice in the Codex desktop experience. Do not rebuild live voice in the companion app.
- Reason: Voice already provides natural turn-taking and can coordinate Codex work.

## D-003 — One canonical local learning store

- Status: Accepted
- Date: 2026-08-15
- Decision: The desktop app and Codex plugin access the same learner profile, exercise history, feedback, and progress through a local learning service.
- Reason: Avoid duplicate or conflicting state across application surfaces.

## D-004 — Start with skill plus local MCP

- Status: Accepted
- Date: 2026-08-15
- Decision: Prototype the Codex integration as a personal teaching skill plus a local STDIO MCP server. Add MCP Apps UI only after a text/tool workflow proves insufficient.
- Reason: This is the smallest extension shape that supports reusable teaching behavior and durable local state.

## D-005 — Defer deep Codex embedding

- Status: Superseded by D-017 and D-018
- Date: 2026-08-15
- Decision: Do not require Codex App Server for the MVP. Re-evaluate it if the companion app needs an embedded text-agent experience.
- Reason: It adds complexity without replacing the existing Voice surface.
- Superseded because: The later **Correct now** requirement established a concrete need for bounded desktop-native Codex actions and managed Codex authentication. General chat and Voice remain outside the app.

## D-006 — Implementation stack remains open

- Status: Superseded by D-040
- Date: 2026-08-15
- Decision: Compare Electron and other cross-platform shells only after the primary workflows and surface boundaries are agreed. Do not assume Next.js is required for a local desktop renderer.

## D-007 — Single-user-first and cloneable

- Status: Accepted
- Date: 2026-08-15
- Decision: Optimize the first version for one learner without accounts or multi-user administration. Keep setup and configuration portable enough that another person can clone the repository and create their own local learner profile.

## D-008 — Initial CEFR range

- Status: Accepted
- Date: 2026-08-15
- Decision: Personalize the initial experience for an A2 learner progressing toward B1, while designing lesson and exercise content to cover A1 through B2.

## D-009 — Codex-first, bidirectional navigation

- Status: Accepted
- Date: 2026-08-15
- Decision: Treat Codex as the usual starting point, then hand structured exercises to the desktop app. Also allow the desktop app to initiate or recommend activities that continue in Codex.

## D-010 — Everyday life in Germany is the primary outcome

- Status: Accepted
- Date: 2026-08-15
- Decision: Prioritize language and situations needed for everyday life in Germany rather than optimizing the first version around an exam or workplace curriculum.

## D-011 — Multiple AI teaching profiles

- Status: Accepted
- Date: 2026-08-15
- Decision: Support two initial teaching profiles: **Conversation Partner** and **Strict Corrector**.
- Conversation Partner: German-first, minimally interruptive, encouraging, and summarizes corrections after the activity.
- Strict Corrector: identifies every meaningful error, gives precise explanations with English support when useful, and creates targeted follow-up practice.

## D-012 — Deep vertical slice before four-skill breadth

- Status: Accepted
- Date: 2026-08-15
- Decision: Build a deep initial workflow around writing, grammar, vocabulary, and saved Voice feedback before implementing basic versions of every reading and listening feature.

## D-013 — Add a curriculum research workflow

- Status: Accepted
- Date: 2026-08-15
- Decision: Add a dedicated repo-scoped Codex skill for curriculum research and curation. Use a normal Codex task or Goal mode to run a specific research objective, and use local MCP tools to inspect curriculum gaps and learner needs.
- Reason: The reusable workflow and the particular research run have different lifecycles.

## D-014 — Separate canonical, personal, and staged content

- Status: Accepted
- Date: 2026-08-15
- Decision: Commit reusable reviewed curriculum to Git; keep learner-specific state and generated adaptations local; keep unreviewed research in a local staging area until explicitly promoted.
- Reason: A clone should receive useful teaching material without receiving private learner history or low-confidence drafts.

## D-015 — Human approval for canonical curriculum

- Status: Accepted
- Date: 2026-08-15
- Decision: Codex must obtain learner approval before promoting staged research into Git-tracked curriculum.

## D-016 — Build the systematic curriculum map first

- Status: Accepted
- Date: 2026-08-15
- Decision: Research mode should first establish a systematic A1–B2 curriculum map and gap tracker, then research and populate lessons against that structure.

## D-017 — Support bounded desktop-native AI actions

- Status: Accepted
- Date: 2026-08-15
- Decision: Some AI-powered workflows must complete inside the desktop app without opening the Codex UI. The first example is writing German text and selecting **Correct now**.
- Boundary: This does not move live Voice or open-ended tutoring into the desktop app.

## D-018 — Use Codex-managed personal authentication

- Status: Accepted with validation required
- Date: 2026-08-15
- Decision: Use the local Codex App Server account surface for Codex-managed browser or device-code login. Let Codex persist and refresh credentials. Use the Codex SDK only where it simplifies local thread execution.
- Validation needed: Prototype authentication, German correction quality, structured-output reliability, latency, cancellation, and plan-usage behavior before locking the integration.

## D-019 — Full structured correction result

- Status: Accepted
- Date: 2026-08-15
- Decision: **Correct now** should return corrected text, inline changes, categorized mistakes, short explanations, a natural alternative, vocabulary candidates, and a suggested follow-up exercise.
- Presentation: Use progressive disclosure so detailed analysis does not overwhelm the primary corrected-text view.

## D-020 — Automatically preserve correction history

- Status: Accepted
- Date: 2026-08-15
- Decision: Automatically save each correction attempt, including the original, corrected version, mistakes, and feedback, to the local history. Allow the learner to delete or amend records.
- Boundary: Extracted vocabulary is suggested but not added to the spaced-review deck without confirmation.

## D-021 — Add a contextual desktop helper

- Status: Accepted
- Date: 2026-08-15
- Decision: Add a helper chat beside the writing workspace. It can use highlighted text, the active correction, exercise context, learner level, and teaching profile to answer focused follow-up questions.
- Boundary: It is an artifact-scoped learning conversation, not a replacement for general Codex or Voice.

## D-022 — Helper explains but does not edit

- Status: Accepted
- Date: 2026-08-15
- Decision: The contextual helper may explain, suggest alternatives, and provide examples, but it must not modify the learner's text or offer direct-apply editing actions.

## D-023 — Mistake review and targeted practice

- Status: Accepted
- Date: 2026-08-15
- Decision: Organize mistake history by grammar or vocabulary category and date, highlight recurring patterns, and provide **Practice this** to generate a targeted exercise.

## D-024 — Placement is optional and lightweight

- Status: Accepted
- Date: 2026-08-15
- Decision: Do not require a placement test during onboarding. Offer an optional lightweight diagnostic and continue diagnosing through normal activity.
- Principle: CEFR is useful for content calibration and curriculum coverage, but the learner's level label should not dominate the experience.

## D-025 — Maintain a weekly study plan

- Status: Accepted
- Date: 2026-08-15
- Decision: Keep a local weekly plan with learning goals and suggested activities.
- Boundary: Treat it as an advisory planning artifact. It does not need manual completion updates, automatic progress reconciliation, or links from each plan item to learner attempts.

## D-026 — Codex provides the daily entry point

- Status: Accepted
- Date: 2026-08-15
- Decision: When asked what to practice, Codex reads the local weekly plan, recent mistakes, due vocabulary, and curriculum progress. It recommends one primary activity plus alternatives and hands structured exercises to the desktop app.
- Boundary: Recommendations can consult the plan but do not automatically mutate its completion state.

## D-027 — First desktop shell includes a dashboard

- Status: Superseded in navigation detail by D-080
- Date: 2026-08-15
- Decision: Make **Dashboard** the desktop application's main page. First-version navigation is **Dashboard**, **Weekly plan**, **Writing**, **Mistakes**, **Vocabulary**, and **Settings/Account**.
- Boundary: Curriculum research and detailed curriculum management remain in Codex and repository files initially.

## D-028 — Pursue direct handoff with a supported fallback

- Status: Superseded by D-076
- Date: 2026-08-15
- Decision: Aim for both **Open exercise** from Codex into Open Deutsch and **Ask in Codex** from the desktop app with preserved activity context.
- Validation needed: Test whether the current Codex/plugin hosts permit a custom desktop URL and whether the Codex desktop app exposes a supported way to open or focus an exact task. The reviewed official documentation does not currently establish a public deep-link contract for the latter.
- Fallback: Store the activity and context locally, open the relevant application where supported, and provide a short continuation prompt or selection step. Do not make the learning workflow depend on an undocumented URL scheme.

## D-029 — Dashboard shows the current learning context

- Status: Accepted
- Date: 2026-08-15
- Decision: Show the current weekly plan, quick practice actions, recent corrections, recurring mistakes, and vocabulary due for review on the main dashboard.

## D-030 — Use simple spaced repetition for vocabulary

- Status: Accepted
- Date: 2026-08-15
- Decision: Include a lightweight spaced-repetition review flow in the MVP rather than limiting vocabulary to saved lists and manually selected practice.

## D-031 — Exercises are short and AI-generated

- Status: Accepted
- Date: 2026-08-15
- Decision: Generate structured exercise content with AI. Default to short, simple, untimed activities with optional hints.
- Boundary: The desktop app owns the deterministic exercise format and interaction state; the model supplies the content and evaluates open-ended answers where needed.

## D-032 — Use SQLite for mutable learner state

- Status: Accepted
- Date: 2026-08-15
- Decision: Use SQLite as the canonical store for private mutable learner data. Keep reviewed reusable curriculum in Git-tracked Markdown/YAML and use JSON for structured interchange, optional export, and staging.
- Reason: Attempts, corrections, recurring mistakes, and spaced-repetition scheduling require transactional updates and relational queries, while curriculum should remain human-reviewable and cloneable.

## D-033 — Save started exercises as attempts

- Status: Accepted
- Date: 2026-08-15
- Decision: Discard unused AI generations. Once an exercise starts, save the exercise content needed to interpret it together with the learner's answers, feedback, mistakes, and result.

## D-034 — Support two feedback timings

- Status: Accepted
- Date: 2026-08-15
- Decision: Support immediate feedback and submit-at-the-end feedback. Choose a sensible default by exercise type and allow the learner to switch modes.

## D-035 — Initial structured exercise formats

- Status: Accepted
- Date: 2026-08-15
- Decision: Begin with free writing, short-answer production, fill-in-the-blank, sentence correction, multiple choice, and vocabulary recall.

## D-036 — Discover models and allow per-workflow overrides

- Status: Accepted
- Date: 2026-08-15
- Decision: Use App Server runtime model discovery as the source of truth. Ship an Automatic model default with semantic reasoning defaults, and let learners override model and reasoning effort separately for writing correction, exercise/lesson generation, contextual help, and curriculum research.
- Defaults: Use **Automatic + Balanced** for writing correction and exercise/lesson generation, **Automatic + Fast** for contextual help, and **Automatic + Deep** for curriculum research.
- Persistence: Keep shared semantic defaults in the repository and personal overrides in the private local SQLite database.
- Presentation: Keep model controls in **Settings/Account** rather than placing them on ordinary exercise screens.
- Subscription behavior: Display plan and rate-limit information when available, but do not hardcode entitlement rules from a subscription label.
- Boundary: Desktop settings control desktop-originated App Server turns. Tasks and Voice initiated in Codex use the host's own model controls.

## D-037 — Keep first-run onboarding minimal

- Status: Accepted
- Date: 2026-08-15
- Decision: On first run, verify or connect the personal Codex account, create the local learner profile, select an approximate starting level, record the everyday-life-in-Germany goal and available study time, and choose an initial teaching profile.
- Boundary: Placement is optional and skippable.

## D-038 — Create weekly plans on demand

- Status: Accepted
- Date: 2026-08-15
- Decision: Create or replace the weekly plan on demand from either Codex or the desktop app. Do not require a scheduled Monday job, automatic completion updates, or background reconciliation.

## D-039 — Map default profiles by activity

- Status: Accepted
- Date: 2026-08-15
- Decision: Default to **Conversation Partner** for Codex/Voice and **Strict Corrector** for **Correct now**, writing review, and targeted mistake practice.
- Boundary: The learner may switch profile for an individual session.

## D-040 — Use Electron, React, Vite, and TypeScript

- Status: Accepted
- Date: 2026-08-15
- Decision: Build the desktop baseline with Electron + TypeScript + React + Vite. Do not include a Next.js runtime unless a later concrete requirement needs it.

## D-041 — Use a pnpm workspace with shared packages

- Status: Accepted
- Date: 2026-08-15
- Decision: Use a pnpm workspace containing the desktop app, shared domain/contracts/persistence code, a separately launchable MCP server, and the personal Codex plugin.
- Boundary: The desktop and MCP entry points reuse domain and SQLite logic; the renderer accesses privileged behavior only through typed preload/IPC.
- Plugin shape: Package Codex-facing skills and the MCP connection under a real plugin manifest rather than treating the desktop app itself as plugin UI.

## D-042 — Package AppImage first

- Status: Superseded by D-073 and ADR-0018
- Date: 2026-08-15
- Decision: The historical sequencing chose AppImage first. The current delivery decision is Linux x86_64 AppImage only; ADR-0018 records why `.deb` is not part of this release boundary.
- Superseded boundary: D-073 removes Windows audit, validation, packaging, and support from the current implementation goal.

## D-043 — Let the learner choose the data root

- Status: Accepted
- Date: 2026-08-15
- Decision: Require the learner to choose or confirm the private application data root during onboarding. Store SQLite, attachments, and local staging under that root.
- Bootstrap: Keep only a minimal path pointer and non-sensitive startup metadata in the standard per-user application configuration directory so the desktop and MCP helper find the same data.
- Safety: Validate writability, recognize an existing Open Deutsch data root, avoid overwriting unrelated files, and warn when the selected directory is inside a Git worktree.

## D-044 — Offer Codex integration installation

- Status: Accepted with validation required
- Date: 2026-08-15
- Decision: During onboarding, detect plugin/MCP availability and offer **Install Codex integration**, with manual setup and recovery instructions as a fallback.
- Validation needed: Confirm the supported local plugin installation and MCP command registration flow for both workspace development and packaged AppImage installations.

## D-045 — Optimize clones for a developer workflow first

- Status: Accepted
- Date: 2026-08-15
- Decision: Initially optimize a fresh clone for one documented pnpm setup plus clear desktop and plugin/MCP development commands. Build a polished non-developer installer after the personal workflow works end to end.

## D-046 — Keep learner data in one self-contained folder

- Status: Accepted
- Date: 2026-08-15
- Decision: Store SQLite, attachments, and local research staging beneath the one folder selected during onboarding. Treat that folder as the portable learner dataset.
- Boundary: Do not build automatic backups, managed snapshots, or a backup subsystem for the MVP.

## D-047 — Point to data; do not move it

- Status: Accepted
- Date: 2026-08-15
- Decision: Do not implement an in-app **Move data folder** operation. The bootstrap configuration points to one data root, and selecting another valid root switches the active dataset without copying or deleting anything.

## D-048 — Defer application-level encryption

- Status: Accepted
- Date: 2026-08-15
- Decision: Rely on operating-system permissions and full-disk encryption for the MVP. Disclose that the selected folder contains readable local data and defer encrypted SQLite until needed.

## D-049 — Organize curriculum by level and real-world topic

- Status: Accepted
- Date: 2026-08-15
- Decision: Organize reviewed curriculum first by CEFR band (A1–B2) and then by real-world topic. Each topic links communicative goals, grammar, vocabulary, exercise concepts, and source metadata.

## D-050 — Prefer authoritative curriculum sources

- Status: Accepted
- Date: 2026-08-15
- Decision: Prioritize official language-learning frameworks and trusted German institutions, followed by reputable pedagogical sources. Prefer primary German public-service sources for changing everyday-life facts and record citations plus review dates.

## D-051 — Approve curriculum through Codex and Git

- Status: Accepted
- Date: 2026-08-15
- Decision: Keep research drafts in ignored local staging. Codex presents a source summary and proposed file changes, and only explicit approval writes files into `content/curriculum`.
- Boundary: The maintainer owns every Git operation. Research and coverage review remain in Codex and repository files; no desktop curriculum-management or Git client is required.

## D-052 — Use the accepted MVP milestone sequence

- Status: Superseded as an execution structure by D-058
- Date: 2026-08-15
- Decision: Deliver validation spikes; workspace/data/plugin foundation; the writing correction vertical slice; AI exercises, vocabulary review, and weekly planning; then Voice summary, one research proof, and AppImage packaging.

## D-053 — Make writing correction the first demo

- Status: Accepted
- Date: 2026-08-15
- Decision: The first demonstrable slice chooses a data folder, connects the account, starts writing from either surface, runs **Correct now**, renders structured feedback, and saves the attempt into recent corrections and mistake history.

## D-054 — Define the MVP completion bar across both surfaces

- Status: Superseded in scope by D-074
- Date: 2026-08-15
- Decision: The MVP requires both entry surfaces, simple vocabulary review, contextual correction help, one saved Voice summary, one promoted curriculum topic, and an AppImage that reopens the dataset with plugin/MCP integration available.

## D-055 — Plugin and MCP are core scope

- Status: Accepted
- Date: 2026-08-15
- Decision: The Codex plugin and local STDIO MCP server are first-class components. The plugin packages teaching/research skills and the MCP connection; MCP exposes bounded learner-state tools shared with the desktop.
- Boundary: Optional MCP Apps UI, public plugin submission, and a public HTTPS MCP deployment are not required for the initial personal product. Revisit them only for a separately approved broader distribution need.
- Packaging: The AppImage ships a version-matched installable plugin payload and stable MCP helper so installation works outside a source checkout.

## D-056 — Use layered agent-oriented tests

- Status: Accepted
- Date: 2026-08-15
- Decision: Use Vitest for fast domain, SQLite, contract, and MCP handler tests; a programmatic MCP client for STDIO protocol tests; Playwright Electron automation for committed desktop journeys; and a versioned prompt corpus for installed-plugin evaluations.
- Live boundary: Fake App Server/auth/model behavior in deterministic tests. A separate, manually invoked functional verification may use the learner's own Codex account and limits, but it is not an automated test or acceptance gate.
- Playwright MCP: Treat it as optional exploratory tooling for an agent, not the reproducible acceptance gate.

## D-057 — Separate live verification from automated tests

- Status: Accepted
- Date: 2026-08-15
- Decision: Provide `make verify-live` for one short real-account App Server verification and `make verify-plugin` for installed-host verification using Codex-managed authentication. Each delegates to a dedicated pnpm workflow.
- Boundary: Each command is manually invoked, warns and requires confirmation about account usage, is not matched by Vitest/Playwright test discovery, and is never included in deterministic Make targets or CI.

## D-058 — Use one canonical implementation TODO

- Status: Accepted
- Date: 2026-08-15
- Decision: Use `docs/implementation-plan.md` as the dependency-ordered execution artifact. An implementation agent sets one goal, selects the first unchecked unblocked item, implements and verifies it, marks it complete, and continues looping until all in-scope items and final acceptance checks are complete.
- Boundary: The checklist uses ownership tags for orientation but no phase gates. The milestone roadmap is retained only as product rationale.

## D-059 — Rename the product to Open Deutsch

- Status: Accepted
- Date: 2026-08-15
- Decision: Use **Open Deutsch** as the product, repository/package, plugin, and user-facing name. Use `open-deutsch://` for the desktop URL scheme and `dev.opendeutsch.app` as the Linux application identifier.

## D-060 — Require an existing Codex installation

- Status: Accepted
- Date: 2026-08-15
- Decision: Open Deutsch requires a compatible `codex` installation. Detect the executable and version, reuse managed account state through App Server when available, and offer browser/device-code login when signed out.
- Boundary: Do not bundle Codex and do not provide an API-key or separate billing fallback. Unsupported Codex versions disable desktop AI and integration installation while local non-AI functionality remains usable.

## D-061 — Isolate desktop-originated AI turns

- Status: Accepted
- Date: 2026-08-15
- Decision: Correction, helper, and other bounded desktop AI turns run with an isolated temporary working directory, restricted filesystem access, no network, no shell, no unrelated MCP tools, and no interactive approval path unless a later capability explicitly requires and documents one.
- Safety: Treat learner and imported text as untrusted data, validate structured outputs, and test that prompt injection cannot broaden tools or file access.
- Verification: Deterministic fake/protocol tests run normally; the separately confirmed `make verify-live` command uses harmless disposable canaries to prove the supported real runtime denies out-of-sandbox file, disabled-tool, and network access.

## D-062 — Ship an opinionated base curriculum

- Status: Accepted
- Date: 2026-08-15
- Decision: Maintain one opinionated A1–B2 curriculum in Git using Markdown with validated YAML front matter plus central YAML manifests. Development reads repository content directly; AppImages contain a read-only snapshot updated only by a new build.
- Git boundary: Research may stage drafts locally and write approved files into the repository, but Open Deutsch does not manage commits, pulls, pushes, branches, or conflicts. The user owns all Git interaction.
- Completion: Every A1–B2 band covers the accepted everyday-life domain map with reviewed objectives, relevant CEFR skill outcomes, grammar/vocabulary foundations, a lesson foundation, an exercise blueprint, prerequisites/links, and source/freshness metadata. Required cells cannot remain unmapped in a release.

## D-063 — Separate every account-consuming verification

- Status: Accepted
- Date: 2026-08-15
- Decision: Keep deterministic plugin checks in `test:plugin`. Put real App Server verification behind `make verify-live` and installed-host prompt evaluation behind `make verify-plugin`; both require an explicit usage warning and confirmation and are never invoked by ordinary agent loops, `test:all`, or CI.

## D-064 — Coordinate dataset switching across processes

- Status: Accepted
- Date: 2026-08-15
- Decision: Switching the data root updates a versioned bootstrap pointer, reopens desktop services, and makes independently running MCP processes detect that their root generation is stale. Use supported reload when available; otherwise report that the integration must restart before further reads or writes.

## D-065 — Provide one general History area

- Status: Accepted
- Date: 2026-08-15
- Decision: Add a general History area covering writing, grammar, vocabulary, reading, listening/Voice, speaking summaries, and placement evidence. Support filters, reconstruction, deletion, and **Practice this again** without changing weekly-plan completion.

## D-066 — Use guided Codex integration installation

- Status: Accepted
- Date: 2026-08-15
- Decision: Provide documented Make targets and a guided in-app installation/status experience using only supported marketplace and CLI mechanisms. Do not use App Server plugin endpoints documented as under development in production. Never modify unrelated Codex plugins or configuration.
- Test boundary: Unattended install/refresh/uninstall checks use an isolated disposable Codex configuration/home. If supported tooling cannot isolate it, real-host mutation requires explicit `make verify-plugin` confirmation.

## D-067 — Use a consistent light visual system

- Status: Accepted
- Date: 2026-08-15
- Decision: Ship light mode only initially with a clean, warm, text-forward desktop design; restrained blue actions; semantic error/warning/success colors; Lucide icons; consistent interaction states; minimal motion; and a simple **OD** mark without flags, mascots, gradients, or stereotypical imagery.
- UI foundation: Use React Aria, repository-owned components, CSS Modules and shared CSS design tokens. Important actions use labels, and color is never the only state indicator.

## D-068 — Support English and German UI localization

- Status: Accepted
- Date: 2026-08-15
- Decision: Use `i18next`/`react-i18next` for English and German UI. English is always the initial default. UI locale and teaching/explanation language are separate configurable preferences.
- Validation: User-visible strings use translation keys; key screens and the component gallery are checked in both locales and at standard/narrow window sizes. Operational logs remain stable English.

## D-069 — Use Make as the human-facing command surface

- Status: Accepted
- Date: 2026-08-15
- Decision: Present Make commands first in documentation and have them call the complete pnpm workflows. Provide English `make help` descriptions and at least `make dev`, `make prd`, `make start` as an alias of `make prd`, `make kill`, `make status`, `make logs`, quality/test/package commands, and plugin install/refresh/status/uninstall commands.
- Process safety: `make dev` and `make prd` run in the background with exact tracked PIDs and logs. `make prd` builds first and waits for a startup signal. `make kill` is idempotent and stops only repository-owned processes.

## D-070 — Standardize linting, formatting, and type checks

- Status: Accepted
- Date: 2026-08-15
- Decision: Use strict TypeScript, ESLint flat configuration, React/hooks/import/accessibility/Electron-security/package-boundary rules, and Prettier. Provide Make targets for lint, fix, formatting, format checking, type checking, and aggregate checks.
- Boundary: Do not require Git hooks initially. Repository commands and Codex agent instructions are authoritative.

## D-071 — Disclose local storage versus cloud processing

- Status: Accepted
- Date: 2026-08-15
- Decision: Onboarding and the first AI action clearly explain that records are stored locally while selected text and minimized context are sent to OpenAI for model processing. Voice and Codex follow the account's OpenAI data controls.

## D-072 — Harden learner-folder handling

- Status: Accepted
- Date: 2026-08-15
- Decision: Create app-owned Linux folders/files with restrictive permissions where supported, warn rather than silently chmod existing user directories, canonicalize paths, reject unsafe symlink traversal, and preserve ownership boundaries.

## D-073 — Keep the current delivery Linux-only

- Status: Accepted
- Date: 2026-08-15
- Decision: Implement and ship Linux/AppImage only. Do not include a Windows audit or validation build in the current implementation goal.

## D-074 — Complete the full learning breadth

- Status: Accepted
- Date: 2026-08-15
- Decision: The current implementation goal includes writing, grammar, goal/topic-generated vocabulary lessons and SRS, natural-request custom lessons, reading, Codex-based listening, speaking summaries, optional placement, weekly planning from either surface, and four-skill evidence. Each area requires navigation, persistence, accessibility, deterministic tests, and an acceptance journey.

## D-075 — Keep all audio in Codex

- Status: Accepted
- Date: 2026-08-15
- Decision: Open Deutsch does not generate, import, store, or play audio. Listening and live speaking happen in Codex Voice through a prepared session handoff. Store only explicit structured attempts or summaries; do not save raw audio or full Voice transcripts by default.

## D-076 — Use direct structured handoff without clipboard fallbacks

- Status: Accepted; exact Voice bridge currently unavailable
- Date: 2026-08-15
- Decision: Open Deutsch must open or create the exact related Codex/Voice session for desktop-originated audio workflows. Codex creates exact desktop activities through MCP so they appear on the dashboard; direct Codex-to-app launch is used only if a supported mechanism exists.
- Boundary: Do not build clipboard prompts or manual handoff instructions into the product. Prepared activities persist until completed or deleted. The desktop refreshes on focus and offers manual refresh.
- Current release state: The supported host contract does not expose an exact desktop-originated Voice-session bridge. Listening and speaking therefore return `OD_HANDOFF_VOICE_SESSION_UNSUPPORTED`; this remains a release blocker for those exact-handoff acceptance items until the host capability is revalidated or product authority changes this decision.

## D-077 — Create a Codex-focused development structure

- Status: Accepted
- Date: 2026-08-15
- Decision: Create a root `AGENTS.md`, scoped instructions only where behavior materially differs, and `docs/agent/` guidance for the runbook, design direction, and reusable lessons learned. Optimize this structure entirely for Codex development agents.
- Lessons rule: Record concise, dated, evidence-based reusable facts rather than a chronological diary. Promote stable rules into the relevant `AGENTS.md`.

## D-078 — Use bounded human-readable local logs

- Status: Accepted
- Date: 2026-08-15
- Decision: Produce concise English text logs with timestamps, severity, component, event code, correlation ID, and readable message. Use component labels, bounded rotation of ten 5 MB files per component, redaction, user-visible error references, Make log commands, and an explicit redacted diagnostic export.
- Privacy: Do not log learner text, answers, model output, tokens, device codes, or raw protocol payloads by default. Do not send telemetry or crash reports.

## D-079 — Keep normal robustness without a crash-recovery subsystem

- Status: Accepted
- Date: 2026-08-15
- Decision: Implement React error boundaries, clear recoverable states, graceful owned-process shutdown, database transaction safety, stale-PID cleanup, and actionable log references. Do not add a dedicated crash-loop recovery product or cloud crash reporting.

## D-080 — Use one focused desktop information architecture

- Status: Accepted
- Date: 2026-08-15
- Decision: Use persistent left navigation for Dashboard, Practice, Writing, Vocabulary, History, Progress, Weekly plan, and Settings/Account. Practice contains grammar, reading, Codex listening/speaking handoffs, and diagnostic entry points. Use a focused center workspace and optional right contextual helper.
- Correction UI: Default to an inline annotated document with non-color indicators and provide a synchronized side-by-side original/corrected view.

## D-081 — Update packaged content and application manually

- Status: Accepted
- Date: 2026-08-15
- Decision: AppImage replacement is manual initially. Do not add an automatic updater or background update check. A new build updates both application code and the bundled base-curriculum snapshot.
