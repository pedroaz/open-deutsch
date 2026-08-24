# Agent-facing design direction

Status: active agent guidance
Last updated: 2026-08-15

`docs/design-direction.md` is the product authority. This page turns it into a compact development and verification checklist; it does not replace or override the product design.

## Build rules

- Create a calm, text-forward, light-only desktop application with warm off-white surfaces, restrained blue actions, readable typography, efficient spacing, and minimal motion.
- Use repository-owned React components with React Aria behavior, CSS Modules, shared design tokens, Lucide icons, and i18next/react-i18next. Do not introduce a second component or icon system.
- English is the initial UI locale; German must be complete and switchable. Keep UI locale separate from teaching/explanation language.
- Keep persistent navigation for Dashboard, Practice, Writing, Vocabulary, History, Weekly plan, and Settings/Account. Preserve the main task width when the contextual helper collapses at narrower desktop sizes.
- Present corrections as accessible inline annotations first, with side-by-side comparison available. Mark changes with semantics and text in addition to color, synchronize selection and explanation, and use progressive disclosure.

## Component states and accessibility

For every applicable control or component, implement default, hover, focus-visible, pressed/selected, disabled, loading, success, warning, error, and destructive states. Important actions use text labels. Icon-only secondary actions need an accessible name and tooltip.

Verify keyboard operation, logical focus movement/restoration, visible focus, names/roles, contrast, non-color meaning, reduced motion, preserved learner input, and proportionate destructive confirmation. Red is for errors/destruction, amber for warnings/suggestions, green for confirmed success, and blue for primary/product actions.

## Visual workflow

1. Add every shared component and meaningful state to the development-only component gallery.
2. Exercise the changed gallery state and affected product screen in English and German.
3. Inspect standard and moderately narrow desktop widths; the main document must not develop horizontal scrolling.
4. Capture representative acceptance screenshots through the committed Playwright journey when available.
5. Check screenshots, trace, console, main-process log, focus behavior, translations, overflow, and token consistency before accepting the change.

Avoid flags, mascots, stereotypical German imagery, decorative gradients, generic chat-shell composition, arbitrary untokenized values, and motion without a functional purpose.
