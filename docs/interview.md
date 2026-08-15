# Product interview

Status: complete; later answers supersede earlier provisional answers  
Last updated: 2026-08-15

## How the interview will work

We will resolve a small number of high-impact questions per round. After each answer, update:

- `product-requirements.md` for scope and behavior.
- `component-boundaries.md` for ownership across surfaces.
- `decisions.md` for decisions and their rationale.
- This file for answers and remaining questions.

## Round 1 — Product anchor

### Q1. Who is the first learner?

Is version one permanently a tool for you, or should its data model and onboarding already anticipate other learners later? Also record your approximate current German level and main real-world goal.

Answer: Version one is for a single personal learner. Other people may clone and configure the repository later, but multi-user features are unnecessary. The learner is currently around A2 and is working toward B1. Initial learning content should cover A1, A2, B1, and B2.

### Q2. What does local-only mean?

The proposed interpretation is: all learning data stays local, but the Codex desktop app can communicate with OpenAI for model execution and Voice. There is no separate Open Deutsch backend or account. Confirm or correct this.

Answer: Confirmed. Learning data should remain local. Communicating with OpenAI for Codex and Voice is expected; Open Deutsch does not need its own cloud storage or backend.

### Q3. Which surface is home?

The proposed model is Codex-first: most sessions begin in Codex/Voice, while the desktop app is opened for dashboards, structured exercises, vocabulary review, history, and data management. Confirm this or describe a desktop-first flow.

Answer: Codex is the preferred starting point, followed by the desktop app for exercises. The reverse flow should also be possible.

## Round 2 — Learning direction and MVP depth

### Q4. What is the main learning outcome?

Is the immediate goal general conversational German, daily life in Germany, workplace German, a particular exam such as Goethe B1, or something else? Is there a target date for reaching B1?

Answer: Everyday life in Germany. No target date has been specified yet.

### Q5. How should correction and explanation feel?

Choose the preferred balance between immediate interruption and end-of-exercise feedback, and between German-only explanations and English support. Also describe the desired teacher personality: strict, encouraging, playful, concise, or another combination.

Answer: Support both immediate and deferred correction through different AI teaching profiles. The exact profile set and explanation-language behavior still need definition.

### Q6. How narrow should the first useful version be?

Should the first milestone implement a deep end-to-end slice around writing, grammar, vocabulary, and a saved Voice summary, then expand to reading/listening? Or should it include a basic version of all four skills from the start?

Answer: Start with a deep end-to-end workflow, then expand breadth.

Additional requirement: Add a Codex research mode or agent that can research important CEFR topics, starting with A1, and persist lessons and guides. The system will need a deliberate split between repository content committed to Git and private local content.

## Round 3 — Profiles and curriculum governance

### Q7. Which teaching profiles should exist first?

A proposed starting set is: Encouraging Coach, Strict Corrector, Conversation Partner, and Grammar Teacher. Should these be fixed presets, editable presets, or composable settings such as correction timing, explanation language, strictness, and tone?

Answer: Keep the initial set simple: **Conversation Partner** and **Strict Corrector**.

### Q8. Confirm the content-persistence boundary

Proposed split: Git contains reusable reviewed curriculum, rubrics, templates, and source metadata; the local database contains your profile, attempts, progress, vocabulary, and personalized lesson variants; a Git-ignored staging area contains unreviewed research drafts and source cache. Should Codex require your approval before promoting a draft into the Git-tracked curriculum?

Answer: Yes. Codex must request approval before promoting a research draft into Git-tracked curriculum.

### Q9. How should curriculum research be prioritized?

Should research first create a systematic A1–B2 curriculum map and gap tracker, then research individual lessons in priority order? Or should it begin just-in-time with the next topics you personally need and build the map gradually?

Answer: Create a systematic A1–B2 curriculum map and gap tracker first.

Additional requirement: Some AI actions should finish inside the desktop app. The first example is writing German text and selecting **Correct now** without switching to the Codex UI. The desired authentication is the learner's personal ChatGPT/Codex account rather than a separately managed API key or cloud account.

