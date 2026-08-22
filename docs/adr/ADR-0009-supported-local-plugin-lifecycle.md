# ADR-0009 — Supported local plugin lifecycle baseline

- **Status:** accepted
- **Date:** 2026-08-15
- **Decision owners:** repository maintainers
- **Related:** IMP-019, D-055, D-056, [SPIKE-IMP-019](../spikes/SPIKE-IMP-019-supported-local-plugin-lifecycle.md)

## Context

Open Deutsch needs a guided Codex integration that can be installed, refreshed, inspected, and removed without modifying unrelated plugins. The accepted Codex runtime exposes documented plugin marketplace and CLI commands, while App Server plugin operations are still under development. Before production packaging exists, the repository needs proof that the supported CLI lifecycle works with an isolated Codex configuration, that Codex discovers the plugin's MCP component, and that the proof makes no account or model request.

## Decision

Use the stable Codex CLI plugin surface from the exactly exercised `codex-cli 0.146.0` interval `>=0.146.0 <0.146.1`: `plugin marketplace add/remove`, `plugin add/remove`, `plugin list`, and `mcp list`. Register Open Deutsch through a dedicated local marketplace whose manifest is `.agents/plugins/marketplace.json`; never edit a default or unrelated marketplace. Use `.codex-plugin/plugin.json` format `0.1.0` and a relative `.mcp.json` component reference.

Production integration must remain behind a narrow CLI adapter and may affect only the Open Deutsch marketplace/plugin identity. It must not use App Server plugin methods until OpenAI documents those methods as stable and a later ADR accepts them. Real host installation and skill/prompt activation remain an explicitly confirmed `make verify-plugin` concern. The current manifest intentionally declares no skill; it proves only packaging and MCP discovery.

## Evidence

[SPIKE-IMP-019](../spikes/SPIKE-IMP-019-supported-local-plugin-lifecycle.md) records a complete add, available-list, install, installed-status, MCP discovery, cache-busted refresh, refreshed discovery, uninstall, and marketplace cleanup journey. Every mutation used a nested disposable `HOME`, `CODEX_HOME`, and separate XDG config/data/state/cache/runtime directories; provider credentials were removed before Codex launched. The cached plugin real path was verified below that disposable Codex home. A deterministic fake-CLI journey repeats the boundary in the normal Node test gate, including poisoned host homes, XDG paths, and API keys.

The pinned plugin validator accepts the manifest and MCP component. The declared `open-deutsch-mcp` helper was discovered but not launched; executable packaging belongs to IMP-021 and later production MCP work.

## Validation commands

```text
python3 <plugin-creator-skill>/scripts/validate_plugin.py plugins/open-deutsch
PATH="<Node-24.18.1-bin>:$PATH" pnpm spike:plugin:installation
PATH="<Node-24.18.1-bin>:$PATH" node --test-global-setup=./tests/support/node-disposable-data.mjs --test tests/plugin-installation-probe.test.mjs
PATH="<Node-24.18.1-bin>:$PATH" make check
```

## Rejected alternatives

- **Mutate the normal Codex home during the unattended spike:** Rejected. The same supported commands work in an isolated configuration, so there is no reason to risk real host state.
- **Depend on App Server plugin methods:** Rejected. Those methods are explicitly under development and are not a production contract.
- **Edit the default personal marketplace:** Rejected. Open Deutsch owns one named marketplace and must preserve unrelated user configuration.
- **Declare or exercise a real skill now:** Rejected. Skill content and prompt behavior are not implemented, and real activation requires the separately confirmed plugin verification gate.
- **Launch the MCP helper as part of installation:** Rejected. This item proves manifest discovery only; IMP-018 proved the transport and later packaging items own the installed executable.
- **Treat a copied plugin with an unchanged version as refreshed:** Rejected. Refresh evidence changes a disposable marketplace copy to a deterministic build-metadata version and verifies the installed cache and MCP declaration both change.

## Accepted boundaries and consequences

- The local marketplace root has the documented `.agents/plugins/marketplace.json` layout. A root-level `marketplace.json` is invalid and must fail rather than being guessed.
- All lifecycle commands are scoped to `open-deutsch@open-deutsch-spike`; the probe removes that plugin before removing its marketplace.
- The source plugin stays at version `0.1.0`. Refresh mutates only a disposable copied fixture to `0.1.0+codex.spike-refresh` and never rewrites the repository or a real installation.
- A disposable-home warning about refusing temporary helper aliases is expected and non-fatal; the probe never trusts those aliases.
- Plugin installation does not prove model behavior, account state, helper launch, skills, deep-link handoff, or packaged distribution.
- Production Make targets and in-app status behavior remain with IMP-141 and related packaging work.

## Supersession

None.
