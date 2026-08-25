# Logging strategy

Status: current engineering guidance
Last updated: 2026-08-25

## Goal

Open Deutsch logs must help a person and a Codex development agent diagnose local failures without exposing learner content or requiring a cloud service.

## Human-readable format

Use stable English single-line operational records containing:

- ISO timestamp;
- severity;
- component;
- stable event/error code;
- run and session identifiers;
- correlation identifier when an operation crosses processes;
- semantic action, phase, outcome, and duration when applicable;
- concise readable message;
- small redacted key/value metadata when necessary.

Components include Electron main, renderer, persistence, MCP, App Server adapter, plugin integration, Make lifecycle, and packaging.

The canonical line shape is:

`timestamp LEVEL component CODE run=<id> session=<id> correlation=<id> action=<action> phase=<phase> outcome=<outcome> duration_ms=<duration> metadata=<safe-json> message`

The event vocabulary records meaningful screens and workflows, reads and writes, account actions, AI stages, MCP tool calls, lifecycle changes, and terminal outcomes. It does not record every render or click.

## File ownership

- `.runtime/logs/dev.log` and `prd.log` contain lifecycle, build, watcher, and Electron process output.
- The selected data root contains `logs/desktop.log`, `logs/app-server.log`, and `logs/mcp-server.log` for semantic application activity.
- The OS application configuration directory contains a minimal `bootstrap.log` until a data root is available.
- `make logs` and `make logs-errors` merge these files chronologically. Existing `desktop-app-server.log` files remain visible as legacy history and are not rewritten automatically.

## Privacy and redaction

Do not log by default:

- learner text, answers, corrections, or model output;
- raw prompts or structured model payloads;
- access tokens, device codes, cookies, or account identifiers;
- raw App Server, IPC, or MCP protocol messages;
- research source extracts or private staging content;
- complete local paths when a basename or redacted path is sufficient.

Redaction runs before serialization. The shared sink accepts only bounded, allowlisted metadata keys and values. Learner text, prompts, model output, credentials, account identifiers, raw IPC/MCP/App Server messages, private research content, and complete private paths never enter a serialized record.

## Storage and rotation

- Store normal operational logs below the selected data root.
- Before onboarding, permit only a minimal redacted bootstrap log in the OS application configuration location.
- Rotate at 5 MB and retain ten files per component.
- Provide Settings and Make actions to clear logs. `make logs-clear` clears lifecycle, bootstrap, and selected data-root component files after explicit confirmation.
- Do not silently change this into unbounded debug logging.

## User-facing errors

Recoverable errors show a plain-language message and stable reference code. The code maps to a log event without exposing implementation details. Preserve learner input and provide retry/cancel/recovery actions appropriate to the operation.

## Diagnostics

Create a redacted diagnostic bundle only after an explicit user action. Include versions, health, data-root/bootstrap status with visible path disclosure, migrations, plugin/MCP state, and bounded recent records from each operational component. Exclude learner text, model content, credentials, private research staging, and raw protocols.

Open Deutsch sends no telemetry, logs, or crash reports to a cloud service.

## Live journey privacy

Explicitly requested Playwright journeys use the selected learner root and its normal bounded, redacted operational logs. They do not capture screenshots, traces, videos, DOM dumps, prompts, learner text, or model output. A failure returns a stable bounded diagnostic code; if product cleanup cannot complete safely, it reports that manual cleanup is required and preserves the learner record.
