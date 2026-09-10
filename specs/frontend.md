---
id: frontend
title: Frontend (Angular SPA)
type: spec
status: proposed
since: 2026-09-10
lastReviewed: 2026-09-10
dependsOn:
  - architecture
  - auth
  - backend
requiredBy:
  - design-system
---

# Frontend — Angular SPA

> The single-page application that consumes the backend API (`/api/*`) and is served from the same CloudFront domain as the API — no CORS. Built in **Angular**, styled and reinforced by the project's [design system](./design-system.md), with **pt-BR** end-user copy and **WCAG 2.2 AA** accessibility as a hard baseline.

## Overview

The frontend is the interface for all four personas: **guardian**, **educator**, **student**, and **admin**. It renders the same feature set the API exposes and enforces the same role and scope rules at the UI level — the API remains the source of truth for authorization (see the [RBAC Matrix](./backend.md#rbac-matrix)); the SPA only hides what a persona cannot access.

The SPA is **not yet implemented**. This spec captures the agreed shape of the planned rebuild (the previous React+Vite frontend was removed; the rebuild is Angular with fresh specs, see [progress](./progress.md)). Its scope:

- Browser application in Angular, standalone components, lazy-loaded feature modules.
- Design tokens and component primitives come from the [design system](./design-system.md) spec.
- One domain serves the SPA (`/*`) and the API (`/api/*`) through CloudFront — see [architecture](./architecture.md) → *Architecture Diagram* and *Deployment Order*.
- No environment-specific configuration in app code: relative `/api` paths in prod, dev proxy in Angular CLI.

## Serving & Local Development

| Context | Routing | Notes |
|---------|---------|-------|
| Production | CloudFront `/*` → S3 bucket `learning-profile-front`; `/api/*` → API Gateway | One distribution, no CORS; SPA fallback to `/index.html` for deep links |
| Local dev | Angular CLI dev server, proxy `/api` to deployed API Gateway endpoint | `proxy.conf.json`; no CORS needed, mirrors prod topology |

Deployment artifacts live in `terraform/aws-frontend` (S3 static bucket + CloudFront + OAC). Build + upload + invalidation is orchestrated from the root `Makefile` (`make frontend`), which is dormant until the SPA is reintroduced.

## Tech Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | Angular (current LTS line at scaffold time) | Owner decision; stable router, DI, signals |
| UI primitives | Angular Material + CDK (Material 3 theming) | Accessible primitives out of the box; CDK for overlay/a11y patterns — see [design system](./design-system.md) |
| Styling | SCSS + CSS custom properties (design tokens) | Runtime theme swap, no build-time constraint — see [design system](./design-system.md) |
| State | Built-in signals + `resource`/`httpResource` | Lean; no third-party state library |
| HTTP client | Angular `HttpClient` + typed services | Wraps the OpenAPI contract |
| DTO types | Generated from `specs/api.yaml` | OpenAPI 3.0.3 is the SSOT for shapes (see [backend](./backend.md)) |
| Unit/e2e tests | Vitest (unit) + Playwright (e2e) | Fast, current Angular CLI defaults |

## Application Structure

```
frontend/
├── angular.json            # build config, budgets, i18n locale pt-BR
├── proxy.conf.json         # dev proxy: /api → deployed API Gateway
└── src/
    ├── main.ts             # bootstrap, provideRouter, provideAnimations
    ├── styles/
    │   ├── tokens.scss     # design-token CSS variables (from design-system spec)
    │   └── global.scss     # resets, base typography, utility classes
    ├── app/
    │   ├── core/           # HttpClient providers, interceptors, auth store/service
    │   │   ├── auth/       # login/register calls, session storage, guards
    │   │   ├── api/        # generated DTOs + typed feature clients
    │   │   └── errors/     # API error envelope → pt-BR user messages
    │   ├── layout/         # app shell: header, nav, role-aware menu, footer
    │   ├── features/       # one lazy-loaded module per feature/route group
    │   │   ├── auth/       # login, register
    │   │   ├── home/       # role-aware landing/dashboard
    │   │   ├── students/   # list, detail (profile, submissions, predictions,
    │   │   │               #   recommendations, observations, consent, audit)
    │   │   ├── forms/      # dynamic form renderer, submissions list
    │   │   ├── reports/    # report list, generate, download
    │   │   └── admin/      # user management (approve/deny, tokens, RBAC)
    │   └── shared/         # design-system component re-exports, pipes, utils
    └── environments/       # no secrets; empty placeholders by design
```

## Routing & Navigation

Routes map 1:1 to the API surface. Guards mirror backend preconditions:

| Route | Personas | Purpose | Guard notes |
|-------|----------|---------|-------------|
| `/login`, `/register` | public | Sign in / self-register (incl. `role: student`) | Redirect to home when already authenticated |
| `/` | authenticated | Role-aware landing | `authGuard` |
| `/me` | student | Own self-view: profile, submissions, predictions, observations, reports | `studentRoleGuard`; renders **restricted self-service area** while `pending`/unlinked (`studentId == null`) |
| `/students` | guardian, educator, admin | List in-scope students | `guardianEducatorAdminGuard` |
| `/students/:id` | scoped | Student detail shell + tabs (profile, submissions/predictions, recommendations, observations, consent, audit) | `scopedStudentGuard`; admin adds audit tab |
| `/students/:id/forms/:formId` | form persona | Fill a form (dynamic renderer) | audience check from `GET /api/forms` |
| `/admin/users` | admin, educator | User management (approve/deny/promote/delete/reset) | `adminOrEducatorGuard`; role/status conditional UI |

**Status-aware login**: educator/guardian accounts that are `denied` or not yet `active` receive the mapped error and are routed accordingly; a `pending` student still signs in and lands on `/me` in restricted self-service mode (see [auth](./auth.md) → *Account status & approval flow*).

## Authentication Flow (SPA side)

1. **Login/register** call `POST /api/auth/login` / `POST /api/auth/register` (role support for `student` self-registration with `birthDate`).
2. **Session token** is returned by the API; the SPA keeps it in memory (Angular service) and mirrors it to `sessionStorage` (survives refresh, cleared on tab close — no long-lived persistence). `logout` revokes via the API and clears local storage.
3. **Interceptor** (`core/`) attaches `Authorization: Bearer <token>` and maps the uniform error envelope `{ error: { code, message } }` to typed errors and **pt-BR user messages** (see [backend](./backend.md) → *Conventions*).
4. **401 handling**: destroy local session and route to `/login` (approval/demotion takes effect immediately because `requireAuth` re-reads the user from the DB — see [auth](./auth.md) → *Middleware*).
5. **403 mapping**: `pending_approval`, `account_denied`, `forbidden`, `consent` gates render specific explanation screens instead of a generic error.

## API Client & Types

- DTO interfaces are **generated from `specs/api.yaml`** (OpenAPI 3.0.3) at build time and committed; `core/api/` exposes one typed, feature-scoped client per domain (auth, students, guardianship, consent, forms, observations, assessments, predictions, recommendations, reports, admin, audit).
- Every client returns typed results and passes raw error objects to `core/errors/` for mapping — the SPA never invents domain rules.
- There is **no business logic in the database or the SPA**: submission flow, consent gating, and prediction semantics are driven by the API response shape, not re-implemented in the client (see [architecture](./architecture.md) → *Forms Engine*).

## Async & State Patterns

- **Signals** hold session, current student context, and feature list state.
- **Predictions are asynchronous**: a `vark` submission is stored immediately; the inference Lambda scores it and writes the `PRED#` item asynchronously ([backend](./backend.md) → *Assessment & Prediction*). The SPA shows an explicit "waiting for prediction" state and refreshes `GET /students/:id/predictions` (and the submissions list) until the prediction lands or a timeout shows the prediction is not available.
- **`requestId` idempotency**: the SPA generates a `requestId` per submission attempt; a retry reuses the same value so the API deduplicates (see [backend](./backend.md) → *Forms*).
- **Optimistic UI only where safe** (e.g. local tab state); anything that mutates students' data waits for the API response and refreshes from the server.

## Forms Renderer

The SPA renders form definitions from `GET /api/forms/:formId` into a dynamic form built on design-system controls:

| API question type | Renderer control |
|-------------------|------------------|
| single choice | radio group |
| multiple choice | checkbox group |
| Likert scale | segmented button / slider with scale labels |
| text | text input / textarea |
| number | number input with validation |
| date | date picker (pt-BR format) |

- Validation comes from the form definition plus client-side complement (required, ranges); server errors surface inline via field-level error display.
- The dynamic renderer is part of the [design system](./design-system.md) (reused by future forms).
- `requestId` is generated per submission attempt; a retry reuses the same value (idempotency).

## Feature Coverage Checklist (per persona)

Derived from the RBAC matrix — the SPA shows only these actions, each wired to the corresponding endpoint in [backend](./backend.md):

- **guardian**: own profile; list/edit assigned students; fill `anamnesis` + assist `vark`; view their submissions, predictions, recommendations (approved), reports; consent for minors; student audit trail.
- **educator**: create/follow/assign students; fill `socioemotional` + `behavior-checklist` + assist `vark`; observations (write); recommendations (propose/approve); approve/deny `guardian`/`student` accounts; consent (institution basis); reports; no audit tab.
- **student**: self-register (`pending`, restricted self-service until linked); after link: edit own profile, fill `vark`, full self-view of own entity; observations read-only; recommendations published-only; reports (generate/list/download, never delete); **no audit trail, no raw model internals**.
- **admin**: everything above including full user management (promote/demote, reset password, delete, adjust `birthDate`), audit, all forms.

## Error Handling & User Feedback

- Single error mapping layer in `core/errors/`: API code → pt-BR copy + suggested action; unknown/network errors get a generic retry screen.
- Inline field errors for forms; toast/banner for action results; full-screen states for empty, loading, and error cases (design-system empty-state/error-state components).
- No raw API messages or technical stack traces shown to end users.

## Accessibility & Language

- UI copy is **pt-BR** (domain language rule — see [architecture](./architecture.md)); code, comments, and docs remain English.
- WCAG 2.2 AA is the floor across every screen; enforcement details live in the [design system](./design-system.md) → *Accessibility*.

## Security

- No secrets or credentials in the bundle; tokens live in memory/session storage only.
- Least-privilege navigation (guards) is a UX optimization — the API enforces real authorization.
- No third-party analytics/tracking (LGPD constraint, see [lgpd](./lgpd.md)); CSP and security headers are applied at the CloudFront level (see [security](./security.md)).
- Dependency hygiene: `npm audit` runs for frontend deps when the SPA is reintroduced (see [security](./security.md)).

## Testing

- **Unit** (Vitest): auth store, guards, error mapping, dynamic form renderer, api clients (mocked `HttpClient`).
- **E2e** (Playwright): login/register per persona status, pending-student self-service, form fill with `requestId` retry, prediction wait state, role-conditional UI — against the deployed stack, mirroring the backend e2e scenarios in [backend](./backend.md) → *Local Development*.
- Accessibility checks in e2e (automated axe on key flows) plus manual keyboard/focus audit per milestone.

## Dependencies

- **Depends on**: [architecture](./architecture.md) (serving topology, personas, forms engine), [auth](./auth.md) (sessions, roles, account status, consent gates), [backend](./backend.md) (endpoints, error envelope, RBAC matrix).
- **Required by** (specs that presume this one): [design-system](./design-system.md) (components exist to serve the SPA).

## See Also

- [api.yaml](./api.yaml) — OpenAPI 3.0.3 contract; source for generated DTO types
- [Design System](./design-system.md) — tokens, components, a11y baseline
- [Backend](./backend.md) — endpoints, RBAC matrix, error envelope
- [Authentication](./auth.md) — sessions, status flow, student self-service
- [Architecture](./architecture.md) — CloudFront/S3 serving, deployment order