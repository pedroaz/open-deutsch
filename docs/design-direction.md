# Open Deutsch design direction

Status: accepted product direction  
Last updated: 2026-08-15

## Character

Open Deutsch should feel like a calm, capable desktop learning tool: clean, text-forward, warm, and focused. It should not resemble a marketing website, a children's game, or a generic AI chat shell.

The initial release is light mode only. Use warm off-white surfaces, restrained blue primary actions, strong readable typography, generous but efficient spacing, and minimal motion. Avoid flags, mascots, stereotypical German imagery, decorative gradients, and unnecessary visual novelty.

## Brand

- Product name: **Open Deutsch**.
- Application mark: a compact, simple **OD** mark with a subtle language or conversation motif.
- Repository/plugin name: `open-deutsch`.
- Linux application ID: `dev.opendeutsch.app`.
- Desktop URL scheme: `open-deutsch://`.

## UI foundation

- React Aria provides accessible interaction behavior.
- Repository-owned React components provide the visual layer.
- CSS Modules isolate component styling.
- Shared CSS design tokens define color, typography, spacing, radii, borders, shadows, focus rings, motion, and layout dimensions.
- Lucide is the only general-purpose icon family.
- `i18next` and `react-i18next` provide English and German UI strings.
- English is always the initial UI language; the learner may switch to German.
- UI locale and teaching/explanation language are separate settings.

Do not mix component systems or bypass tokens with arbitrary values unless the design direction is updated intentionally.

## Information architecture

Use persistent left navigation for:

- Dashboard;
- Practice;
- Writing;
- Vocabulary;
- History;
- Weekly plan;
- Settings/Account.

Practice contains grammar, reading, Codex listening/speaking handoffs, and diagnostic entry points. The center pane owns the primary task. An optional right pane owns the contextual helper and related explanation without shrinking the main task below a usable width.

## Interaction rules

- Important actions use a text label; icons alone are reserved for universally understood secondary controls and require accessible names/tooltips.
- Every interactive component defines default, hover, focus-visible, pressed/selected, disabled, loading, success, warning, error, and destructive states as applicable.
- Keyboard interaction and visible focus are first-class.
- Color is never the only carrier of meaning.
- Red is reserved for real errors or destructive actions, amber for suggestions/warnings, green for confirmed success, and blue for primary/product actions.
- Motion is brief, purposeful, and compatible with reduced-motion preferences.
- Loading never discards learner input or traps keyboard focus.
- Destructive actions name the affected record and require proportionate confirmation.

## Correction presentation

The default correction view is an inline annotated document. Changes use text markers, labels, and accessible semantics in addition to color. A side-by-side original/corrected view is available for deeper comparison. Selecting a change synchronizes its explanation and helper context.

Use progressive disclosure: corrected text and important changes appear first; detailed grammar explanations, natural alternatives, vocabulary candidates, uncertainty, and follow-up practice remain easy to reveal.

## Responsive desktop behavior

Optimize for desktop windows rather than mobile pages. At standard width use navigation, main workspace, and optional helper. At moderately narrow width collapse the helper into a drawer or tab without hiding the primary action or creating horizontal document scrolling.

## Component gallery and validation

Provide a development-only component gallery containing every shared component and meaningful state. Exercise it in English and German at standard and narrow window sizes.

Visual gates should include representative screenshots rather than pixel-perfect coverage of the entire app. Tests fail for missing translations, obvious overflow, inaccessible names/roles, console errors, broken focus behavior, and inconsistent token usage.

