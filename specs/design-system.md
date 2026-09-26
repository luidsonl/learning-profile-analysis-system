---
id: design-system
title: Design System
type: spec
status: evolving
since: 2026-09-10
lastReviewed: 2026-09-26
dependsOn:
  - architecture
  - frontend
requiredBy: []
---

# Design System — Angular SPA

> The shared visual and interaction foundation for the [Angular frontend](./frontend.md). Built on **Angular Material (Material 3 theming) + CDK** as the native source of truth, with design tokens limited to the gaps Material does not cover, and **WCAG 2.2 AA** accessibility as the mandatory baseline. UI copy is **pt-BR**; the design system spec itself is English.

## Overview & Principles

The design system delivers a consistent, accessible, and inclusive interface for an education product serving gifted students, students with specific needs, and the guardians/educators who support them. Principles:

1. **Accessibility first.** Contrast, focus, keyboard, and screen-reader behavior are baseline constraints, not polish. Target WCAG 2.2 AA on every component and screen.
2. **Tokens, not hard-coded values.** No color, spacing, type, or motion value lives directly in component styles — everything references a token.
3. **Primitives over one-off components.** Small composable pieces (buttons, fields, cards) build the complex surfaces (student profile, prediction panel, form wizard).
4. **Extend Material, don't fight it.** Use Angular Material components and the CDK primitives; override theming through tokens rather than wrapping everything in custom DOM.
5. **Material-native first.** Use what Material provides — including its styling — wherever it covers the need. Custom CSS custom-property tokens exist only for gaps (see *Token Architecture*).
6. **Inclusion as product feature.** Color-blind-safe pairings, dyslexia-friendly reading options, reduced-motion support, and large text up to 200% without breakage.
7. **Responsive is first-class.** Mobile and desktop are equally supported; navigation and forms adapt without a separate mobile build (see *Spacing & Layout*).

## Token Architecture

Tokens are organized in **two tiers**:

1. **Material 3 native tokens** — the baseline and the default for everything Material covers (color roles, typography, shape, state layers). These are configured once through the M3 theming system and always win.
2. **Custom CSS custom properties** (`--color-*`, `--space-*`, `--motion-*`, `--z-*`, …) — defined in `styles/tokens.scss`, consumed as `var(--token-name)`, and used **only where Material leaves a gap**: layout/spacing scale, cross-component contracts, custom composites (cards, empty states), theme variants. **Never duplicate a Material token** — if the value exists in M3, consume the M3 token.

Custom tokens give runtime theme switching (light/dark, dyslexia-friendly) with zero rebuild.

Custom token taxonomy (prefix → category):

| Prefix | Category | Example |
|--------|----------|---------|
| `--color-*` | custom color roles & scales (only non-M3 roles) | `--color-focus`, `--color-success` |
| `--font-*` | custom fonts/families | `--font-family-body` |
| `--space-*` | spacing scale | `--space-2`, `--space-4` (4 px base grid) |
| `--radius-*` | shape radii not in M3 | `--radius-sm`, `--radius-full` |
| `--shadow-*` | elevation beyond M3 | `--shadow-2`, `--shadow-4` |
| `--motion-*` | duration/easing tokens | `--motion-duration-2`, `--motion-easing-standard` |
| `--z-*` | z-index scale | `--z-nav`, `--z-overlay` |

**Themes** are token sets swapped via a `data-theme` attribute on `<html>`:

- `light` (default), `dark`.
- `dyslexia-friendly` variant: high-contrast text pairings, wider letter-spacing and line-height, minimal motion (see *Accessibility*).
- Every theme must satisfy WCAG AA contrast on all foreground/background pairs it defines; theme QA runs in CI (see *Testing*).

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
- **Responsive is first-class — mobile and desktop are equally supported:**
  - **Navigation adapts**: mobile → bottom navigation + navigation drawer for overflow; `≥ sm` → compact nav rail; `≥ md` → expanded sidebar. Implemented on the Material navigation primitives (see [frontend](./frontend.md) → *Routing & Navigation*).
  - **Forms**: single-column on mobile; multi-column grid `≥ md`.
  - **Touch targets ≥ 44 px**: minimum interactive target on mobile (e.g. Likert scales, checkboxes); desktop dense targets never below 24 px.

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

