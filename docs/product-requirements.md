# Product requirements

Status: current product requirements
Last updated: 2026-08-15

## Product idea

Open Deutsch is a local-first personal German teacher that combines:

1. The Codex desktop experience for conversation, reasoning, content generation, correction, and Voice.
2. A desktop learning application for structured practice, durable progress, and local data.
3. A personal Codex plugin that supplies teaching workflows and lets Codex read and update the learner's local learning state.

The product should feel like one teacher with two complementary surfaces, not two separate learning products.

The personal Codex plugin and local STDIO MCP integration are part of the core architecture. The plugin supplies Codex-facing teaching/research workflows; MCP provides controlled access to the canonical local learner state. Public plugin submission, a public HTTPS MCP endpoint, and MCP Apps UI are outside the supported personal product.

## Product principles

- **Codex-first:** Use Codex for adaptive teaching and conversation instead of recreating a general chat or voice client.
- **Local-first data:** Learning history, learner profile, generated material, attempts, scores, and preferences are stored on the user's device; selected text and minimized context are sent to OpenAI only for invoked AI/Voice work.
- **Four-skill coverage:** Writing, speaking, reading, and listening are first-class learning areas.
- **Level without labeling:** Use CEFR to calibrate content and curriculum coverage, but do not make the learner's level label the center of the experience.
- **Adaptive:** Exercises and lessons respond to current level, goals, weaknesses, prior mistakes, and interests.
- **Reviewable progress:** The learner can see what was attempted, what changed, and what should be practiced next.
- **Human control:** Corrections, scores, inferred level, and generated learning plans remain understandable and editable.

## Supported user

Open Deutsch serves one adult learner on one Linux machine. It does not provide multi-user product features, but the repository remains understandable and configurable enough for another person to clone and run for themselves.

The initial learner is currently around A2 and is working toward B1. Generated curricula, lessons, exercises, and assessment rubrics should initially cover A1 through B2, with most personalization centered on the A2-to-B1 transition.

## Core feature areas

### 1. Learner profile and goals

- On first run, choose the private data location, verify the existing Codex installation/account, create the local learner profile, select an approximate starting level, record the everyday-life-in-Germany goal and available study time, and choose an initial teaching profile.
- Keep placement optional and skippable during onboarding.
- Record current or estimated CEFR level.
- Record target level, motivation, interests, preferred topics, and available study time.
- Record correction preferences, such as immediate versus end-of-exercise feedback.
- Support multiple AI teaching profiles so the learner can switch correction timing, explanation language, tone, and teaching behavior by activity.
- Track strengths, weaknesses, recurring mistakes, and recommended next steps.
- Maintain a lightweight weekly study plan as an advisory planning artifact.
- Create or replace the plan on demand from either Codex or the desktop app; do not require a scheduled background job.
- Do not require completion checkboxes, automatic progress reconciliation, or direct links between plan items and saved attempts.

### 1a. Teaching-profile defaults

- Use **Conversation Partner** by default for Codex and Voice conversations.
- Use **Strict Corrector** by default for **Correct now**, writing review, and targeted mistake practice.
- Allow the learner to switch profile for an individual session without changing the defaults everywhere.

### 1b. Desktop dashboard and navigation

- Open on a main dashboard that summarizes the useful current learning context without turning it into a formal progress tracker.
- Provide quick entry points into writing practice, mistake review, vocabulary review, and the weekly plan.
- Show the current weekly plan, quick practice actions, recent corrections, recurring mistakes, and vocabulary due for review.
- Use persistent, collapsible navigation for **Dashboard**, **Practice**, **Writing**, **Vocabulary**, **History**, **Weekly plan**, and **Settings/Account**. The navigation provides a compact activity switcher for writing correction, practice generation, contextual help, and curriculum research, then lets the learner choose a runtime-reported model and one of that model's supported reasoning levels. The contextual helper is independently collapsible. Practice contains a filterable generated-quiz library with direct open and delete actions plus grammar, reading, Codex listening/speaking, and diagnostic entry points. Confirmed deletion of a started quiz cascades through its attempts, answers, feedback, related History entries, and unconfirmed vocabulary candidates; confirmed vocabulary continues to block deletion. Quiz generation offers explicit 3-, 6-, and 10-exercise lengths. An opened generated quiz uses a focused workspace with lesson notes available progressively; mistake review is available from History and contextual shortcuts.
- Keep curriculum research, coverage review, and authoring in Codex and repository files. The desktop does not become a second research agent or Git client.

