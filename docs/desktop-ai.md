# Desktop-native AI

Status: current product architecture
Last updated: 2026-08-15

## Purpose

Open Deutsch should use Codex in two ways:

1. Open-ended tutoring, Voice, and research in the Codex desktop surface.
2. Bounded AI actions inside the Open Deutsch desktop app when switching applications would interrupt a focused exercise.

The first embedded experiences are **Correct now** for German writing and a selection-aware helper panel beside the editor.

## Product boundary

Desktop-native AI actions should:

- have a clear button or exercise transition;
- use structured inputs and outputs;
- expose progress, cancellation, retry, and errors;
- save learning evidence to the local learning store;
- follow the selected teaching profile;
- avoid exposing a general agent terminal or unrestricted chat by default.

All audio—including speaking, listening, recording, and playback—and long conversational teaching remain in the Codex desktop app.

## Proposed correction flow

1. The learner writes German text in a desktop exercise.
2. The learner selects **Correct now**.
3. The application loads the learner level, current exercise, Strict Corrector profile, and relevant recurring mistakes.
4. The backend starts a bounded local Codex task.
5. The UI shows progress and allows cancellation.
6. Codex returns a validated structured correction result.
7. The app renders an original-versus-corrected comparison and explanations.
8. The app automatically stores the attempt, correction, feedback, and mistake evidence locally.
9. Vocabulary remains in a candidate state until the learner adds it to active review.
10. The learner may highlight any original text, correction, or explanation and ask the helper a follow-up question.

## Contextual helper flow

The helper receives only the context needed for the active learning question:

- highlighted span and its containing sentence;
- original and corrected versions when relevant;
- mistake category and existing explanation;
- current exercise objective;
- learner CEFR level;
- active teaching profile;
- a small amount of relevant mistake history when useful.

The helper supports multi-turn questions within the attempt. Its thread identifier may be stored as runtime state, but the canonical learning history should store structured questions, answers, or annotations rather than depend on a raw Codex thread forever.

The helper may suggest improvements, examples, translations, or mini-exercises. It remains explanation-only with respect to the learner's writing: it must not alter text or expose direct-apply editing actions.

## Authentication direction

Require an installed, compatible, authenticated Codex client rather than implementing an Open Deutsch account system:

- The desktop backend starts or connects to Codex App Server locally.
- Codex owns login, token persistence, and refresh.
- The renderer receives only account/readiness state and supported recovery guidance.
- Raw credentials must not be stored in the learner database or passed through ordinary renderer state.
- Open Deutsch has no API-key input, fallback provider, or separately implemented OAuth client.

The Codex SDK can be evaluated as a convenience layer for thread execution. App Server remains the desktop integration baseline.

## Model and reasoning direction

The backend should query App Server for the current visible model catalog and supported reasoning efforts. The app should offer semantic Automatic/Fast/Balanced/Deep defaults plus advanced exact choices, with separate preferences for correction, generation, the contextual helper, and curriculum research.

Do not hardcode which model belongs to a subscription tier. Use the runtime catalog for availability and account/rate-limit endpoints for status. If a saved choice disappears, require a supported available choice or explicit Automatic behavior; do not silently substitute an unrelated provider or API-key path.

These controls apply to desktop-originated App Server turns. Voice and tasks initiated inside Codex continue to use the Codex host's own model controls.

See `model-selection.md` for the full product policy.

## Runtime shape

```text
Electron renderer
  -> typed desktop IPC
Electron main/backend
  -> local learner service and database
  -> Codex App Server over STDIO
       -> existing Codex authentication
       -> bounded correction thread/events
```

Do not expose App Server directly to the renderer or bind an unauthenticated network listener. STDIO keeps the integration local and gives the Electron backend ownership of process lifecycle. Each action supplies an explicit working directory, bounded filesystem sandbox, approval policy, tool allowlist, timeout/cancellation policy, and minimum learner context. Treat curriculum/source text and stored learner content as untrusted data rather than executable instructions.

Before the first AI request, the UI explains that learning data is stored locally but selected content is sent to OpenAI through Codex for processing. The same distinction remains visible from Settings and at sensitive action boundaries.

## Result contract candidate

The first correction result may include:

- corrected text;
- span-level or sentence-level changes;
- mistake category;
- concise explanation;
- severity or learning priority;
- more natural alternative;
- vocabulary candidates;
- inferred grammar topics;
- suggested follow-up exercise;
- uncertainty or caveats.

All candidate fields are in scope. The UI should prioritize corrected text, inline changes, and the mistake list, with deeper explanations and follow-up material progressively revealed.

## Persistence policy

- Automatically save the original text, corrected text, correction metadata, mistakes, explanations, and completion time locally.
- Allow the learner to delete an attempt or correct incorrectly inferred metadata.
- Preserve enough information to show mistake history after the exercise.
- Store vocabulary as candidates until the learner explicitly adds items to the active review deck.
- Do not require raw Codex thread history to reconstruct the learning record.

## Verification boundary

Deterministic and explicitly confirmed live verification cover:

- Codex-managed browser or device-code login when the existing installation is signed out;
- account restoration after restart and logout;
- German correction quality for A2-to-B1 writing;
- reliable structured results and schema validation;
- response time, streaming progress, and cancellation;
- plan and rate-limit reporting;
- behavior when Codex is unavailable or the learner is signed out;
- behavior for incompatible Codex versions, denied approvals, unsafe data-root paths, prompt-injection-like source text, and model unavailability;
- separation between Codex thread state and canonical local learning data.

If a future Codex runtime changes these capabilities, update the narrow invocation adapter while preserving the UI, validated result contracts, and local learning store.

## Official capability references

- [Codex App Server](https://developers.openai.com/codex/app-server)
