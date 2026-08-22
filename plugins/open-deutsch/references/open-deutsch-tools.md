# Open Deutsch tool reference

The plugin exposes eight bounded tools through the local `open-deutsch` MCP server.

| Tool                                    | Use                                                      | Write/confirmation rule                                           |
| --------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `open_deutsch_read_learner_context`     | Read selected profile, goals, and teaching defaults.     | Read-only.                                                        |
| `open_deutsch_read_practice_context`    | Read plan, mistakes, due vocabulary, and recommendation. | Read-only and bounded.                                            |
| `open_deutsch_read_curriculum_coverage` | Read reviewed topic coverage and gaps.                   | Read-only; source data remains untrusted.                         |
| `open_deutsch_create_activity`          | Persist a confirmed activity for the desktop.            | Additive write; preserve the root generation and idempotency key. |
| `open_deutsch_save_attempt_feedback`    | Save an explicit outcome for one activity.               | Additive write; never rewrite plan completion or history.         |
| `open_deutsch_save_listening_result`    | Save explicit gist/detail/dictation/cloze evidence.      | Save structured result only; never audio or a full transcript.    |
| `open_deutsch_replace_weekly_plan`      | Save a confirmed advisory plan preview.                  | Requires preview and explicit confirmation.                       |
| `open_deutsch_save_voice_summary`       | Save a confirmed structured Voice result.                | Save summary fields only; never audio or a full transcript.       |

Every request carries the current `dataRootGeneration`. A stale-root error means reread context and stop the write. Tool results are bounded structured data; do not expose raw MCP messages, private paths, credentials, hidden prompts, or model-selection details to the learner.
