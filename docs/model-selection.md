# Model selection and reasoning policy

Status: accepted product direction  
Last updated: 2026-08-15

## Goal

Open Deutsch should work across different personal Codex subscriptions without hardcoding a subscription-to-model matrix. It provides useful defaults while letting each learner choose which available model and reasoning effort handles different AI workloads. A compatible Codex installation and its managed account are required; there is no API-key or alternate-provider path.

## Runtime discovery

For desktop-native AI actions, use Codex App Server as the source of truth:

- Read the signed-in account and `planType` when available.
- Call `model/list` to populate the model picker from models currently available to that runtime/account.
- Use each model's `supportedReasoningEfforts`, `defaultReasoningEffort`, and `isDefault` metadata.
- Read current rate-limit state for useful status and error messages.
- Revalidate saved selections after sign-in, app updates, and model-catalog changes.

Do not infer entitlement from the displayed subscription name. Availability and limits can change independently; the runtime model list is authoritative.

## Settings model

Expose an **Automatic** option plus optional per-workflow overrides:

| Workload | Product default | Purpose |
| --- | --- | --- |
| Writing correction | Automatic + Balanced | Reliable structured correction and explanations. |
| Exercise and lesson generation | Automatic + Balanced | Good content without unnecessary delay. |
| Contextual helper | Automatic + Fast | Responsive focused explanations. |
| Curriculum research | Automatic + Deep | More analysis for infrequent, source-heavy work. |

The semantic effort presets resolve against the selected model's supported efforts:

- **Fast:** prefer `low`; otherwise use the model default.
- **Balanced:** use the model's advertised default reasoning effort.
- **Deep:** prefer `high`; otherwise use the closest supported ordinary effort, falling back to the model default. Do not automatically select unusually expensive maximum/pro modes.
- **Exact:** advanced users may select any reasoning effort explicitly advertised for that model.

Committed defaults should remain semantic rather than naming a model that may later disappear. A learner override stores the selected model identifier and effort locally.

## User experience

The Settings/Account screen should:

- show account and plan information when App Server provides it;
- show only picker-visible models returned by the runtime;
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

Exact model names, subscription availability, and limits are intentionally not frozen in this plan.
