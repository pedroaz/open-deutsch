# Model selection and reasoning policy

Status: current product policy
Last updated: 2026-08-25

## Goal

Open Deutsch provides useful defaults while letting each learner choose which supported GPT-5.6 model and reasoning effort handles different AI workloads. A compatible Codex installation and its managed account are required; there is no API-key or alternate-provider path.

## Runtime discovery

For desktop-native AI actions, use Codex App Server as the source of truth:

- Read the signed-in account and `planType` when available.
- Call `model/list` and expose the returned `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` entries. Models outside this product set remain unavailable in Open Deutsch.
- Use each model's `supportedReasoningEfforts`, `defaultReasoningEffort`, and `isDefault` metadata.
- Offer exact `low`, `medium`, `high`, and `xhigh` effort choices when the selected model advertises them. Do not expose or send `max`, `ultra`, or other unusually expensive modes.
- Read current rate-limit state for useful status and error messages.
- Revalidate saved selections after sign-in, app updates, and model-catalog changes.

Do not infer entitlement from the displayed subscription name. Availability and limits can change independently; the runtime model list remains authoritative for whether each supported product model is available.

## Settings model

Expose an **Automatic** option plus optional per-workflow overrides:

| Workload | Product default | Purpose |
| --- | --- | --- |
| Writing correction | Automatic + Balanced | Reliable structured correction and explanations. |
| Exercise and lesson generation | Automatic + Balanced | Good content without unnecessary delay. |
| Contextual helper | Automatic + Fast | Responsive focused explanations. |
| Curriculum research | Automatic + Deep | More analysis for infrequent, source-heavy work. |

The Context Helper's dedicated **Translate** action is a cost-optimized exception to the saved
helper preference. It requests GPT-5.6 Luna with `low` effort when that exact runtime combination
is available. If it is not available, normal runtime fallback resolution applies. Open-ended
context questions continue to use the learner's saved Contextual helper preference.

The semantic effort presets resolve against the selected model's supported efforts:

- **Fast:** prefer `low`; otherwise use the model default.
- **Balanced:** use the model's advertised default reasoning effort.
- **Deep:** prefer `high`; otherwise use the closest supported ordinary effort, falling back to the model default. Do not automatically select unusually expensive maximum/pro modes.
- **Exact:** learners may select Light (`low`), Medium (`medium`), High (`high`), or Extra High (`xhigh`) when explicitly advertised for that model.

Committed defaults should remain semantic rather than naming a model that may later disappear. A learner override stores the selected model identifier and effort locally.

## User experience

The Settings/Account screen should:

- show account and plan information when App Server provides it;
- show only picker-visible Sol, Terra, and Luna models returned by the runtime;
- group overrides by workload instead of exposing one misleading global model setting;
- explain the speed/quality tradeoff in plain language;
- offer **Restore automatic defaults**;
- show rate-limit failures and reset information when available.

Do not put a model picker on every ordinary exercise. A temporary per-run override can be added later if a real need appears.

## Fallback behavior

If a saved model or effort is no longer available:

1. Keep the saved preference so it can become valid again later.
2. Use the current runtime default for the operation.
3. Show a non-blocking notice explaining the temporary fallback.
4. Never silently substitute a different named model and present it as the learner's chosen model.

If the account reaches a usage limit, preserve the exercise and offer retry after reset. The app should not automatically switch to a different billable authentication method.

## Surface boundary

These settings directly control only AI turns initiated by the Open Deutsch backend through App Server. Voice and tasks started in the Codex desktop UI follow that host's model controls. The plugin may read the learner's preference and recommend an appropriate effort, but it should not claim it can force a model when the host does not expose that control.

## Official capability basis

The current Codex App Server documentation exposes runtime model discovery with supported/default reasoning efforts, per-turn model and effort overrides, account plan information when available, and account rate-limit reads:

- [Codex App Server](https://developers.openai.com/codex/app-server)

The supported product model IDs follow the documented GPT-5.6 Sol, Terra, and Luna family. Subscription availability and limits remain runtime-discovered.
