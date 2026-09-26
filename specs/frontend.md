---
id: frontend
title: Frontend (Angular SPA)
type: spec
status: stable
since: 2026-09-10
lastReviewed: 2026-09-26
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

The SPA is **implemented in Angular** and deployed behind CloudFront. This spec is the SSOT for its shape: the previous React+Vite app was removed and rebuilt in Angular against this spec (see [progress](./progress.md)). Its scope:

- Browser application in Angular, **standalone components** with lazy-loaded routes (`loadComponent` per feature).
- Static SPA served from S3 + CloudFront; no server-side rendering.
- Design tokens and component primitives come from the [design system](./design-system.md) spec.
- One domain serves the SPA (`/*`) and the API (`/api/*`) through CloudFront — see [architecture](./architecture.md) → *Architecture Diagram* and *Deployment Order*.
- No environment-specific configuration in app code: relative `/api` paths in prod, dev proxy in Angular CLI.
- **Responsive is first-class, not a bonus**: the app must work well on mobile and desktop (patterns in [design system](./design-system.md)).

## Serving & Local Development

| Context | Routing | Notes |
|---------|---------|-------|
| Production | CloudFront `/*` → S3 bucket `learning-profile-front`; `/api/*` → API Gateway | One distribution, no CORS; SPA fallback to `/index.html` for deep links |
| Local dev | Angular CLI dev server, proxy `/api` to deployed API Gateway endpoint | `proxy.conf.json`; no CORS needed, mirrors prod topology |

Deployment artifacts live in `terraform/aws-frontend` (S3 static bucket + CloudFront + OAC). Build + upload + invalidation is orchestrated from the root `Makefile` (`make deploy-aws-front`, or as part of `make deploy-all`).

## Tech Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | Angular 21 (standalone components, signals) | Owner decision; stable router, DI, signals |
| UI primitives | Angular Material + CDK (Material 3 theming) | Accessible primitives out of the box; CDK for overlay/a11y patterns — see [design system](./design-system.md) |
| Styling | Angular Material 3 theming + SCSS; custom CSS custom-properties only for gaps | Native Material styling wins by default; custom tokens fill gaps only — see [design system](./design-system.md) |
| State | Built-in signals + `resource`/`httpResource` | Lean; no third-party state library |
| HTTP client | Angular `HttpClient` + typed services | Wraps the OpenAPI contract |
| DTO types | Hand-written in `core/api/types.ts`, mirroring `specs/api.yaml` | OpenAPI 3.0.3 is the SSOT for shapes; the SPA mirrors it (see [backend](./backend.md)) |
| Unit tests | Vitest, API mocked | Deterministic, no AWS dependency; see *Testing* |

## Application Structure

```
frontend/
├── angular.json            # build config, budgets
├── proxy.conf.json         # dev proxy: /api → deployed API Gateway
└── src/
    ├── main.ts             # bootstrap, provideRouter, provideAnimations
    ├── styles/             # tokens.scss, fonts.scss, global.scss (see design-system)
    └── app/
        ├── app.routes.ts   # the routing table (all routes, lazy loadComponent)
        ├── core/           # singleton providers: auth, guards, interceptor,
        │   │               # errors, and one typed API client per domain
        │   ├── auth/       # auth.service, auth.guard (authGuard, adminOrEducatorGuard,
        │   │               #   skipStudentSelectorGuard), auth.interceptor
        │   ├── api/        # types.ts (DTOs mirroring specs/api.yaml)
        │   ├── errors/     # API error envelope → typed error + pt-BR user messages
        │   ├── students/ admin/ forms/ reports/ observations/
        │   ├── recommendations/ users/ vark/
        │   └── predictions/prediction-polling.service (signal + RxJS timer backoff)
        ├── layout/         # app shell: header, responsive nav, role-aware menu, footer
        └── features/       # one dir per feature: route component(s) + its .html/.scss/.spec.ts
            ├── auth/         # login, register
            ├── home/         # role-aware landing
            ├── students-list/    # /estudantes — in-scope students
            ├── student-create/   # /estudantes/novo — educator/admin
            ├── student-workspace/# /estudantes/:id — the ficha (tabbed)
            ├── assessment/      # /avaliacoes* — 3-screen workspace + FormAssessment
            ├── profile/         # /perfil — own self-view (MeuPerfil)
            ├── observations/ recommendations/ reports/   # /observacoes, /recomendacoes, /relatorios
            └── admin/           # /admin — approvals + user management
```