Implemented as Angular standalone components extending Material primitives and **placed by the tier rule** (see *Implementation Structure*): app-wide extensions in `shared/ui/`, product composites inside their feature's `ui/`. Every component is usable by the [frontend](./frontend.md):

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
| `Menu`, `NavRail`, `TopAppBar` | CDK menu + custom | App shell; responsive — bottom nav on mobile, rail `≥ sm`, sidebar `≥ md` |
| `FormRenderer` | custom (composites) | Dynamic form from API definitions — maps question types to controls; homed in `features/forms/ui/` (see [frontend](./frontend.md) → *Forms Renderer*) |

Component contract: every component exposes only its public API, uses tokens (never raw values), supports keyboard operation, and ships with the ARIA roles/wiring required for its pattern (CDK-provided where possible).

**No charting library.** VARK profile totals, multimodal label, and prediction confidence render as semantic components (`ProfileCard`, `PredictionCard`, `StatCard`) with token-based bars/progress indicators. The charts gap is explicitly out of scope; it is not filled with a third-party library unless a concrete screen proves it necessary (see [progress](./progress.md)).

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

> **Implementation status (`evolving`)**: the SPA ships Angular Material 3 + the core style tier (`src/styles/{tokens,fonts,global}.scss`) and the first promoted components (`shared/ui/prediction-scores`, `shared/ui/student-form`). The component catalog, theme variants (dark/dyslexia-friendly) and the token scale below are the **target** surface — landed incrementally as screens need them, not built upfront. See [progress](./progress.md).

Component organization follows **layers by intent, colocated by feature** — not Atomic Design (no atom/molecule/… taxonomy; a component's tier is set by **real reuse**, not size):

```
frontend/src/styles/                      # core/style tier — tokens, fonts, global
│   ├── tokens.scss                       # custom design tokens (gaps Material does not cover)
│   ├── fonts.scss                        # typography face/scale wiring
│   └── global.scss                       # resets, base typography, focus styles
frontend/src/app/core/                    # singleton services/providers (auth store, interceptors)
frontend/src/app/shared/ui/               # app-wide Material extensions — promoted here ONLY when
│                                         #   ≥ 2 features reuse them (today: prediction-scores,
│                                         #   student-form)
frontend/src/app/features/<feature>/      # one dir per feature: route component(s), its services,
│                                         #   its .html/.scss and its .spec.ts — colocated
│                                         #   flat (no ui/ subdir today)
```

**Dependency rule**: dependencies always point inward — `feature/…` → `shared/ui` → `core/styles`. Features never import from other features; when a component is reused by a second feature it moves up to `shared/ui`. The [form renderer](./frontend.md) → *Forms Renderer* (`features/assessment/form-assessment`) lives inside its owning feature because it is a product pattern, not a primitive.

- Material theme is configured once (Material 3 provider); **Material's native styling is the default** — custom component styles exist only for custom composites (tier 2/3), via tokens. Material component overrides are avoided unless a WCAG AA gap demands one.
- Custom token files are the source of truth for the gaps Material does not cover; changing a custom token re-themes the affected composites.

## Testing

- **Current scope: unit tests only** (Vitest), with mocked rendering/mocks for overlay/animation contexts. Coverage: token-backed contrast assumptions on custom composites, keyboard behavior, ARIA wiring, disabled/loading states, error display.
- **Token QA**: automated contrast checks on every theme's semantic pairs (AA) for custom tokens, atomic in CI (custom tokens only — Material tokens ship their own guarantees).
- **e2e + a11y scans are deferred** with the frontend e2e program (no e2e framework yet — mirror [frontend](./frontend.md) → *Testing*); visual regression on token change (snapshot diff) stays a CI job from the start.

## Dependencies

- **Depends on**: [architecture](./architecture.md) (personas, UI language rule, serving), [frontend](./frontend.md) (components serve SPA features; form renderer contract).
- **Required by**: none (leaf spec).

## See Also

- [Frontend](./frontend.md) — application structure, routes, forms renderer, per-persona coverage
- [Architecture](./architecture.md) — personas, pt-BR UI copy rule, CloudFront serving