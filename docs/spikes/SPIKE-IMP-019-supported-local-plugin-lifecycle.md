# SPIKE-IMP-019 — Supported local plugin lifecycle

- **Status:** complete
- **Date:** 2026-08-15
- **Owner:** repository maintainers
- **Related:** IMP-019, D-055, D-056, [ADR-0009](../adr/ADR-0009-supported-local-plugin-lifecycle.md)
- **Time/scope bound:** one isolated local marketplace lifecycle with no model, account, normal host, helper launch, or real skill activation

## Question and accepted constraints

Can the supported Codex CLI install, refresh, report, discover, and remove the Open Deutsch plugin through a dedicated local marketplace while every write stays inside disposable configuration?

The unattended proof must not touch the normal `HOME`, `CODEX_HOME`, XDG config/data/state/cache/runtime paths, learner data, marketplace, or plugin cache. It must scrub provider credentials, make no App Server or model call, preserve unrelated plugins, and clean its owned state. If those conditions cannot be met, mutation must move behind `make verify-plugin` and the unattended portion must become read-only.

## Candidate versions and environment

- Linux x86_64
- Node.js 24.18.1
- `codex-cli 0.146.0`, accepted interval `>=0.146.0 <0.146.1`
- Open Deutsch plugin manifest version `0.1.0`
- Official [Codex plugins documentation](https://developers.openai.com/codex/plugins/), including local marketplace CLI installation
- Official plugin authoring validator from the bundled `plugin-creator` skill

## Success and blocker criteria

- **Success:** a named local marketplace is added in a disposable Codex home; Open Deutsch appears available; install caches only below that home; status and MCP discovery match the manifest; a cache-busted copy refreshes; uninstall removes plugin discovery; marketplace removal leaves no entry; cleanup removes the disposable roots.
- **Release blocker:** any command writes normal host state, requires an account/model call, modifies an unrelated plugin, cannot discover the relative MCP component, falsely reports a refresh, or depends on under-development App Server plugin operations.

## Disposable proof

`scripts/probe-plugin-installation.mjs` creates an ownership-checked disposable data harness, copies the repository plugin into a temporary marketplace, and writes the marketplace manifest at `.agents/plugins/marketplace.json`. It creates nested disposable home, Codex home, and separate XDG config/data/state/cache/runtime directories, reuses the credential-scrubbing App Server environment boundary, and invokes only the supported plugin and MCP CLI commands. It verifies that the installed cache canonicalizes below the disposable Codex home.

The refresh step changes only the copied fixture's manifest build metadata and MCP command, reruns the scoped install, and checks both installed status and discovered MCP configuration. The source manifest and normal host remain unchanged. The probe removes the plugin, confirms no installed plugin or MCP server remains, removes the marketplace, then performs ownership-checked harness cleanup.

`tests/plugin-installation-probe.test.mjs` runs the same orchestration against a deterministic fake Codex CLI. The fake refuses inherited provider credentials, any non-disposable home or XDG path, and any unscoped/malformed lifecycle command. The test poisons the normal home and all XDG variables plus API keys, expects the complete lifecycle to pass, and proves the poisoned learner-home path was never created. Separate adversarial cases reject the wrong plugin, wrong marketplace, and missing JSON output mode.

## Validation commands

```text
python3 <plugin-creator-skill>/scripts/validate_plugin.py plugins/open-deutsch
PATH="<Node-24.18.1-bin>:$PATH" pnpm spike:plugin:installation
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/plugin-installation-probe.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" pnpm exec eslint scripts/probe-plugin-installation.mjs tests/fixtures/fake-codex-plugin-cli.mjs tests/plugin-installation-probe.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Evidence and observations

- The real pinned CLI emitted `PASS` after marketplace add, available listing, install, installed cache inspection, MCP discovery, refresh, refreshed status/discovery, uninstall, empty discovery, marketplace removal, and cleanup.
- `plugin list --available --json` reported only `open-deutsch@open-deutsch-spike`; `mcp list --json` reported the enabled `open-deutsch` STDIO component and its declared helper command.
- The refreshed disposable copy reported version `0.1.0+codex.spike-refresh`, and discovery changed to its fixture command. No source repository file changed during the run.
- The deterministic regression suite passes 3/3 with poisoned host configuration and credentials plus strict scoped CLI arguments.
- The plugin-creator validator accepts the repository plugin. It has one relative MCP component and intentionally no skill component.
- Codex printed a warning that it would not create temporary helper aliases because `CODEX_HOME` was under the system temporary directory. That safety warning did not affect explicit CLI commands.
- No App Server method, login, model, prompt, MCP helper process, network endpoint, normal Codex home, or learner root was used.

## Alternatives and negative results

- **Place `marketplace.json` at the marketplace root:** The real CLI rejected this with “marketplace root does not contain a supported manifest.” The accepted `.agents/plugins/marketplace.json` layout then passed.
- **Inherit the normal Codex environment:** Rejected before execution. The probe replaces all configuration homes and removes provider credential variables.
- **Use App Server plugin list/install methods:** Rejected because the official interface marks that area under development; no production dependency is created.
- **Evaluate the plugin's default prompt or skill behavior:** Deferred to explicitly confirmed `make verify-plugin`; this manifest contains no skill yet.
- **Assume MCP discovery means the helper launches:** Rejected. The CLI parsed the component declaration only; installed executable resolution is later work.

## Decision or explicit blocker

[ADR-0009](../adr/ADR-0009-supported-local-plugin-lifecycle.md) accepts the isolated CLI lifecycle and dedicated marketplace mechanism. Isolation is supported, so unattended mutations need not be reduced to read-only discovery. Real host activation and skill/prompt evaluation remain confirmation-gated. No IMP-019 blocker remains.

## Cleanup verification

- **Processes stopped:** Every CLI subprocess completed within a 15-second bound; no MCP server or model process was launched.
- **Artifacts removed:** The installed plugin, marketplace registration, nested Codex/config homes, copied fixture, and harness roots were removed.
- **Artifacts retained:** Repository manifest/MCP component, deterministic probe/test, ADR, and this report only.
- **Private/account state:** No normal host configuration, account, credential, learner data, or model request was used.

## Follow-up

IMP-020 owns exact cross-surface handoff. Production plugin commands/status remain with IMP-141 and packaging items; real skill activation stays behind `make verify-plugin` after a skill exists.
