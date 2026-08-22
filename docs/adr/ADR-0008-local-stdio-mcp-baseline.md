# ADR-0008 — Local STDIO MCP baseline

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-018, D-004, D-055, D-056, [SPIKE-IMP-018](../spikes/SPIKE-IMP-018-local-stdio-mcp.md)

## Context

Open Deutsch needs an independently launchable local MCP process that Codex owns over STDIO. Before production tools, contracts, and SQLite handlers exist, the repository needs executable evidence that the selected TypeScript SDK can expose discoverable read/write tools, return content useful to a model, persist within a disposable root, detect a stale data-root generation, and shut down its child process cleanly. The SDK recently moved from a monolithic v1 package to split v2 packages and a new protocol era, so package and compatibility choices must be explicit.

## Decision

Pin `@modelcontextprotocol/server` and `@modelcontextprotocol/client` to `2.0.0` and direct schema dependency `zod` to `4.4.3`. Build servers with `McpServer` and the SDK-owned `serveStdio` factory. Use `StdioClientTransport` for protocol tests so the client spawns and owns the exact built server command. Keep the server local STDIO-only and reserve STDOUT exclusively for JSON-RPC.

Leave `serveStdio`'s default legacy support enabled. This serves the established 2025-era initialization used by the accepted Codex runtime while retaining the v2 server package; Open Deutsch does not require or force the 2026 protocol era for its baseline.

Return both concise text `content` and matching object `structuredContent` from successful tools, with explicit input/output schemas and conservative annotations. Return bounded English tool errors with stable diagnostic codes for operational failures. Validate the bootstrap generation on every call and reject stale reads and writes. Serialize each server instance's write transaction so concurrent tool calls cannot share a temporary file or lose a revision. Keep this spike's note tools explicitly disposable and do not treat them as the production tool inventory.

## Evidence

[SPIKE-IMP-018](../spikes/SPIKE-IMP-018-local-stdio-mcp.md) records a built TypeScript server spawned by a programmatic SDK client. The client initializes, lists exactly one spike read and one spike write tool, validates their schemas/descriptions/annotations, reads empty state, writes a bounded note, reads the persisted result, observes model-readable text plus structured content, receives a tool error for invalid input, rejects a stale bootstrap generation, and closes the child.

MCP Inspector `2.2.0` separately listed the same two tools through its CLI against a disposable configuration. No Codex account, model, normal host MCP configuration, learner root, or network MCP endpoint was used.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" pnpm exec tsc -b apps/mcp-server/tsconfig.json --force
PATH="<Node-24.18.1-bin>:$PATH" node --test --test-global-setup=./tests/support/node-disposable-data.mjs tests/mcp-stdio-spike.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

The one-time manual diagnostic used pinned `@modelcontextprotocol/inspector@2.2.0` in CLI mode with a disposable HOME/storage/data/bootstrap environment and explicit `-e` values for the spike enable flag, test mode, owned run ID, data root, and bootstrap, then invoked `tools/list` against the built server.

## Rejected alternatives

- **Adopt the monolithic `@modelcontextprotocol/sdk` v1 line:** Rejected. The split v2 packages are the current stable TypeScript SDK surface and can still serve legacy clients.
- **Force only the 2026 protocol era:** Rejected. The accepted Codex runtime must remain compatible; no Open Deutsch requirement depends on the modern-only handshake.
- **Use HTTP, SSE, or a public endpoint:** Rejected. Codex owns a local child over STDIO, and a network listener expands the threat and packaging surface without product value.
- **Test only handlers in memory:** Rejected. The acceptance boundary is the exact built child command, initialization, JSON-RPC transport, and teardown.
- **Use the Inspector as the automated gate:** Rejected. The SDK client test is deterministic; Inspector is pinned manual diagnostic evidence and may download tooling.
- **Promote spike note tools into the product inventory:** Rejected. Production tool names, schemas, permissions, persistence, and errors belong to IMP-107–116 and their prerequisite contracts.

## Accepted boundaries and consequences

- The server writes no banners or diagnostics to STDOUT. Startup/protocol diagnostics are stable redacted codes on STDERR.
- The client transport owns process spawn and termination; tests close it in `finally` and require the child PID to be cleared.
- All five custom server capability variables must be passed explicitly by clients such as Inspector because safe default inheritance filters them.
- Root generation is captured at startup and re-read per call. A mismatch fails both reads and writes until the process restarts or a later supported reload contract is implemented.
- The spike state is a small atomic JSON file under an owned disposable root. It is not a production persistence choice and does not bypass the future shared SQLite adapter.
- Runtime schema-system selection for shared IPC/MCP/AI/persistence contracts remains with IMP-022; direct Zod use here satisfies the selected SDK's tool-schema surface only.
- Plugin registration, packaged helper paths, installed-host activation, production tools, and cross-surface handoff remain with later owning items.

## Supersession

None.
