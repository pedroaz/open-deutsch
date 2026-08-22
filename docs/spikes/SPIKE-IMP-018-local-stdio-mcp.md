# SPIKE-IMP-018 — Local STDIO MCP path

- **Status:** complete
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-018, D-004, D-055, D-056, [ADR-0008](../adr/ADR-0008-local-stdio-mcp-baseline.md)
- **Time/scope bound:** one built disposable STDIO server, one programmatic client journey, and one Inspector CLI listing; no Codex/model/account or host installation

## Question and accepted constraints

Can the pinned Node/TypeScript stack launch a local MCP server through the exact built STDIO command, discover and call one read plus one write tool, return model-readable results, reject stale roots, and cleanly stop without touching learner or host state?

The server must use STDOUT only for protocol messages, must receive an explicit disposable bootstrap/data root, and must fail closed when that bootstrap is missing or changes generation. The spike may prove transport with tiny disposable state but must not invent the future production tool inventory or persistence adapter. Inspector is a one-time manual diagnostic, not an automated gate.

## Candidate versions and environment

- Linux x86_64
- Node.js 24.18.1 and TypeScript 6.0.3
- `@modelcontextprotocol/server 2.0.0`
- `@modelcontextprotocol/client 2.0.0`
- `zod 4.4.3` as the server's direct tool-schema dependency
- MCP Inspector `2.2.0` for the one-time CLI listing
- Official [TypeScript server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md), [STDIO serving guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md), [client connection guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md), and [Inspector CLI guide](https://github.com/modelcontextprotocol/inspector/blob/main/clients/cli/README.md)

## Success and blocker criteria

- **Success:** the client owns and initializes the built child; lists exactly one read and one write spike tool with usable descriptions/schemas/annotations; calls both; sees concise text and matching structured content; persists only inside the disposable root; rejects invalid input and a stale generation; closes without a child or protocol error; Inspector independently lists both tools.
- **Release blocker:** STDIO contains non-protocol output, the client cannot initialize/list/call, results are opaque to a model, writes escape the disposable root, a stale process continues serving, the child survives close, Inspector requires real host mutation, or the chosen SDK cannot serve the accepted legacy client era.

## Disposable proof

`apps/mcp-server/src/spike.ts` requires an explicit spike-enable flag plus the existing disposable harness capability: test mode, matching run ID in environment/bootstrap/ownership marker, a canonical `data` directory beneath the owned sandbox prefix in a fixed trusted system temporary parent, and the exact canonical bootstrap location. It derives one fixed state filename below that root, captures the starting generation, and revalidates the directory, marker, run ID, and bootstrap before every handler. Its server factory exposes `open_deutsch_spike_read_note` and `open_deutsch_spike_write_note`, each with object schemas, descriptions, conservative annotations, concise text content, and matching structured output.

`tests/mcp-stdio-spike.test.mjs` creates its own nested disposable harness, passes only the SDK's safe default environment plus explicit test variables, and lets `StdioClientTransport` spawn the compiled JavaScript. It covers empty read, serialized concurrent writes, persisted read, invalid arguments, stale-generation error, missing-bootstrap startup failure, empty STDERR on the successful journey, safe STDERR on failure, and a cleared child PID after close.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" pnpm exec tsc -b apps/mcp-server/tsconfig.json --force
PATH="<Node-24.18.1-bin>:$PATH" node --test --test-global-setup=./tests/support/node-disposable-data.mjs tests/mcp-stdio-spike.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" pnpm exec eslint apps/mcp-server/src/spike.ts tests/mcp-stdio-spike.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

The one-time Inspector check used a disposable HOME, `MCP_STORAGE_DIR`, data root, and bootstrap, then ran the equivalent of:

```text
pnpm dlx @modelcontextprotocol/inspector@2.2.0 --cli node <built-spike-server> -e OPEN_DEUTSCH_MCP_SPIKE=YES -e OPEN_DEUTSCH_TEST_MODE=1 -e OPEN_DEUTSCH_TEST_RUN_ID=<owned-run-id> -e OPEN_DEUTSCH_DATA_ROOT=<disposable-root> -e OPEN_DEUTSCH_BOOTSTRAP_FILE=<disposable-bootstrap> --method tools/list --format json
```

## Evidence and observations

- The programmatic STDIO suite passes 3/3: the full read/write journey, rejection of relative/sibling/learner roots without writes, and missing-bootstrap startup rejection. The package-local path-boundary suite passes 1/1.
- `client.getServerVersion()` reports `open-deutsch-stdio-spike 0.0.0`; `listTools()` returns the two expected tools in deterministic order.
- The initial read returns “No disposable spike note has been saved.” and `{note: null, revision: 0}`. The write returns a short success sentence and revision 1 structured state; the next read matches it.
- Two concurrent SDK write calls are serialized inside the server and both succeed at distinct revisions 2 and 3; the final state is revision 3 with no lost-write error.
- Empty note input returns an MCP tool error rather than entering the handler. After bootstrap generation increments, the running server returns `OD_MCP_STALE_DATA_ROOT` and does not serve state.
- Closing the client clears the SDK transport PID. The successful server writes nothing to STDERR or non-protocol STDOUT; missing bootstrap emits only `OD_MCP_SPIKE_START_FAILED`.
- Inspector CLI emitted `PASS` after listing both exact tool names against the final ownership boundary. Its first ad-hoc attempt failed closed because the Inspector SDK filters custom inherited variables; the passing run supplied all five capability variables explicitly with `-e`.
- All state and Inspector storage lived below an owned disposable harness and was removed. No real host MCP catalog/config, Codex home, account, model, or learner dataset was used.

## Alternatives and negative results

- **Inherit custom data variables implicitly:** Failed safely in Inspector because the SDK's default STDIO environment is intentionally filtered. The accepted command passes each required variable explicitly.
- **In-memory transport only:** Rejected because it would not prove spawn, STDIO framing, environment, built-command resolution, or shutdown.
- **Run source with `tsx`:** Rejected. The test uses the emitted JavaScript command that later plugin packaging must launch.
- **Keep serving after bootstrap changes:** Rejected. The process returns a stable stale-root tool error for both read and write handlers.
- **Use production-sounding activity/profile tools now:** Rejected. Their contracts and persistence dependencies are not yet implemented.
- **Inspector web UI:** Unnecessary for this text/tool spike. The pinned CLI exercises the same discovery boundary without opening a browser or listener.

## Decision or explicit blocker

[ADR-0008](../adr/ADR-0008-local-stdio-mcp-baseline.md) accepts the exact SDK baseline, SDK-owned STDIO lifecycle, legacy-compatible server entry, model-readable result shape, and per-call root-generation guard. No IMP-018 blocker remains.

## Cleanup verification

- **Processes stopped:** Programmatic and Inspector clients closed their owned server children; no server PID remained.
- **Artifacts removed:** Nested data/config/bootstrap/state and Inspector storage were removed by ownership-checked harness cleanup.
- **Artifacts retained:** Pinned dependencies, spike source/test, this report, and ADR only. Compiled output remains ignored and replaceable.
- **Private/account state:** No host MCP configuration, Codex account/home, credentials, learner data, or model call was used.

## Follow-up

Use this SDK/transport baseline for production MCP contracts and handlers after IMP-022 and IMP-107–116. IMP-019 may reuse the built command only inside its isolated disposable plugin-installation proof; it must not mutate the real host automatically.
