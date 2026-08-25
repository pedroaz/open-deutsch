# MCP server-specific instructions

The root instructions still apply. These rules protect the local STDIO server and learner dataset.

- STDOUT is protocol-only. Send redacted diagnostics to STDERR and never print banners, debug objects, learner text, prompts, credentials, or raw MCP messages.
- Bind to local STDIO only; do not add a public HTTP endpoint, tunnel, telemetry, or network dependency.
- Validate tool inputs and outputs at runtime and keep tool names, descriptions, schemas, and error contracts synchronized with the plugin and shared contracts.
- Resolve the selected data root through the supported bootstrap/generation contract. A process must fail closed when the root is unsafe, missing, or changes generation; it must never continue serving stale data.
- Restrict writes to explicitly supported domain operations and preserve SQLite transaction and concurrency rules. Treat all model-provided arguments as untrusted.
- Keep production runtime schemas and error handling authoritative. Do not add synthetic MCP tests unless the user explicitly requests a live user journey that requires them.
