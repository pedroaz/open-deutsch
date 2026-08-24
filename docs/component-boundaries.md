# Component boundaries

Status: current product architecture
Last updated: 2026-08-15

## Recommended product shape

Treat the system as two user-facing surfaces backed by one local learning service:

```text
Codex desktop                                Open Deutsch desktop app
- Voice conversations                        - Dashboard and study plan
- Adaptive teaching dialogue                 - Structured exercise screens
- Explanations and corrections               - History and progress
- Lesson/exercise generation                 - Local data management
             |                                             |
             +------ personal plugin + local MCP ----------+
                                  |
                         local learning service
                         + local database/files
```

The "plugin" is a package and integration layer, not a third standalone application.

Most learning sessions should begin in Codex or Voice and move into the desktop app when a structured exercise or durable overview is useful. The reverse direction must also be supported: the desktop app may recommend or prepare an activity that the learner then continues in Codex.

## Responsibility map

| Capability | Primary owner | Supporting owner | Rationale |
| --- | --- | --- | --- |
| Live speaking conversation | Codex Voice | Plugin teaching skill | Reuse the installed Codex Voice experience; Open Deutsch does not record, synthesize, or play audio. |
| Teaching persona and pedagogy | Plugin skills | Local learner profile | Keeps behavior reusable across text and Voice sessions. |
| Lesson and exercise generation | Codex | Plugin skills and MCP context | Generation benefits from model reasoning and learner history. |
| Writing correction and explanation | Codex | Desktop comparison/history UI | Codex evaluates; the app preserves and displays the result. |
| One-click writing correction | Desktop app through local Codex integration | Strict Corrector profile | The operation should finish without switching to the Codex UI. |
| Contextual writing helper | Desktop side panel through local Codex integration | Current selection and attempt context | Supports focused explanations and follow-up questions without becoming a general chat client. |
| Structured exercise interaction | Desktop app | Optional MCP Apps UI | The desktop app is best for longer, stateful workflows. Small in-chat widgets can be added later. |
| Learner profile | Local learning service | Desktop editor and MCP tools | One source of truth shared by both surfaces. |
| Attempts, scores, and feedback | Local learning service | Desktop app and MCP tools | Durable, queryable, and locally controlled. |
| Vocabulary and review schedule | Local learning service | Desktop app and Codex | Deterministic scheduling with adaptive content generation. |
| Mutable learner data | Local learning service and SQLite | Desktop app and MCP tools | Transactions and queries are more reliable than a directory of editable records. |
| Reviewed curriculum | Git-tracked Markdown and YAML | Codex research workflow | Reusable content stays human-reviewable and cloneable. |
| Progress visualization | Desktop app | Optional in-Codex summary UI | The app provides a stable overview; Codex can narrate it. |
| Weekly plan | Local learning service | Codex and desktop dashboard | The plan is shared context and guidance, not an activity ledger or progress tracker. |
| Cross-surface handoff | Local learning service and app/plugin adapters | Codex and desktop app | Preserve a shared activity identifier and context. Codex-created desktop activities are supported; exact desktop-originated Voice opening is unavailable in the current host. |
| Optional placement diagnostic | Desktop app or Codex | Plugin and local service | Calibration is optional; ongoing activity continues the diagnosis. |
| Speaking, listening, recording, and playback | Codex Voice | Open Deutsch handoff/result records | All audio activity occurs in Codex. Open Deutsch stores only structured activity metadata or summaries returned through the integration. |
| Curriculum research and drafting | Codex research skill | Web research and local MCP context | Codex can synthesize sources and generate reviewable curriculum artifacts. |
| Curriculum approval and version history | Git repository and learner | Desktop app may display status | Reusable content should be inspectable and deliberately promoted. |

## 1. Codex desktop surface

Owns:

- Live Voice.
- Natural-language teaching sessions.
- Adaptive explanations, examples, role-play, and follow-up questions.
- Generating and evaluating open-ended language.
- Choosing plugin tools when learner state should be read or updated.

