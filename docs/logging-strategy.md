# Logging strategy

Status: current engineering guidance
Last updated: 2026-08-15

## Goal

Open Deutsch logs must help a person and a Codex development agent diagnose local failures without exposing learner content or requiring a cloud service.

## Human-readable format

Use stable English single-line text records containing:

- ISO timestamp;
- severity;
- component;
- stable event/error code;
- run/session identifier;
- correlation identifier when an operation crosses processes;
- concise readable message;
- small redacted key/value metadata when necessary.

Components include Electron main, renderer, persistence, MCP, App Server adapter, plugin integration, Make lifecycle, and packaging.

## Privacy and redaction

Do not log by default:

- learner text, answers, corrections, or model output;
- raw prompts or structured model payloads;
- access tokens, device codes, cookies, or account identifiers;
- raw App Server, IPC, or MCP protocol messages;
- research source extracts or private staging content;
- complete local paths when a basename or redacted path is sufficient.

Redaction runs before serialization. Tests use canary secrets and learner text to prove they do not appear in logs, diagnostics, screenshots, or failure artifacts.

## Storage and rotation

- Store normal operational logs below the selected data root.
- Before onboarding, permit only a minimal redacted bootstrap log in the OS application configuration location.
- Rotate at 5 MB and retain ten files per component.
- Provide Settings and Make actions to clear logs.
- Do not silently change this into unbounded debug logging.

## User-facing errors

Recoverable errors show a plain-language message and stable reference code. The code maps to a log event without exposing implementation details. Preserve learner input and provide retry/cancel/recovery actions appropriate to the operation.

## Diagnostics

Create a redacted diagnostic bundle only after an explicit user action. Include versions, health, data-root/bootstrap status with visible path disclosure, migrations, plugin/MCP state, and relevant bounded logs. Exclude learner text, model content, credentials, private research staging, and raw protocols.

Open Deutsch sends no telemetry, logs, or crash reports to a cloud service.

## Live journey privacy

Explicitly requested Playwright journeys use the selected learner root and its normal bounded, redacted operational logs. They do not capture screenshots, traces, videos, DOM dumps, prompts, learner text, or model output. A failure returns a stable bounded diagnostic code; if product cleanup cannot complete safely, it reports that manual cleanup is required and preserves the learner record.