Component organization follows the **tier + colocation rule** (no Atomic Design): a component lives in its feature directory unless ≥ 2 features reuse it, then it is promoted to `shared/ui/` (today: `PredictionScores`, `StudentForm`); dependencies point inward (`feature` → `shared/ui` → `core/styles`). Details in [design system](./design-system.md) → *Implementation Structure*.

## Routing & Navigation

Routes map 1:1 to the API surface, but the **URL segments are pt-BR** (end-user navigation, not developer surface). Guards mirror backend preconditions:

| Route | Personas | Purpose | Guard notes |
|-------|----------|---------|-------------|
| `/login`, `/register` | public | Sign in / self-register (incl. `role: student`) | Redirect to home when already authenticated |
| `/` | authenticated | Role-aware landing | `authGuard` |
| `/perfil` | student | Own self-view: profile, submissions, predictions, observations, reports | `authGuard`; renders the **restricted self-service area** while `pending`/unlinked (`studentId == null`) |
| `/estudantes` | guardian, educator, admin | List in-scope students | `authGuard` |
| `/estudantes/novo` | educator, admin | Create a student | `authGuard` |
| `/estudantes/:studentId` | scoped | **Student ficha** — tabbed: Dados (edit + LGPD removal), Perfil de aprendizagem, Observações, Recomendações, Consentimento, Acessos; plus an "avaliações" action button into the assessment workspace | `authGuard`; tabs and write actions are role-gated in the UI |
| `/avaliacoes` | scoped | Step 1 — pick the student (see *Assessment Workspace*) | `authGuard` + `skipStudentSelectorGuard` (student ⇒ redirect to own profile) |
| `/avaliacoes/:studentId` | scoped | Step 2 — pick the form | `authGuard`; deep link from the student list skips step 1 |
| `/avaliacoes/:studentId/:formId` | scoped | Step 3 — submissions/results + *Enviar nova avaliação* | `authGuard` |
| `/observacoes`, `/recomendacoes`, `/relatorios` | scoped | Cross-student lists for the observations, recommendations and reports the persona can see | `authGuard`; write actions educator/admin only |
| `/admin` | admin, educator | User management (approvals + users) | `authGuard` + `adminOrEducatorGuard`; role/status conditional UI; role selector only for staff (guardian/student roles are fixed — no selector) |
| `**` | — | Redirect to `/` | — |

There is **no audit tab** in the ficha: the audit trail is an API-only surface (`GET /api/audit/students/:id`), surfaced to admins outside the SPA.

**Status-aware login**: educator/guardian accounts that are `denied` or not yet `active` receive the mapped error and are routed accordingly; a `pending` student still signs in and lands on `/me` in restricted self-service mode (see [auth](./auth.md) → *Account status & approval flow*).

## Authentication Flow (SPA side)

