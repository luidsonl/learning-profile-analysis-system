---
id: design-system
title: Design System
type: spec
status: proposed
since: 2026-09-10
lastReviewed: 2026-09-10
dependsOn:
  - architecture
  - frontend
requiredBy: []
---

# Design System — Angular SPA

> The shared visual and interaction foundation for the [Angular frontend](./frontend.md). Built on **Angular Material (Material 3 theming) + CDK**, expressed through **design tokens as CSS custom properties**, with **WCAG 2.2 AA** accessibility as the mandatory baseline. UI copy is **pt-BR**; the design system spec itself is English.

## Overview & Principles

The design system delivers a consistent, accessible, and inclusive interface for an education product serving gifted students, students with specific needs, and the guardians/educators who support them. Principles:

1. **Accessibility first.** Contrast, focus, keyboard, and screen-reader behavior are baseline constraints, not polish. Target WCAG 2.2 AA on every component and screen.
2. **Tokens, not hard-coded values.** No color, spacing, type, or motion value lives directly in component styles — everything references a token.
3. **Primitives over one-off components.** Small composable pieces (buttons, fields, cards) build the complex surfaces (student profile, prediction panel, form wizard).
4. **Extend Material, don't fight it.** Use Angular Material components and the CDK primitives; override theming through tokens rather than wrapping everything in custom DOM.
5. **Inclusion as product feature.** Color-blind-safe pairings, dyslexia-friendly reading options, reduced-motion support, and large text up to 200% without breakage.

## Token Architecture

Tokens are **CSS custom properties** defined in one SCSS file (`styles/tokens.scss`) and consumed as `var(--token-name)` in component styles. This gives runtime theme switching (e.g. light/dark, dyslexia-friendly) with zero rebuild.

Token taxonomy (prefix → category):

| Prefix | Category | Example |
|--------|----------|---------|
| `--color-*` | color roles & scales | `--color-primary`, `--color-surface-alt` |
| `--font-*` | typography | `--font-family-body`, `--font-size-title` |
| `--space-*` | spacing scale | `--space-2`, `--space-4` (4 px base grid) |
| `--radius-*` | shape radii | `--radius-sm`, `--radius-full` |
| `--shadow-*` | elevation | `--shadow-2`, `--shadow-4` |
| `--motion-*` | duration/easing tokens | `--motion-duration-2`, `--motion-easing-standard` |
| `--z-*` | z-index scale | `--z-nav`, `--z-overlay` |

**Themes** are token sets swapped via a `data-theme` attribute on `<html>`:

- `light` (default), `dark`.
- `dyslexia-friendly` variant: high-contrast text pairings, wider letter-spacing and line-height, minimal motion (see *Accessibility*).
- Every theme must satisfy WCAG AA contrast on all foreground/background pairs it defines; theme QA runs in CI (see *Testing*).

Material 3 theming (primary/secondary/tertiary roles, tonal palettes) maps directly onto the `--color-*` tokens so Material components inherit the design system without per-component overrides.

## Color

- **Semantic roles**: `primary`, `secondary`, `accent`, plus status roles `success`, `warning`, `error`, `info`.
- **Surfaces**: `surface` (base), `surface-alt`, `surface-container`, `surface-overlay`; text roles `on-surface`, `on-primary` (AA-compliant pairings).
- **Neutral scale** (`--color-grey-*`) for borders, dividers, disabled states.
- **Contrast contract**: text on any surface ≥ 4.5:1 (AA normal text); large text (≥ 18.66 px / 14 pt bold) ≥ 3:1. Status colors also differ by shape/icon/label — color is never the only signal (color-blind safety).
- All palette values are defined once in design token form; derived shades are generated (Material tonal ramp) not hand-picked.

## Typography

- **Type scale**: `display`, `headline`, `title`, `body`, `label` (Material scale), each with `--font-size-*` / `--font-line-height-*` / `--font-weight-*` tokens.
- **Font stack**: system sans-serif stack (readability, no font-load dependency) with an optional dyslexia-friendly face variant toggled by theme.
- Line height ≥ 1.5 for body text; no line-height below 1.2 anywhere.
- Text resizing to 200% must not break layout (fluid containers, no fixed font-size containers).

## Spacing & Layout

- **4 px base spacing grid**: `--space-1` = 4 px … `--space-16` = 64 px.
- Breakpoints: `sm` 600 px, `md` 905 px, `lg` 1240 px (Material), consumed as tokens for consistent responsive behavior.
- Content max-width token (`--layout-content-max`) for reading-length containers; target 45–80 characters per line for long-form content (forms, reports, observations).

## Shape & Elevation

- **Radius scale**: `--radius-sm` (4 px, inputs/buttons), `--radius-md` (8 px, cards), `--radius-lg` (12–16 px, dialogs/surfaces), `--radius-full` (avatars, chips, pills).
- **Elevation scale**: `--shadow-1`…`--shadow-8`; elevation is functional (hover, focus, overlay) not decorative. Shadows tokenized so dark theme can flip to stronger edges.

## Motion

