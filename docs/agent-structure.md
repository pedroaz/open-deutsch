# Codex development-agent structure

Status: accepted engineering direction  
Last updated: 2026-08-15

## Purpose

The repository guidance is designed specifically for Codex implementation agents. It should make the next safe action, the relevant verification command, and durable project boundaries discoverable without turning documentation into a transcript of prior work.

## Planned structure

```text
AGENTS.md
apps/desktop/AGENTS.md          # only when desktop-specific rules justify it
apps/mcp-server/AGENTS.md       # STDIO/protocol/data-safety rules
plugins/open-deutsch/AGENTS.md  # plugin refresh/evaluation/live-usage boundary
content/curriculum/AGENTS.md    # source, schema, approval, and untrusted-content rules
docs/agent/
  runbook.md
  design-direction.md
  lessons-learned.md
```

Avoid scoped `AGENTS.md` files that merely repeat the root. Add one only when commands, safety boundaries, or definition of done materially differ in that subtree.

## Root AGENTS.md responsibilities

- Point to the canonical implementation TODO and accepted decisions.
- Require Make-first public workflows and allow targeted pnpm diagnosis.
- Encode the goal loop and checkbox completion discipline.
- Protect real learner data and live account usage.
- Define targeted versus broad test selection.
- Require visual verification for UI work and protocol verification for MCP/plugin work.
- Require official OpenAI documentation checks before changing App Server, plugin, skill, MCP, or model assumptions.
- Preserve unrelated user work and private content.
- Explain when to record an ADR, spike result, or reusable lesson.

## Agent runbook

`docs/agent/runbook.md` should contain setup, Make commands, focused debugging workflows, log locations, test artifacts, plugin refresh, App Server diagnostics, packaging checks, and safe recovery of disposable development state.

## Design direction

`docs/agent/design-direction.md` should provide an implementation-oriented copy of or pointer to the accepted visual system, component rules, screenshots/gallery workflow, i18n requirements, and accessibility checks. Product design authority remains `docs/design-direction.md`.

## Lessons learned

`docs/agent/lessons-learned.md` records only reusable discoveries. Each entry contains:

- date;
- affected component;
- concise lesson;
- evidence or reproduction command;
- durable action or rule;
- status: candidate, promoted, or superseded.

Useful lessons include required commands, version compatibility, reliable test methods, protocol pitfalls, packaging behavior, and misleading failure symptoms. Do not record ordinary progress, completed TODOs, chat summaries, or speculative advice.

When a candidate remains valid across repeated work, promote it into the appropriate `AGENTS.md`, runbook, ADR, or product document and mark the lesson promoted. Remove or supersede stale instructions rather than accumulating contradictions.

