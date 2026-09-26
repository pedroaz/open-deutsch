---
name: open-deutsch-desktop-ui
description: Implement or review Open Deutsch Electron renderer UI, including React controls, CSS layout, English/German copy, keyboard interaction, accessibility, and visual behavior. Use for desktop interface changes, not curriculum authoring.
---

# Open Deutsch desktop UI

Inspect the real renderer and current styles before changing a screen. Repository-relative starting points are `apps/desktop/src/renderer/App.tsx`, the affected feature component, `components/ui/`, `components/layout/`, `styles/tokens.css`, `styles/global.css`, and `locales/en.json` / `de.json`. Follow hooks and contracts to establish behavior; no separate design inventory establishes what is implemented.

## Durable design decisions

- Keep a calm, text-forward, warm, light-only desktop style. Preserve the OD identity. Prioritize the learning task over shell controls, explanatory prose and empty panels.
- Use repository-owned controls/layouts, React Aria, CSS Modules, shared tokens, Lucide and i18next/react-i18next. Extend these before introducing alternatives.
- Let page/card/field/action layouts own spacing. Adapt to available workspace width; inspect existing breakpoints in CSS. Never conceal layout defects by clipping overflow. Keep long content and enlarged text reachable.
- Use concise labels and progressive disclosure. Use InfoHint for optional explanations while keeping essential instructions, privacy information and destructive consequences visible. Keep Cancel beside the initiating action or progress.
- Keep EN/DE complete; interface locale and teaching language are independent. Preserve substantive learning text and learner input on failure.
- Preserve accessible names, roles, keyboard operation, focus restoration, selected/disabled/pending/error states and reduced motion. Icon-only secondary actions need names and tooltips; important actions need text. Meaning cannot depend only on color.
- Keep participation, skipped work and proficiency evidence distinct. Explanations and corrections must remain understandable without exposing internal implementation details.

CSS-module declarations come from `apps/desktop/scripts/generate-css-types.mjs`; inspect the build/dev scripts and regenerate after class changes. Do not weaken TypeScript checks.

Use [interactive Electron verification](../open-deutsch-electron-verification/SKILL.md) to inspect changed screens in both locales at standard and narrower widths, including keyboard/focus and relevant states. Generation uses real GPT-6 Luna; local layout checks need no model call. Report observed behavior and unexercised states. No automated UI tests, screenshot suites or stored journeys.