## Round 4 — Desktop writing workflow

### Q10. What should **Correct now** return?

A proposed result is: corrected version, inline diff, categorized mistakes, short explanations, a natural alternative, extracted vocabulary, and a suggested follow-up exercise. Which of these should appear by default?

Answer: Include the full proposed result: corrected version, inline changes, categorized mistakes, short explanations, a natural alternative, vocabulary candidates, and a suggested follow-up exercise.

### Q11. What should be saved automatically?

Should every correction automatically save the original, corrected text, feedback, mistakes, and vocabulary to local history, or should the learner review the result and select **Save attempt**?

Answer: The main requirement is being able to revisit past mistakes. Decision: automatically save correction attempts and feedback locally, with delete/edit controls. Vocabulary candidates require confirmation before entering active review.

### Q12. Which desktop-native AI action should follow correction?

Candidates include: explain selected text, generate a writing prompt, create a targeted exercise from mistakes, score against a CEFR rubric, or rewrite for a chosen register. Which is the next most valuable action?

Answer: Add a helper chat beside the writing interface. The learner can highlight text and ask a contextual question such as, "Explain why this is dative."

## Round 5 — Helper behavior and mistake review

### Q13. Can the helper change the writing?

Should the helper only explain and suggest, or may it also offer explicit **Apply change** actions? The proposed safety rule is that it never edits the learner's text silently.

Answer: The helper should only explain and suggest. It should not modify the learner's text or offer direct-apply changes.

### Q14. Define the two profiles

Proposed behavior:

- **Conversation Partner:** German-first conversation, minimal interruption, corrections summarized after the activity, encouraging tone.
- **Strict Corrector:** marks every meaningful error, gives precise explanations with English support when useful, and creates targeted follow-up practice.

Should these defaults be accepted or adjusted?

Answer: Accepted as proposed.

### Q15. How should mistake review work?

Proposed view: organize mistakes by grammar/vocabulary category and date, highlight recurring patterns, and offer **Practice this** to generate a targeted exercise. Is that sufficient for the first version?

Answer: Yes. Category/date organization, recurring-pattern detection, and **Practice this** are sufficient for the first version.

## Round 6 — Onboarding and study rhythm

### Q16. How should placement work?

Should the first run require a placement test, offer an optional test, or simply start from the learner's selected level and diagnose weaknesses gradually? A lightweight optional diagnostic is the proposed default.

Answer: Placement should be optional. The precise level label is not especially important; it should calibrate learning quietly rather than dominate the experience.

### Q17. Should the system create a study plan?

Should Open Deutsch maintain a weekly plan with goals and recommended activities, or only recommend the next activity based on current weaknesses? A lightweight weekly plan plus a single **Recommended next** action is the proposed approach.

Answer: Maintain a weekly plan.

Clarification: The weekly plan is guidance only. It does not need manual completion updates, automatic progress tracking, or links to completed activities.

### Q18. What should starting from Codex feel like?

Proposed flow: ask "What should I practice today?"; the plugin reads the local plan, recent mistakes, due vocabulary, and curriculum progress; Codex offers one primary activity and a few alternatives; a structured exercise opens in the desktop app when needed. Does that match the desired experience?

Answer: Yes. Use the accepted Codex-first recommendation and desktop handoff flow.

## Round 7 — Weekly planning and desktop shell

### Q19. How should the weekly plan be created?

Should Codex automatically propose a new plan each week for approval, or should it update the plan continuously as activities are completed? The proposed approach is a weekly proposal that you can edit, followed by automatic progress updates during the week.

Answer: Keep it simple. The plan is a planning artifact; do not require manual progress updates or link plan items to completed activities.

### Q20. Which desktop screens belong in the first version?

Proposed MVP navigation: **Dashboard**, **Weekly plan**, **Writing**, **Mistakes**, **Vocabulary**, and **Settings/Account**. Curriculum research and detailed analytics can initially remain in Codex and repository files. Is this sufficient?

