# Design System — Learning Profile Analysis System

> Tokens, components, and accessibility rules for the React SPA (pt-BR). Aimed at three very different audiences — **children** (students), **guardians**, and **educators** — with a fourth **admin** mode. Accessibility is a first-class requirement, not a polish item.

## Audiences & Modes

| Mode | Audience | Design emphasis |
|------|----------|-----------------|
| Default | guardian / educator | Clear, calm, information-dense but not cluttered |
| Student | child (minor) | Simplified self-view: large type, high contrast, few options, non-childish but friendly copy |
| Admin | administrator | Dense tables, registry/audit browsing |

The student mode is triggered by the `student` role (see [Authentication](./auth.md)); it is a **reduced view**, not a "cartoon" theme — LGPD-friendly wording and no gamification that could manipulate a minor.

## Design Tokens

Defined as CSS custom properties in `frontend/src/styles/tokens.css`.

### Color

| Token | Value | Purpose |
|-------|-------|---------|
| `--color-primary` | indigo `#4F46E5` | Actions, links, focus |
| `--color-primary-strong` | `#3730A3` | Hover/active states |
| `--color-bg` | `#F8FAFC` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, inputs |
| `--color-text` | `#0F172A` | Body text (WCAG AA on white) |
| `--color-text-muted` | `#475569` | Secondary text (AA on surface) |
| `--color-success` | `#15803D` | Positive/approved states |
| `--color-warning` | `#B45309` | Pending/attention |
| `--color-danger` | `#B91C1C` | Errors, destructive actions |
| `--color-focus` | `#0EA5E9` | Focus ring (visible on all backgrounds) |

Rules: never rely on color alone (paired with icons/text); text/background contrast ≥ 4.5:1 (AA); 3:1 for large text and UI components.

### Typography

- Family: system stack (`system-ui`, `-apple-system`, `Segoe UI`, Roboto) — fast, legible, no external fonts.
- Base: 16px; body `--font-size-md: 1rem`.
- Student mode: base 18–20px, line-height ≥ 1.6.
- Scale: `xs .75rem · sm .875rem · md 1rem · lg 1.125rem · xl 1.25rem · 2xl 1.5rem`.
- Text wraps; no justified text; `word-break` safe for long names.

### Spacing / Radii / Shadows

- Spacing scale: `4, 8, 12, 16, 24, 32, 48` px.
- Radii: `--radius-sm 6px · --radius-md 10px · --radius-lg 14px`.
- Shadows: subtle, layered; never used to convey state alone.

### Motion

- `--duration-fast 150ms · --duration-base 250ms`.
- Respect `prefers-reduced-motion`: disable non-essential transitions/animations.
- No flashing content (WCAG 2.3.1).

## Components

| Component | Notes |
|-----------|-------|
| `Button` | Variants: primary, secondary, ghost, danger; `disabled` semantics; ≥44px touch target; focus ring |
| `Input / Select / Textarea` | Labeled (always), `aria-describedby` for hints/errors, `aria-invalid`, clear error + helper text |
| `Card` | Surface grouping; headers with icon + text (no color-only status) |
| `Fieldset / QuestionGroup` | Used by the form renderer; `legend` for question text; Likert as radio group with `aria-label` per option |
| `RadioGroup` | Keyboard arrow-key navigation, `role="radiogroup"`, `aria-checked` |
| `Stepper` (form wizard) | Shows section progress; keeps state on back/next; used for the VARK wizard |
| `Modal` / `Dialog` | Focus trap, `aria-modal`, close on `Esc`, labelled via `aria-labelledby` |
| `Toast` | `role="status"` for success, `role="alert"` for errors; auto-dismiss ≥5s + manual close |
| `Table` (admin) | Sortable, accessible headers, `aria-sort` |
| `StatusBadge` | Always icon + text (never color-only) |
| `ProfileBars` (V/A/R/K) | Bar values + numeric values; chart alternatives provided as text for screen readers |
| `Skeleton` | Loading placeholders with `aria-hidden` |

## Accessibility Baseline (WCAG 2.1 AA)

- **Keyboard**: every interaction reachable and operable by keyboard; visible focus (2px `--color-focus` ring + offset); no keyboard traps.
- **Screen readers**: semantic landmarks (`header/nav/main/footer`), one `h1` per page, descriptive links, form labels programmatically associated.
- **Language**: `lang="pt-BR"` on `<html>`; all UI copy in pt-BR.
- **Contrast**: 4.5:1 text, 3:1 UI/large text; validate in CI (axe-core + Lighthouse CI).
- **Error recovery**: inline validation with clear messages and instructions; submit never silently fails.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables animations.
- **Resize/zoom**: layout must work at 200% zoom without horizontal scroll; relative units preferred.

## Copy Guidelines

- Plain language, short sentences; technical/ML terms translated for laypeople ("confiança da previsão" → "o quanto estamos certos").
- LGPD wording surfaced plainly in consent screens and the footer DPO contact.
- Student mode: friendly, respectful, never condescending; no praise-gamification.

## File Structure (`frontend/src/`)

```
frontend/src/
├── styles/
│   ├── tokens.css           # design tokens
│   └── global.css           # resets, base typography
├── components/              # library components (above)
├── features/                # per-feature components (forms, profile, reports…)
├── layouts/                 # AppLayout, StudentLayout, AdminLayout
├── routes/                  # route wrappers + <RequireRole>
├── api/                     # API client (relative /api)
├── auth/                    # AuthContext, token storage, guards
└── main.tsx, App.tsx
```

## Accessibility QA

- CI check: `axe-core` on built pages + `jest-axe` on component tests.
- Manual pass before release: keyboard-only walkthrough, screen-reader (NVDA/VoiceOver) smoke test, 200% zoom, reduced-motion check.

---

## See Also

- [Frontend](./frontend.md) — routes, modes, build/deploy
- [Authentication](./auth.md) — student mode activation
- [Architecture](./architecture.md) — personas and scope
