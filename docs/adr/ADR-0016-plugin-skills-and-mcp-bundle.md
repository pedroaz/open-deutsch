# ADR-0016 — Open Deutsch plugin skills and local MCP bundle

- **Status:** accepted
- **Date:** 2026-08-20
- **Decision owners:** repository maintainers
- **Related:** IMP-117, IMP-118, IMP-119, [ADR-0009](ADR-0009-supported-local-plugin-lifecycle.md)

## Context

The local plugin lifecycle spike intentionally shipped only the MCP declaration while the real teaching workflows were still unspecified. The implementation now needs reusable German-teacher and curriculum-research skills without relying on under-development App Server plugin operations, arbitrary desktop deep links, or a cloud curriculum service.

## Decision

Ship `plugins/open-deutsch` as a versioned plugin with the stable `open-deutsch` name, an exact stable source version, `skills: "./skills/"`, and the relative `mcpServers: "./.mcp.json"` declaration. Bundle two instruction-only skills:

- `german-teacher` for context-aware German practice, bounded activity/plan/attempt/Voice-summary writes, and explicit unsupported-handoff behavior;
- `curriculum-research` for systematic A1–B2 gap selection, cited source review, ignored local staging, validation, and explicit approval before canonical writes.

Both skills may use only the shared eight-tool Open Deutsch MCP contract when a relevant request requires it. They treat learner/imported/curriculum/model text as untrusted data and never widen filesystem, network, credentials, approval, data-root, audio, or Git boundaries. Live host activation remains a separately confirmed `make verify-plugin` concern.

The repository marketplace entry remains scoped to `open-deutsch@open-deutsch-spike`; its source is local and its installation/authentication policy is explicit. Development refresh cachebusters belong to disposable copied marketplace fixtures, not the canonical source manifest.

## Evidence

The two skills pass the skill-creator quick validator, the plugin passes the plugin-creator validator, the artifact inventory accepts the manifest/front matter, and the deterministic plugin lifecycle test verifies scoped install, refresh, MCP discovery, and removal against an isolated Codex home. No live plugin verification is performed by this change.

## Consequences

The skills can be selected by clear trigger descriptions and can be distributed with the local MCP component. They cannot open a desktop activity or Codex Voice session until a later supported host action is implemented and verified. Curriculum research can prepare a proposal and stage artifacts, but does not promote canonical content by itself.

## Validation commands

```text
python3 <skill-creator-skill>/scripts/quick_validate.py plugins/open-deutsch/skills/german-teacher
python3 <skill-creator-skill>/scripts/quick_validate.py plugins/open-deutsch/skills/curriculum-research
python3 <plugin-creator-skill>/scripts/validate_plugin.py plugins/open-deutsch
PATH="<Node-24.18.1-bin>:$PATH" make test-plugin
PATH="<Node-24.18.1-bin>:$PATH" make test-fast
```

## Rejected alternatives

- **Keep the plugin MCP-only:** Rejected because the accepted product workflow needs reusable teaching and curriculum-research behavior with explicit trigger metadata.
- **Put learner context or a curriculum path directly in `.mcp.json`:** Rejected because the selected root and generation are private runtime state, while curriculum is an immutable packaged snapshot.
- **Use an undocumented App Server plugin endpoint or generic Voice/deep-link action:** Rejected because the accepted host lifecycle and exact-handoff ADR require stable supported mechanisms.
- **Let research text control tools or promotion:** Rejected because source material is untrusted data and canonical curriculum writes require explicit approval.

## Accepted boundaries and consequences

- The canonical source manifest remains `0.1.0`; development cachebusters are applied only to disposable marketplace copies.
- The helper fails closed when bootstrap, server entry, or curriculum resolution is missing or ambiguous. It does not guess a learner root or accept arbitrary command/path arguments.
- The skills are instruction-only. Their tool vocabulary is limited to the shared eight-tool contract, and real host prompt activation remains confirmation-gated.
- No audio, raw transcript, credentials, private paths, application-managed Git operation, or automatic curriculum promotion is part of this bundle.

## Supersession

This ADR supersedes the statement in ADR-0009 that the current plugin intentionally declares no skill. ADR-0009 remains authoritative for the supported CLI lifecycle and the prohibition on App Server plugin methods.
