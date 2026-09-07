# Agent-facing design direction

Status: active agent guidance
Last updated: 2026-08-15

`docs/design-direction.md` is the product authority. This page turns it into a compact development and verification checklist; it does not replace or override the product design.

## Build rules

- Create a calm, text-forward, light-only desktop application with warm off-white surfaces, restrained blue actions, readable typography, efficient spacing, and minimal motion.
- Use repository-owned React components with React Aria behavior, CSS Modules, shared design tokens, Lucide icons, and i18next/react-i18next. Do not introduce a second component or icon system.
- Import canonical controls through `components/ui` and shared structure through `components/layout`; keep feature CSS colocated and feature-specific.
- Use the shared page, card, section, grid, field, feedback, and action gaps. Do not make adjacent content depend on default element margins.
- English is the initial UI locale; German must be complete and switchable. Keep UI locale separate from teaching/explanation language.
- Keep persistent navigation for Dashboard, Practice, Writing, Vocabulary, History, Weekly plan, and Settings/Account. Preserve the main task width when the contextual helper collapses at narrower desktop sizes.
- Present corrections as accessible inline annotations first, with side-by-side comparison available. Mark changes with semantics and text in addition to color, synchronize selection and explanation, and use progressive disclosure.

## Component states and accessibility

For every applicable control or component, implement default, hover, focus-visible, pressed/selected, disabled, loading, success, warning, error, and destructive states. Important actions use text labels. Icon-only secondary actions need an accessible name and tooltip.

Verify keyboard operation, logical focus movement/restoration, visible focus, names/roles, contrast, non-color meaning, reduced motion, preserved learner input, and proportionate destructive confirmation. Red is for errors/destruction, amber for warnings/suggestions, green for confirmed success, and blue for primary/product actions.

## Visual workflow

Only perform a live visual journey when the user explicitly requests it. Exercise the affected production screen in English and German at standard and moderately narrow desktop widths, and confirm the main document does not develop horizontal scrolling. Inspect the visible UI, focus behavior, translations, overflow, console, and bounded operational logs without capturing screenshots, traces, videos, DOM dumps, or learner/model content.

Avoid flags, mascots, stereotypical German imagery, decorative gradients, generic chat-shell composition, arbitrary untokenized values, and motion without a functional purpose. Use `68rem`, `52rem`, and `48rem` as the canonical narrow, compact, and short-window thresholds.