Does not initially own:

- The canonical learning database.
- Long-term dashboards.
- Deterministic review scheduling.
- A complete custom exercise shell.

## 2. Desktop learning application

Owns:

- Local learner profile and settings UI.
- A main dashboard plus Practice, Writing, Vocabulary, History, Weekly plan, and Settings/Account sections. Practice owns grammar, reading, Codex listening/speaking, and diagnostics; History owns general reconstruction and mistake filtering.
- History, recurring mistakes, vocabulary review, and useful progress evidence.
- Structured exercise players where text fields, multiple steps, timers, or comparison views help. No desktop audio controls exist.
- Editing and deletion of local data, plus selection of the active self-contained data root.
- Starting and supervising the local learning service.
- Bounded embedded AI actions such as **Correct now**, including progress, cancellation, structured results, and errors.
- A selection-aware helper panel for questions about the active text, corrections, grammar, vocabulary, and alternatives.
- Status and recovery guidance for the learner's already-installed Codex authentication. Open Deutsch has no API-key mode or separate account system.
- Per-workflow model and reasoning preferences populated from the current App Server model catalog.

The accepted baseline is Electron + TypeScript + React + Vite in a pnpm workspace. Electron main owns privileged local integration and the renderer communicates through a typed preload/IPC boundary. Next.js is not required because the local application does not need a web server or server-side rendering.

The desktop app should not become a second general-purpose Codex client. Embedded AI actions should be bounded product operations or contextual conversations attached to an active learning artifact. Voice, open-ended tutoring, research, and unrelated long conversations continue to favor the Codex surface.

Cross-surface navigation is an adapter capability rather than a database concern. The supported behavior is:

- Codex creates an exact persistent Open Deutsch activity through MCP so it appears on the dashboard; a direct app-launch action is optional and used only if supported; and
- desktop-originated structured Voice preparation is persisted, but the desktop returns `OD_HANDOFF_VOICE_SESSION_UNSUPPORTED` because the current host exposes no supported exact Voice-session bridge.

The product does not ship a clipboard, manual-selection, or vague "open Codex" fallback. The unsupported direct Voice-opening capability is an explicit limitation, not a blocker for other learning workflows.

## 3. Personal Codex plugin

The plugin package contains:

- One or more teaching skills describing pedagogy and repeatable flows.
- A connection to the local MCP server.
- Optional references for CEFR-oriented rubrics and exercise formats.
- Optional MCP Apps UI only for compact in-conversation interactions that are materially better than text and are supported by the Codex host.

Current skills cover:

- German tutor session.
- Writing coach.
- Speaking partner and session summary.
- Placement or diagnostic assessment.
- Lesson and exercise designer.
- Curriculum researcher and curator.

These workflows remain consolidated where their trigger boundaries and safety rules overlap.

The curriculum-research workflow is a good candidate for a distinct skill because its source, citation, freshness, and approval rules differ substantially from a live tutoring session. Larger research batches can run as long-running Codex goals; the skill defines the workflow, while Goal mode defines the particular outcome and completion criteria for a run.

## 4. Local learning service and MCP server

Treat this as one logical learning service exposed through two local entry points: the Electron backend and a separately launchable STDIO MCP server. Both reuse the same domain and persistence packages and can open the same SQLite database safely. No always-running daemon is required.

Responsibilities:

- Read/update learner profile.
- Find relevant mistakes, vocabulary, goals, and past attempts.
- Create a lesson or exercise record.
- Save an attempt and structured feedback.
- Save a Voice session summary.
- Calculate due reviews and aggregate progress.
- Open an existing self-contained data root and expose optional export later if needed.
- Report curriculum coverage and gaps relevant to the learner.
- Store local personalized derivatives of reusable lessons.