- Duration tokens: `--motion-duration-1` (100–150 ms, micro-feedback) … `--motion-duration-4` (400–500 ms, overlays).
- Standard easing token (`cubic-bezier`) for all interactive motion.
- **`prefers-reduced-motion`**: all non-essential animation disabled; essential feedback via opacity/color change, never movement. `dyslexia-friendly` theme also minimizes motion by default.

## Iconography

- Material Symbols (variable font) as the single icon system; semantic icons picked consistently (e.g. `check` for confirm, `error` for failure).
- Icons always paired with text or an accessible label (never icon-only without `aria-label`).

## Component Library

Implemented as Angular standalone components extending Material primitives, used by the [frontend](./frontend.md) features:

| Component | Material/CDK base | Notes |
|-----------|-------------------|-------|
| `Button`, `IconButton`, `Fab` | `MatButton` | Loading state, focus-visible ring |
| `Field`, `Select`, `Textarea`, `NumberField`, `DatePicker` | `MatFormField` + inputs | Floating labels, inline error text |
| `CheckboxGroup`, `RadioGroup` | Mat form controls | Label association |
| `SliderGroup`, `SegmentedControl` | `MatSlider`, `MatButtonToggle` | Likert scale input |
| `Autocomplete` | `MatAutocomplete` | pt-BR filtering |
| `Card`, `StatCard`, `ProfileCard`, `PredictionCard`, `RecommendationCard` | `MatCard` | VARK profile, scores, recommendations |
| `DataTable` | `mat-table` | Sortable/scrollable tables (students, reports, audit) |
| `Tabs` | `mat-tab-group` | Student detail tabs |
| `Stepper` | `mat-stepper` | Multi-section forms/wizard |
| `Dialog`, `BottomSheet`, `Snackbar` | CDK overlay + Material | Confirmations, feedback, warnings |
| `Tooltip` | `MatTooltip` | Help text |
| `Chips`, `Badge`, `Avatar` | Material | Labels, status markers, person identity |
| `Progress`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState` | Mat progress + custom | Loading/empty/error surfaces |
| `Menu`, `NavRail`, `TopAppBar` | CDK menu + custom | App shell |
| `FormRenderer` | custom (composites) | Dynamic form from API definitions — maps question types to controls (see [frontend](./frontend.md) → *Forms Renderer*) |

Component contract: every component exposes only its public API, uses tokens (never raw values), supports keyboard operation, and ships with the ARIA roles/wiring required for its pattern (CDK-provided where possible).

## Dynamic Form System

`FormRenderer` renders `GET /api/forms/:formId` definitions: sections, questions (single/multi choice, Likert, text, number, date), required/rules. Mapping table and idempotency behavior (`requestId`) live in the [frontend](./frontend.md) spec; the design system owns the **visual/behavioral contract**: 

- Likert scales fixed to 3/5/7 steps with end labels.
- Field validation feedback inline, associated via `aria-describedby`.
- Submit flow shows progress and disabled state to prevent double submission.
- pt-BR date/number formatting.

## Accessibility

The WCAG 2.2 AA baseline enforced across all components and screens:

| Requirement | Implementation |
|-------------|----------------|
| Perceivable | AA contrast (tokens guarantee pairs); icons with labels; text scaling to 200%; no information conveyed by color alone |
| Operable | Full keyboard operation, visible `:focus-visible` ring (`--color-focus` token), logical focus order, skip-to-content link, reduced-motion respected |
| Understandable | Consistent navigation, pt-BR `lang`, error text in plain language, predictable labels |
| Robust | Semantic HTML, ARIA roles from CDK patterns, landmarks, table headers, form control labels |
| Screen readers | Form error texts read via `aria-live`, dialog focus trap (CDK), live regions for async status (e.g. "prediction completed") |
| Cognitive | Dyslexia-friendly theme toggle, generous line height and spacing, no motion clutter |

Compliance is verified by: token contrast checks in CI, automated a11y scans on e2e flows, and manual keyboard/focus review at each milestone.

## Implementation Structure

```
frontend/src/styles/
├── tokens.scss            # design tokens (CSS custom properties)
├── themes/                # light, dark, dyslexia-friendly token sets
└── global.scss            # resets, base typography, focus styles
frontend/src/app/shared/   # design-system standalone components (re-exported)
└── components/            # one folder per component in the library table
```

- Material theme is configured once (Material 3 provider) wired to the token sets; component style overrides are avoided in favor of token configuration.
- Token files are the **single source of truth** for visuals; changing a token re-themes the whole app.

## Testing

- **Token QA**: automated contrast checks on every theme's semantic pairs (AA), atomic in CI.
- **Component tests** (Vitest): keyboard behavior, ARIA wiring, disabled/loading states, error display.
- **e2e + a11y** (Playwright): axe scans on key flows; reduced-motion and dyslexia-theme smoke tests; 200% zoom regression pass.
- Visual regression on token change (snapshot diff) to catch unintended theme breakage.

## Dependencies

- **Depends on**: [architecture](./architecture.md) (personas, UI language rule, serving), [frontend](./frontend.md) (components serve SPA features; form renderer contract).
- **Required by**: none (leaf spec).

## See Also

- [Frontend](./frontend.md) — application structure, routes, forms renderer, per-persona coverage
- [Architecture](./architecture.md) — personas, pt-BR UI copy rule, CloudFront serving