Answer: Yes, with a separate main dashboard page.

### Q21. Confirm direct handoff

Proposed experience: Codex offers **Open exercise**, which launches Open Deutsch directly into the prepared activity. From the desktop app, **Ask in Codex** opens or continues a related Codex task with the activity context. Should both directions be MVP requirements?

Answer at this point: Support both directions if the current Codex host makes them possible. Direct handoff is desired, with a local-context fallback rather than dependence on an undocumented deep-link mechanism. This fallback was later explicitly superseded by Q69/D-076: exact supported handoff is required and no clipboard/manual continuation UI ships.

## Round 8 — Dashboard and practice scope

### Q22. What belongs on the dashboard?

Proposed first version: the current weekly plan, quick actions for writing and practice, recent corrections, recurring mistakes, and vocabulary due for review. Which of these should be visible at a glance?

Answer: Show all of them.

### Q23. How deep should vocabulary review be in the MVP?

Should the first version implement a small spaced-repetition flow, or begin with saved vocabulary lists and manually chosen practice? A simple spaced-repetition flow is the proposed default.

Answer: Use simple spaced repetition.

### Q24. What should a normal structured exercise feel like?

Should exercises usually be short, untimed sessions with optional hints and immediate feedback, or should timers, scores, and multi-step lesson sessions be central from the beginning? Short untimed sessions with optional hints are the proposed default.

Answer: Keep exercises short, untimed, and simple, with optional hints. Exercise content should be AI-generated.

## Round 9 — Generated exercise lifecycle

### Q25. What should be saved from an AI-generated exercise?

Proposed default: do not build a library of every unused generation. Once an exercise is started, save the prompt/content needed to understand it, the learner's answers, feedback, mistakes, and result as one attempt. Is that sufficient?

Answer: Yes. Storage technology can be chosen during planning; use SQLite for mutable learner state and files for reviewed curriculum and interchange.

### Q26. When should structured exercises reveal corrections?

Proposed default: give immediate feedback after short objective questions, but wait until submission for writing and other open-ended production so the learner can finish their thought. Should this be the default?

Answer: Support both feedback modes.

### Q27. Which structured exercise formats should the first version support?

Proposed initial set: free writing, short-answer production, fill-in-the-blank, sentence correction, multiple choice, and vocabulary recall. Listening, reading, matching, ordering, and richer formats can follow. Is this a useful first set?

Answer: Yes.

### Additional requirement: model and reasoning selection

Provide direction for defaults and learner overrides across subscriptions. The learner should be able to choose which available model and reasoning effort creates exercises, corrects writing, answers helper questions, or performs research.

## Round 10 — Model settings

### Q28. Confirm the proposed workload defaults

Proposed defaults: **Automatic + Balanced** for correction, **Automatic + Balanced** for exercise generation, **Automatic + Fast** for the contextual helper, and **Automatic + Deep** for curriculum research. Available exact models and efforts come from the signed-in App Server runtime. Is this a good baseline?

Answer: Yes.

### Q29. Where should overrides live?

Proposed default: the repository ships semantic defaults for everyone, while each learner's model and effort overrides stay in their private local SQLite database. Is that the right split?

Answer: Yes.

### Q30. Should ordinary exercise screens expose model controls?

Proposed default: keep model controls in **Settings/Account** and avoid a picker on every exercise. Add temporary per-run overrides only later if they prove useful. Is that preferable?

Answer: Yes. Keep model controls in Settings/Account.

## Round 11 — Onboarding and plan creation

### Q31. What should first-run onboarding contain?

Proposed minimal flow: connect the personal ChatGPT/Codex account, create the local learner profile, select an approximate starting level, record the everyday-life-in-Germany goal and available study time, then choose an initial teaching profile. Placement remains optional and can be skipped. Is this appropriate?

Answer: Yes.

### Q32. What should create the weekly plan?