1. **Login/register** call `POST /api/auth/login` / `POST /api/auth/register` (role support for `student` self-registration; `birthDate` is **optional** — the account declares no age, the ficha does).
2. **Session token** is returned by the API; the SPA keeps it in memory (Angular service) and mirrors it to `sessionStorage` (survives refresh, cleared on tab close — no long-lived persistence). `logout` revokes via the API and clears local storage. **Session policy is deliberately lenient (risk accepted)**: there is **no idle auto-logout**; session lifetime is governed by the server-side `SESSION#` TTL (7 days sliding, see [auth](./auth.md) → *Session Flow*) alone. Re-login is the only required action after a token-expired `401`.
3. **Interceptor** (`core/`) attaches `Authorization: Bearer <token>` and maps the uniform error envelope `{ error: { code, message } }` to typed errors and **pt-BR user messages** (see [backend](./backend.md) → *Conventions*).
4. **401 handling**: destroy local session and route to `/login` (approval/demotion takes effect immediately because `requireAuth` re-reads the user from the DB — see [auth](./auth.md) → *Middleware*).
5. **403 mapping**: `pending_approval`, `account_denied`, `forbidden`, `consent` gates render specific explanation screens instead of a generic error.

## API Client & Types

- DTO interfaces live in `core/api/types.ts` and **mirror** `specs/api.yaml` (OpenAPI 3.0.3), which stays the SSOT for shapes — there is no codegen step in the build, so a contract change is a deliberate edit in both places (see [backend](./backend.md)). `core/` exposes one typed, feature-scoped client per domain (auth, students, users, forms, observations, predictions, recommendations, reports, admin).
- Every client returns typed results and passes raw error objects to `core/errors/` for mapping — the SPA never invents domain rules.
- There is **no business logic in the database or the SPA**: submission flow, consent gating, and prediction semantics are driven by the API response shape, not re-implemented in the client (see [architecture](./architecture.md) → *Forms Engine*).

## Async & State Patterns

- **Signals** hold session, current student context, and feature list state.
- **Predictions are asynchronous**: a `vark` submission is stored immediately; the inference Lambda scores it and writes the `PRED#` item asynchronously ([backend](./backend.md) → *Assessment & Prediction*). The SPA **polls** with a signal + RxJS `timer` backoff — `1s → 2s → 5s → 5s` (≈ 13 s total, `POLL_DELAYS_MS` in `core/predictions/prediction-polling.service.ts`); each poll calls `GET /students/:id/predictions?form=<formId>`. Polling stops when: the prediction for the submitted `requestId` lands, the route changes, or the terminal state is reached. On exhaustion without a prediction, the SPA enters a **terminal "processing" state** ("análise em processamento") with a **manual retry** action — retry restarts the poll only, it never resubmits the form (`requestId` preserved; see [backend](./backend.md) → *Forms*). A submission opened later is polled too: the history screen auto-polls the newest pending row, so a prediction that landed after the user navigated away still appears.
- **`requestId` idempotency**: the SPA generates a `requestId` per submission attempt; a retry reuses the same value so the API deduplicates (see [backend](./backend.md) → *Forms*).
- **Optimistic UI only where safe** (e.g. local tab state); anything that mutates students' data waits for the API response and refreshes from the server.

## Assessment Workspace (`/avaliacoes`)

Filling and reviewing assessments is a **three-screen flow**, one action per screen, with a steps indicator linking back:

1. **Pick the student** (`/avaliacoes`) — a card list, one "Selecionar" action per student. Educator: every student in scope (all they follow); guardian: only assigned students; **student: there is no chooser at all** — `skipStudentSelectorGuard` (see *Routes*) redirects a linked student straight to `/avaliacoes/:ownStudentId`, since their own attributed profile is the only possible target; an unlinked student (`studentId == null`) stays on the selector with the "conta não vinculada" hint. The student list's *Aplicar avaliação* deep-links here with the student pre-chosen.
2. **Pick the form** (`/avaliacoes/:studentId`) — a card per form from `GET /api/forms` (all four curated forms: `vark`, `anamnesis`, `socioemotional`, `behavior-checklist` — a student may fill **any** of them about themselves); the header shows who is being assessed.
3. **Submissions & results** (`/avaliacoes/:studentId/:formId`) — submission history from `GET /api/students/:id/forms/:formId/responses`: each row shows the deterministic assessment label/scores, the async ML prediction (for `type: label` **only the profile text**; for `type: percentage` scores + confidence + model version) once it lands, and expandable answers. **Result semantics come from the served form definition** (`result.hasInference` + `result.type`) — forms that declare no inference show no prediction UI and are **never polled**; the prediction is rendered by `result.type`: a definitive **label** (e.g. VARK profile — no percentages) or a **percentage** form. A row whose prediction is still pending shows an inline **"Resultado em geração"** spinner; the screen **auto-polls** the newest pending submission (`PredictionPollingService.pollFor`) so the result appears without a manual refresh — even when navigating straight into a form that was filled earlier. A toolbar **"Enviar nova avaliação"** reveals a generic questionnaire (`FormAssessment`, embedded, `[studentId]`/`[formId]`) that emits `(accepted)` when the API stores the submission — the fill screen **hides the previous results**, and on acceptance the screen collapses back so the refreshed history (including the pending new row) becomes visible — and `(predicted)` when the async prediction lands.