SQLite should be the canonical store for private mutable learner data. The opinionated base curriculum remains in Git-tracked Markdown/YAML and is packaged into releases as a read-only snapshot. The user manages Git outside the application. JSON is used for structured AI exchange, staging, and portable export. See `storage-strategy.md`.

The service should keep deterministic data operations separate from model judgment. For example, Codex may propose a score and explanation; the service validates and stores the structured result.

## Content ownership boundary

The product separates three content classes:

1. **Version-controlled curriculum:** reusable CEFR maps, reviewed guides, lesson foundations, exercise templates, rubrics, source metadata, and content schemas. These should be safe and useful for another person who clones the repository.
2. **Private local learning data:** learner profile, attempts, corrections, progress, review schedule, personal vocabulary, interests, and personalized lesson variants. These belong in the local database or application data directory and must not be committed.
3. **Research staging and cache:** unreviewed drafts, fetched source notes, intermediate artifacts, and generated candidates. These remain local and ignored by Git unless deliberately promoted through review.

See `research-mode.md` for the promotion workflow.

## 5. Codex App Server integration

Codex App Server can embed Codex capabilities into another product, including account state, threads, approvals, and streamed events. Open Deutsch uses a limited subset for bounded desktop-native actions rather than recreating a general Codex client. A compatible Codex installation is a prerequisite; Open Deutsch does not bundle Codex and has no API-key fallback.

Desktop-native correction uses a limited App Server integration:

- Start or connect to a local App Server process over STDIO.
- Reuse Codex-managed authentication and expose only account/readiness status and supported recovery actions.
- Run bounded correction tasks and receive streamed lifecycle events.
- Read account and usage-limit state for useful UI feedback.
- Discover available models and supported reasoning efforts at runtime, then apply local per-workflow defaults or overrides.
- Keep approvals and credential handling outside the renderer process.
- Start each bounded learning operation with the minimum filesystem scope, tool access, approval policy, and injected learner context required for that operation.

The Codex adapter may wrap thread execution where helpful, but App Server over STDIO is the desktop integration boundary. The app must not request externally managed tokens or implement a parallel OAuth client.

This does not change the Voice boundary: App Server does not give Open Deutsch the Codex Voice UI.

## Local-only interpretation

The product boundary is **local data, cloud model**:

- User data is stored locally by Open Deutsch.
- The installed Codex client still communicates with OpenAI to provide model execution and Voice.
- No separate Open Deutsch cloud backend is introduced.
- Local MCP uses STDIO or loopback-only transport.

"Local-only" applies to learning-data storage and product infrastructure, not to the OpenAI traffic required for Codex and Voice. Onboarding and each AI-triggering surface must make that boundary understandable.

## Cross-cutting boundaries

- **Localization:** UI copy is translated through one EN/DE catalog. English is the default; learner-authored and curriculum content is not silently translated.
- **Visual system:** accessible React primitives, CSS Modules and shared design tokens, and one consistent Lucide icon vocabulary underpin all renderer features.
- **Logging:** Electron main, renderer, MCP, and App Server adapters emit bounded, redacted, human-readable local logs with correlation IDs. Prompts, learner text, tokens, and credentials are excluded by default.
- **Filesystem security:** the selected data root is validated, created with restrictive Linux permissions where possible, and protected against unsafe symlink traversal and accidental access outside its boundary.

## Official capability notes

- Official OpenAI documentation describes Codex App Server as the integration surface for rich Codex clients.
- Codex can connect to MCP servers; Open Deutsch uses a local STDIO MCP command packaged by the plugin.
- Plugins can package skills, MCP capabilities, and optional UI.
- MCP Apps UI is optional; the learning tools remain usable through ordinary Codex tool calls when no custom view is registered.
- Codex App Server is intended for deep embedding in a product; STDIO is the accepted local transport for Open Deutsch.

Sources:

- [Build plugins](https://developers.openai.com/plugins/build/plugins)
- [Connect from ChatGPT and Codex](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Codex App Server](https://developers.openai.com/codex/app-server)