### 2. Placement and diagnostic assessment

- Offer an optional lightweight placement flow; do not block onboarding on a test.
- Assess grammar, vocabulary, reading, writing, listening, and speaking where practical.
- Produce a transparent CEFR-oriented estimate rather than a false claim of formal certification.
- Save evidence, scores, uncertainty, and recommended starting material.
- Allow targeted reassessment later.
- Continue diagnosing strengths and weaknesses gradually through normal learning activity.

### 3. Writing

- Generate prompts appropriate to level, interests, and learning goals.
- Support short answers, messages, essays, and practical writing scenarios.
- Provide a desktop-native **Correct now** action that evaluates text without requiring the learner to switch to a visible Codex conversation.
- Correct grammar, vocabulary, register, spelling, and naturalness.
- Explain corrections at the learner's level.
- Compare original and corrected versions.
- Show corrected text, inline changes, categorized mistakes, concise explanations, a natural alternative, vocabulary candidates, and a suggested follow-up exercise. Use progressive disclosure so the initial result remains readable.
- Provide a selection-aware helper panel beside the editor. The learner can highlight text or a correction and ask contextual questions such as, "Why is this dative?"
- Support multi-turn follow-up questions without losing the selected sentence, exercise, correction, or learner level.
- Let the helper explain and suggest, but never modify the learner's text or present direct-apply editing actions.
- Extract recurring mistakes and turn them into future practice.

### 4. Speaking

- Use Codex Voice for live conversation, role-play, oral drills, and spoken assessment.
- Let the learner choose scenarios, difficulty, correction timing, and speaking goals.
- Save a structured session summary: topic, vocabulary, observed issues, feedback, and next steps.
- Keep live Voice in Codex rather than recreating it in the companion application.
- Persist prepared structured Voice activities. Direct opening of an exact Codex Voice session is unavailable because the current host exposes no supported external bridge. Do not provide clipboard or manual prompt handoff UI.
- Do not store raw audio or full Voice transcripts by default.

### 5. Reading

- Generate or import level-appropriate passages.
- Support comprehension questions, summaries, vocabulary-in-context, and inference exercises.
- Reveal translations, hints, and explanations progressively.
- Save reading attempts, difficult words, and comprehension results.

### 6. Listening

- Use Codex Voice for every audio interaction.
- Support gist, detail, dictation, cloze, and response exercises.
- Let Open Deutsch prepare and persist the structured activity. Direct opening of the exact related Codex Voice session is unavailable in the current host.
- Save explicit structured comprehension results, difficult vocabulary, and next steps through MCP.
- Do not generate, import, store, or play audio in Open Deutsch.

### 7. Grammar lessons

- Generate focused explanations with examples suitable for the learner's level.
- Connect explanations to the learner's actual mistakes.
- Provide guided practice, free production, hints, and review.
- Track mastery by grammar topic without pretending that one score fully represents competence.

### 8. Vocabulary lessons and review

- Build vocabulary sets from learner goals, content, and mistakes.
- Store lemma, meaning, gender/plural where relevant, example usage, and source context.
- Provide recognition and production exercises.
- Schedule review using the documented deterministic spaced-repetition model.
- Let the learner edit, suspend, or remove items.

### 9. Custom lessons and exercises