Proposed default: create or replace it on demand, either by asking Codex or selecting **Create weekly plan** in the desktop app. Do not run an automatic Monday job or update completion state in the background. Is that the desired behavior?

Answer: Yes.

### Q33. Which teaching profile should each flow use by default?

Proposed default: use **Conversation Partner** for Codex/Voice conversation and **Strict Corrector** for **Correct now**, writing review, and targeted mistake practice. The learner can switch profiles for a session. Is that correct?

Answer: Yes.

## Round 12 — Basic implementation shape

### Q34. Which desktop web stack should be the baseline?

Proposed baseline: **Electron + TypeScript + React + Vite**. Avoid a Next.js server/runtime unless a later requirement genuinely needs it; the application is local and Electron already owns the backend process. Is this direction acceptable?

Answer: Yes.

### Q35. How should the repository be divided?

Proposed baseline: one TypeScript workspace with a desktop application, shared learning/domain packages, a SQLite persistence package, a separately launchable local MCP server, and the personal Codex plugin. The desktop and MCP entry points reuse the same domain code and database rather than duplicating logic. Is this the right shape?

Answer: Yes. Use a pnpm workspace if it fits; it is the accepted baseline.

### Q36. What should the first Linux distribution target be?

Proposed baseline at this point: produce an AppImage first, optionally add a `.deb`, and keep paths/process APIs portable enough for a future Windows build without shipping Windows initially. This was later narrowed by Q66/D-073 to Linux-only implementation with no Windows audit or validation build.

Answer: Yes.

## Round 13 — Installation and local data

### Q37. Where should private application data live?

Proposed default: use the operating system's standard per-user application-data directory for SQLite, attachments, and local staging. Show the exact location in Settings and provide backup/export actions. Do not store learner data inside the Git checkout. Is this correct?

Answer: Prefer choosing the storage location during onboarding. Keep only a minimal bootstrap pointer in the standard application configuration directory.

### Q38. How should the Codex integration be installed?

Proposed goal: the desktop onboarding checks whether the local plugin/MCP integration is available and offers **Install Codex integration**, plus manual instructions for development or recovery. The exact automatic-install mechanism remains a validation spike. Is that the intended experience?

Answer: Yes.

### Q39. What should a repository clone optimize for first?

Proposed priority: one documented pnpm setup command followed by separate development commands for the desktop and plugin/MCP test flow. A polished non-developer installer can follow once the personal workflow works end to end. Is that acceptable?

Answer: Yes.

## Round 14 — Data-folder behavior and privacy

### Q40. What should the selected data folder contain?

Proposed default: keep SQLite, attachments, research staging, and app-managed snapshots together under the selected root. Let exports and user-created backup copies be saved anywhere. Is that the right boundary?

Answer: Use one folder for all application-managed data. No actual backup or snapshot subsystem is needed.

### Q41. Should the data folder be movable later?

Proposed default: provide a safe **Move data folder** operation in Settings that closes active database access, copies and verifies the data, updates the bootstrap pointer, and only then offers to remove the old copy. Is this needed?

Answer: No. The app should point to one folder and read/write all learner data there. Choosing another folder switches the pointer; the app does not move data.

### Q42. Does the MVP need application-level database encryption?

Proposed default: rely on operating-system permissions and full-disk encryption initially, clearly disclose that the selected folder contains readable local data, and defer application-level SQLite encryption unless it becomes a concrete need. Is that acceptable?

Answer: Yes.

## Round 15 — Curriculum research and promotion

### Q43. How should the reusable curriculum be organized?

Proposed default: organize reviewed curriculum first by CEFR band (A1–B2), then by real-world topic, with each topic linking communicative goals, grammar, vocabulary, exercises, and source metadata. Is that a useful structure?

Answer: Yes.

### Q44. Which source policy should research mode follow?

Proposed default: prioritize official language-learning frameworks and trusted German institutions, then use reputable pedagogical sources for explanation quality. Everyday-life facts should prefer primary German public-service sources and record citations plus review dates. Is this appropriate?