Avaliações are reachable from the **student ficha** (`/estudantes/:id`): the ficha `mat-tab-group` no longer embeds an assessment tab — an **"avaliações"** action button at the end of the tab strip deep-links to `/avaliacoes/:studentId`. This is the single entry point for filling/reviewing forms about a student; the workspace flow is the same for every persona (educator, guardian or the linked student themselves).

**Observations and recommendations are staff-authored**: in the ficha's Observações/Recomendações tabs the write forms (and the status/delete actions per item) render **only for educators and admins**; guardians and the linked student get the same lists **read-only** (the student's own recommendations are further visibility-filtered server-side to approved/published). Screens that a guardian/student self-view can't already reach are unreachable server-side too (403 on any write attempt).

**Submission UX**

- The submit button is `type="button"` wired to `(click)="submit($event)"` (with `(ngSubmit)` kept as a safety net and `novalidate` on the form): clicking **never triggers a native page navigation/reload** — without `preventDefault` an `ngSubmit` does a GET that reloads the page and aborts the POST.
- While the POST is in flight the questionnaire is replaced by an **"Enviando…"** processing card (indeterminate spinner). Once accepted, a **success card ("Formulário enviado com sucesso!")** is shown; for forms that declare `result.hasInference` it additionally shows a **"Gerando resultado"** spinner until the prediction lands, then a **"Resultado gerado!"** line. The result also appears as a new row in the history list.

**Forms Renderer**

The SPA renders form definitions from `GET /api/forms/:formId` into a dynamic form (`FormAssessment` in `features/assessment/`) built on design-system controls:

| API question type | Renderer control |
|-------------------|------------------|
| single choice | radio group (`mat-radio-group`) |
| multiple choice | checkbox group (`mat-checkbox`) |
| Likert scale | radio group over the scale values (1–5) |
| text | textarea (`matInput`), free-length |
| number | number input (`matInput type="number"`) |
| date | date input (`matInput type="date"`), ISO `yyyy-mm-dd` value |

- Validation is client-side complement over the definition (non-empty answers; values stored as-is — the API accepts strings, numbers and arrays per question). Server errors surface inline via the polling state (retry action preserves the same `requestId`).
- Text-like inputs (text/date/number) render **empty until answered** — binding an unanswered `undefined` value would display the literal `"undefined"` (guarded by `answerInputValue()`).
- The submit button stays disabled until every question is answered; while the request is in flight the questionnaire shows a **processing card**, and once the API accepts the submission a **success card** ("Formulário enviado com sucesso!") replaces it.
- Only forms that declare `result.hasInference` in their served definition keep polling after acceptance; other forms stop immediately and rely on the history refresh (no prediction UI or polling is ever attempted for them).
- The outcome is presented per the served `result.type`: a **definitive label** form (e.g. `vark` → `type: label`) shows **only the result text** — the profile itself (chip and/or "Seu perfil: X"), with **no score bars, confidence or model line**; a `percentage` form renders the score bars as percentages plus confidence (a future shape, enabled by the metadata without frontend changes). No form triggers the old always-100% percentage display.
- The dynamic renderer is part of the [design system](./design-system.md) (reused by future forms).
- `requestId` is generated per submission attempt; a retry reuses the same value (idempotency).