- Let the learner ask naturally for a lesson, scenario, topic, or exercise type.
- Let Codex assemble a session from the learner profile and local history.
- Generate the exercise content with AI from structured exercise formats and learner context rather than relying on a large hand-authored exercise bank.
- Favor short, simple, untimed exercises with optional hints. Generated short-answer exercises provide at least two progressive hints that narrow vocabulary or intent and then scaffold the required grammar toward one accepted response. The app adds a final incomplete sentence frame derived from that response without revealing it in full.
- Show feedback after every submitted answer. Never advance automatically after grading; require an explicit learner action after displaying whether the answer is correct, almost correct, or incorrect and any AI explanation. Keep the completed explanation visible on the current exercise in a scrollable, clearly separated feedback layout.
- Begin with free writing, short-answer production, fill-in-the-blank, sentence correction, multiple choice, and vocabulary recall.
- Evaluate generated sentence-correction exercises locally against their accepted corrections. Ignore capitalization, spacing, and sentence-ending punctuation differences; report a distinct almost-correct result for a few spelling or diacritic differences when the answer is closer to an accepted correction than to the original erroneous sentence. Reveal an accepted correction immediately after an unmatched answer. Do not start a model request for this closed exercise type.
- Support structured exercise formats in the desktop app and conversational formats in Codex. During a generated quiz, preserve per-exercise answers, feedback, and revealed hints while the learner navigates backward and forward only across exercises already reached in the current run; never allow navigation to skip into untouched exercises.
- Discard unused generations. Once an exercise starts, save the content required to understand it together with the learner's answers, feedback, mistakes, and result as an attempt.
- Generated quizzes do not resume interrupted in-memory progress. Starting an interrupted quiz again abandons the stale attempt set and immediately creates a fresh set from the same generated quiz.
- When asked what to practice, let Codex read the weekly plan, recent mistakes, due vocabulary, and curriculum progress, then recommend one primary activity and a few alternatives.
- Recommendations may use the weekly plan as context but should not automatically mark it complete or rewrite it after an activity.
- Where the host supports it, hand structured activities from Codex to the exact exercise in the desktop app.
- Let the desktop app offer a path back to a related Codex task when the host supports a reliable contextual handoff.
- Preserve context locally and use exact cross-surface routing only where the host exposes a supported mechanism. Represent unsupported routes explicitly rather than shipping clipboard or manual continuation UI.

### 10. Curriculum research and authoring

- Provide a Codex research workflow for identifying important A1–B2 topics, beginning with A1 and everyday life in Germany.
- Organize reviewed curriculum by CEFR band and then real-world topic. Connect each topic to communicative goals, grammar, vocabulary, exercises, and source metadata.
- Compare proposed content against a curriculum map so research fills known gaps instead of producing disconnected lessons.
- Prioritize official language frameworks and trusted German institutions, then reputable pedagogical sources where they improve teaching quality.
- For changing everyday-life information, prefer primary German public-service sources and preserve citations, retrieval dates, source notes, and review dates.
- Generate reusable guides, lesson foundations, vocabulary sets, exercise ideas, and teacher notes.
- Distinguish reusable curriculum from personalized learner material.
- Stage generated research for human review before promoting it into the version-controlled curriculum.
- Present the source summary and proposed file changes for explicit approval before writing into `content/curriculum`; the maintainer performs all Git operations externally.
- Do not require a desktop curriculum-management or Research screen.
- Revisit time-sensitive everyday-life guides when their sources or review dates become stale.

### 11. Progress and history

- Show recent sessions and attempts.
- Provide one general History area with filters by skill, activity type, date, curriculum topic, and mistake category.
- Reconstruct saved activities and feedback, allow deletion, and offer **Practice this again** without mutating weekly-plan completion.
- On an opened, unstarted generated activity, offer **Delete prepared lesson** behind destructive confirmation. Delete it only when no exercise has started, no retained MCP feedback exists, and no sourced vocabulary has been confirmed; otherwise preserve all learner evidence and show a recoverable error.
- Show progress across the four skills and selected grammar/vocabulary areas.
- Surface recurring mistakes and overdue review.
- Group mistakes by grammar or vocabulary category and date.
- Highlight recurring patterns and provide **Practice this** to create a targeted exercise.
- Let the learner inspect and correct stored inferences.
- Let the learner choose the main local data directory during onboarding instead of silently fixing it to the operating system default.
- Keep only the minimal bootstrap configuration needed to find that directory in the standard per-user application configuration location.
- Keep all application-managed learner data together under that selected root so the folder itself is the portable unit.
- Do not provide automatic backups, managed snapshots, or an in-app move/copy workflow.

### 12. Desktop-native AI actions and authentication