Answer: Yes.

### Q45. How should researched curriculum be approved?

Proposed default at this point: keep drafts in the ignored staging folder; Codex presents a source summary and proposed file changes; after explicit approval, write reviewed files into `content/curriculum`. Later answers clarify that the maintainer performs all Git operations and the desktop has only a lightweight Research view.

Answer: Yes.

## Round 16 — MVP delivery sequence

### Q46. Is this milestone order correct?

Proposed sequence: **validation spikes**, then **workspace/data/plugin foundation**, then the **writing correction vertical slice**, then **AI exercises plus vocabulary review and weekly planning**, and finally **Voice summaries, one curriculum-research proof, and AppImage packaging**. Is that the right order?

Answer: Yes.

### Q47. What should the first demonstrable slice prove?

Proposed first demo: choose a data folder, connect the account, start a writing exercise from Codex or desktop, submit text to **Correct now**, render structured corrections, and save the attempt so it appears in recent corrections and mistake history. Is this the right first end-to-end target?

Answer: Yes.

### Q48. What marks the planning MVP as complete?

Proposed completion bar: the writing slice works through both entry surfaces; vocabulary candidates can enter simple spaced repetition; the contextual helper explains a selected correction; one Voice summary is saved; one reviewed curriculum topic is promoted; and an AppImage can reopen the selected dataset with the plugin/MCP integration available. Is that an appropriate MVP definition?

Answer: Yes.

### Additional requirement: agent-oriented application testing

Create a fast, deterministic test strategy that a coding agent can run from the terminal and use to interact with the Electron application. Include direct MCP protocol tests, plugin evaluation guidance, Electron UI automation, and opt-in real-account checks. Clarify the role of Playwright MCP.

### Scope clarification: Codex plugin and MCP

They are in current MVP scope. The plugin provides teaching/research skills and packages the local STDIO MCP connection; MCP exposes controlled learner-state tools. Optional MCP Apps UI, public plugin submission, and public HTTPS MCP deployment remain deferrable.

## Round 17 — Test strategy confirmation

### Q49. Confirm the fast default gate

Proposed default at this point: `pnpm test:fast` runs static validation, unit tests, real temporary-SQLite integration, IPC/App Server contract fixtures, and STDIO MCP protocol tests without launching Electron or calling a live model. Round 19 later makes `make test-fast` the human/agent-facing command and keeps pnpm behind Make.

Answer: Yes.

### Q50. Confirm the UI automation boundary

Proposed default: use committed Playwright Electron tests for deterministic user journeys. Keep Playwright MCP optional for exploratory agent interaction rather than using it as the source of pass/fail truth. Is this correct?

Answer: Yes.

### Q51. Confirm the live-test boundary

Proposed default: real ChatGPT/Codex account tests are explicit and opt-in, limited to a few smoke cases, and never run as part of `test:fast` or normal agent iteration. Is this acceptable?

Answer: The learner's own Codex account and usage limits may be used for one explicit functional verification, but it must be separate from automated unit, integration, or end-to-end tests. Use a manually invoked `verify:live` command rather than treating it as a test suite.

## Round 18 — Independent-review reconciliation

### Q52. How is Codex provided to the desktop app?

Answer: Require an existing compatible Codex installation. Reuse managed account state when present, support browser/device-code login when signed out, and provide no API-key fallback.

### Q53. How restricted are desktop-originated model turns?

Answer: Use an isolated, no-network, no-shell, no-unrelated-tool policy with restricted filesystem access. Treat learner/imported content as untrusted input.

### Q54. Who owns curriculum and Git?

Answer: Open Deutsch ships an opinionated A1–B2 base curriculum. Development reads it from the repository and AppImages contain a snapshot. Research may update approved repository files, but the user manages all Git operations; the application needs no Git UI or synchronization.

### Q55. How are live verifications separated?

Answer: Real account checks and installed-plugin evaluations are explicit, usage-warning Make commands. They never run in deterministic tests, `test:all`, CI, or an unattended agent loop.