## Feature Coverage Checklist (per persona)

Derived from the RBAC matrix — the SPA shows only these actions, each wired to the corresponding endpoint in [backend](./backend.md):

- **guardian**: own profile; list/edit assigned students; fill `anamnesis` + assist `vark`; view their submissions, predictions, recommendations (approved), reports; consent for minors; student audit trail.
- **educator**: create/follow/assign students; fill `socioemotional` + `behavior-checklist` + assist `vark`; observations (write); recommendations (propose/approve); approve/deny `guardian`/`student` accounts; consent (institution basis); reports; no audit tab.
- **student**: self-register (`pending`, restricted self-service until linked); after link: edit own profile, fill **any** form about themselves (all four curated forms) and see the stored submissions/results, full self-view of own entity; observations read-only; recommendations published-only; reports (generate/list/download, never delete); **no audit trail, no raw model internals**.
- **admin**: everything above including full user management (promote/demote, reset password, delete, adjust `birthDate`), audit, all forms.

## Error Handling & User Feedback

- Single error mapping layer in `core/errors/`: API code → pt-BR copy + suggested action; unknown/network errors get a generic retry screen.
- Inline field errors for forms; toast/banner for action results; full-screen states for empty, loading, and error cases (design-system empty-state/error-state components).
- No raw API messages or technical stack traces shown to end users.

## Accessibility & Language

- UI copy is **pt-BR fixed** (domain language rule — see [architecture](./architecture.md)): strings are hardcoded pt-BR (shared string constants), **no i18n framework** in scope. A future translation layer is an explicit non-goal until a concrete need appears. Code, comments, and docs remain English.
- WCAG 2.2 AA is the floor across every screen; enforcement details live in the [design system](./design-system.md) → *Accessibility*.
- `lang="pt-BR"` set on `<html>`; pt-BR date/number/intl formatting everywhere.

## Security

- No secrets or credentials in the bundle; tokens live in memory/session storage only.
- Least-privilege navigation (guards) is a UX optimization — the API enforces real authorization.
- No third-party analytics/tracking (LGPD constraint, see [lgpd](./lgpd.md)); CSP and security headers are applied at the CloudFront level (see [security](./security.md)).
- Dependency hygiene: `npm audit` runs for frontend deps (see [security](./security.md)).

## Testing

- **Current scope: unit tests only** (Vitest, Angular CLI default runner); the API is **always mocked** (`HttpClient` mocks / injector overrides). Coverage: auth store, guards, error mapping, dynamic form renderer, polling service (fake `timer`), api clients.
- **E2e is deferred** — no Playwright (or any e2e framework) in the current plan. When e2e is introduced it runs **against the real deployed API only, never mocked**, mirroring the backend e2e scenarios in [backend](./backend.md) → *Local Development*.
- Accessibility regression (axe + manual keyboard/focus audit) rides along with the future e2e work; until then, component-level a11y contracts are asserted in unit tests.

## Dependencies

- **Depends on**: [architecture](./architecture.md) (serving topology, personas, forms engine), [auth](./auth.md) (sessions, roles, account status, consent gates), [backend](./backend.md) (endpoints, error envelope, RBAC matrix).
- **Required by** (specs that presume this one): [design-system](./design-system.md) (components exist to serve the SPA).

## See Also

- [api.yaml](./api.yaml) — OpenAPI 3.0.3 contract; source for generated DTO types
- [Design System](./design-system.md) — tokens, components, a11y baseline
- [Backend](./backend.md) — endpoints, RBAC matrix, error envelope
- [Authentication](./auth.md) — sessions, status flow, student self-service
- [Architecture](./architecture.md) — CloudFront/S3 serving, deployment order