- Allow selected bounded AI operations to run entirely within the desktop app UI.
- Begin with German writing correction and structured feedback.
- Include a contextual helper chat attached to the current writing attempt; it is scoped to explanations and learning assistance rather than acting as an unrelated general chat.
- Reuse the learner's personal Codex account through Codex-managed authentication rather than maintaining an Open Deutsch account.
- Require a compatible existing `codex` installation, reuse managed account state when available, and show a clear upgrade/setup state when it is missing or unsupported.
- Do not support API-key authentication or a separate billable OpenAI path.
- Keep authentication credentials in the Codex-managed local store; the application should not implement or persist raw account tokens itself.
- Show signed-in state, plan information when available, usage-limit errors, progress, cancellation, and retry behavior.
- Discover the models and reasoning efforts available to the signed-in runtime instead of hardcoding model access by subscription name.
- Provide Automatic defaults and local per-workflow overrides for correction, exercise generation, contextual help, and curriculum research.
- Use shared semantic defaults of Balanced for correction/generation, Fast for contextual help, and Deep for curriculum research.
- Keep personal overrides in the local learner database and expose the controls in Settings/Account.
- Temporarily fall back to the runtime default with a visible notice if a saved model or effort is unavailable.
- Persist only the learning input and result required by the product; do not treat Codex thread history as the canonical learner database.
- Automatically save correction attempts and their mistake evidence locally so the learner can revisit them. Allow deletion and correction of stored records.
- Treat extracted vocabulary as candidates; add words to the active review deck only after learner confirmation.
- Keep Voice in the Codex desktop app even when bounded text actions can run inside Open Deutsch.
- Run bounded desktop turns in an isolated temporary working directory with restricted filesystem access, no network, no shell, no unrelated tools, and no interactive approval path.

### 13. Installation and local integration

- During onboarding, detect whether the personal Codex plugin and local MCP command are available.
- Offer a guided **Install Codex integration** experience and Make commands using supported scoped marketplace/CLI mechanisms. Do not use under-development App Server plugin APIs in production or modify unrelated plugins.
- Optimize the initial repository workflow for a documented pnpm setup and clear desktop/plugin development commands.
- Distribute the Linux application as an AppImage with a guided scoped plugin-installation workflow.

### 14. Visual design and localization

- Ship light mode initially with a clean, warm, text-forward desktop design and a simple OD mark.
- Use React Aria, repository-owned components, CSS Modules/design tokens, and Lucide consistently.
- Important icon actions include labels; every component defines accessible interaction states and never relies on color alone.
- Support English and German UI through i18n, with English always the initial default.
- Keep UI locale separate from the configurable teaching/explanation language.
- Provide a development component gallery and representative visual checks at standard/narrow widths in both locales.

### 15. Developer and diagnostic experience

- Make is the human-facing command surface and delegates to complete pnpm workflows.
- Provide background `make dev`, build-and-run `make prd`, `make start` alias, safe tracked `make kill`, status/log/quality/test/package commands, and scoped plugin commands with English `make help` descriptions.
- Use strict TypeScript, ESLint flat configuration, Prettier, accessibility/Electron-security/package-boundary rules, and no mandatory Git hooks.
- Maintain concise Codex-focused root/scoped agent instructions, a runbook, and design guidance.
- Produce bounded human-readable redacted local logs; do not send telemetry or crash reports.
- Support ordinary error boundaries, recoverable states, safe transactions, graceful shutdown, and stale-PID cleanup without a dedicated crash-recovery product.

## Product boundaries

- Formal language certification or exam accreditation.
- Multi-user accounts and synchronization.
- Social features, teacher marketplaces, or classroom management.
- A custom cloud backend.
- Rebuilding a general-purpose live voice assistant.
- Public plugin publication.
- Automatic backups, managed data snapshots, and application-level database encryption.
- Windows work, local audio functionality, automatic AppImage updates, application-managed Git operations, clipboard/manual handoff UI, telemetry, and cloud crash reporting.

## Product acceptance

- Codex-created activities can appear in the desktop app without manually re-entering learning context; unsupported desktop-originated Voice opening is clearly represented without a clipboard or generic-launch fallback.
- A Codex session can safely read and update local learning state.
- At least one writing flow and one speaking flow produce useful saved evidence.
- The desktop app makes history and next actions clearer than a folder of chat transcripts.
- The system still works as a conversational teacher when custom plugin UI is unavailable.
- Static formatting, lint, and strict TypeScript checks remain fast enough for an agent to run repeatedly.
- User-requested desktop journeys run on demand against the production app, connected Codex account, and selected learner data, with an immediate warning and visible product cleanup but no confirmation prompt.

A target date for B1 remains optional and does not change scheduling behavior. Open Deutsch never generates, imports, stores, or plays audio; imported text follows the same local-storage, cloud-processing disclosure, and untrusted-content controls as other learning material.