### Q56. What happens when the data root changes?

Answer: Switch the desktop immediately, version the bootstrap pointer, detect stale MCP roots, reload when supported, and otherwise require integration restart before more reads or writes.

### Q57. How is activity history presented?

Answer: Use one general History area with filters and reconstruction across all learning activities, plus area-specific shortcuts.

## Round 19 — Design, tooling, and agent experience

### Q58. What is the product name and technical identity?

Answer: **Open Deutsch**, with repository/plugin name `open-deutsch`, URL scheme `open-deutsch://`, and Linux app ID `dev.opendeutsch.app`.

### Q59. What is the visual direction?

Answer: Light mode, clean and simple, warm educational surfaces, restrained blue actions, semantic feedback colors, minimal motion, Lucide icons, a simple OD mark, consistent interaction states, and no flags, mascots, gradients, or stereotypical imagery.

### Q60. What UI implementation system should be used?

Answer: React Aria, repository-owned components, CSS Modules, shared CSS design tokens, Lucide, and a development-only component gallery. Validate standard/narrow sizes and important states visually.

### Q61. What localization is required?

Answer: English and German UI through i18n. English is always the initial default. UI locale and teaching/explanation language remain separate configurable settings.

### Q62. What commands should humans use?

Answer: Make is the human-facing command surface and delegates to full pnpm workflows. Use `make dev` for development, `make prd` for a production build/run, `make start` as the production alias, plus safe process, log, quality, test, package, and plugin-management commands. `make help` explains every target in English.

### Q63. What code-quality tools are required?

Answer: Strict TypeScript, ESLint flat configuration with React/hooks/import/accessibility/Electron-security/package-boundary rules, and Prettier. Do not require Git hooks initially.

### Q64. How should Codex agents be guided?

Answer: Make the repository 100% Codex-focused with a root `AGENTS.md`, narrowly scoped child instructions, an agent runbook, design direction, and a reusable lessons-learned file. Lessons are dated, evidence-based, and promoted into stable instructions when appropriate.

### Q65. What is the logging strategy?

Answer: Human-readable English local logs with timestamp, severity, component, event code, correlation ID, redaction, bounded ten-by-five-megabyte rotation, Make log commands, and explicit diagnostic export. No learner text, outputs, tokens, raw protocols, telemetry, or cloud crash reports by default.

## Round 20 — Breadth, audio, handoff, and delivery

### Q66. What platform is in scope?

Answer: Linux only. Remove Windows audit and validation work from the current goal.

### Q67. Is the full language-learning breadth required?

Answer: Yes. Writing, grammar, vocabulary, reading, Codex listening and speaking, optional placement, planning, history, and four-skill evidence all require complete navigation, persistence, testing, and acceptance coverage.

### Q68. Where does audio live?

Answer: All audio lives in Codex. Open Deutsch prepares and opens the exact Codex/Voice session and stores only explicit structured results or summaries. It has no audio generation, import, storage, or player.

### Q69. What handoff fallback is acceptable?

Answer: Do not build clipboard/manual handoff fallbacks. Desktop-to-Codex exact session handoff is mandatory for audio. Codex creates exact desktop activities through MCP; direct Codex-to-app launch is used only when a supported capability exists.

### Q70. How are updates delivered?

Answer: Manually replace the AppImage initially. No automatic updater or background update check. New builds carry the updated base-curriculum snapshot.

### Q71. What normal robustness is expected?

Answer: Use error boundaries, recoverable UI states, safe transactions, graceful owned-process shutdown, stale-PID cleanup, and actionable log references. Do not build a dedicated crash-recovery subsystem.

## Optional future discovery

The interview has resolved every question required to start the canonical implementation TODO. Future product work may still refine target timelines, preferred lesson duration, specific textbook/exam mappings, Linux distribution coverage beyond AppImage testing, advanced assessment rubrics, and policies for additional imported non-audio materials. None of these is a blocker or permission to narrow the accepted feature breadth.
