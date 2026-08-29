---
id: frontend
title: Frontend
type: spec
status: stable
since: 2026-08-27
lastReviewed: 2026-08-29
dependsOn:
  - architecture
  - backend
  - auth
  - design-system
requiredBy: []
---

# Frontend — Learning Profile Analysis System

> React + Vite + TypeScript SPA (pt-BR, accessible), served from `s3://learning-profile-front` behind CloudFront. One domain serves the app (`/*`) and the API (`/api/*`) — no CORS, no environment-specific config in app code.

## Stack

- **React + TypeScript + Vite** (build output → `dist/`). React 19 + react-router v7.
- **State**: auth context (token + user/role) + lightweight data fetching layer over the API client — no heavy query library yet. React Query can be added later where server state grows (lists with retry/cache), but the MVP ships with a simple `apiFetch` client + hooks.
- **Styling**: **Tailwind CSS v4** + **Radix UI** primitives, with the design tokens (indigo primary, surfaces, WCAG AA values) from [Design System](./design-system.md) expressed as Tailwind `@theme` variables in `styles/tokens.css`. Chosen to mirror the 0shared stack; token values follow this project's light theme, not 0shared's monospace dark theme.
- **Routing**: `react-router` v7, role-guarded routes.
- **Accessibility**: WCAG 2.1 AA baseline, keyboard-first, reduced-motion, screen-reader labels (see [Design System](./design-system.md)), Radix handles focus trap/radiogroup keyboard semantics where applicable.

## API Client & Proxy

- All calls go to relative `/api/...` — no absolute URLs.
- **Dev**: Vite dev server proxies `/api` → `http://127.0.0.1:3000` (the SAM local API); override with `VITE_API_BASE` if the deployed API should be used in dev. Config in `frontend/vite.config.ts`.
- **Prod**: CloudFront routes `/api/*` → API Gateway, `/*` → SPA. No per-environment configuration in app code.
- The client attaches `Authorization: Bearer <token>` from the auth context; on 401 it clears the session and redirects to `/login`.

```
  browser ──► /api/...  ──► (dev)  Vite proxy  ──► :3000 (sam local)
                            └──── (prod) CloudFront ──► API Gateway
```

## Routes (pt-BR)

| Path | Persona | Page |
|------|---------|------|
| `/login` | public | Login |
| `/` | guardian/educator/admin | Dashboard (students in scope) |
| `/students/:id` | scoped | Student profile + consent status |
| `/students/:id/forms` | scoped | Available forms for the student |
| `/students/:id/forms/vark` | student (own) | VARK questionnaire (kid-friendly wizard) |
| `/students/:id/profile` | scoped | Learning profile (V/A/R/K + multimodal) |
| `/students/:id/recommendations` | scoped | Adapted pedagogical strategies |
| `/students/:id/reports` | scoped | Report list + download |
| `/students/:id/observations` | educator | Observations (educator-only; hidden from student persona) |
| `/admin/*` | admin | Users, forms definitions, audit |
| `/me` | any | Own account (guardian/educator) |

Student persona sees a **simplified self-view**: own profile, recommendations, approved reports, and the forms they can fill — never observations or raw ML output.

## Auth & Role Guarding

- `<RequireRole roles={...}>` wraps routes; unauthenticated → `/login`.
- Scope is enforced server-side (see [Authentication](./auth.md)); the UI only *hides* what the backend already denies.
- Student mode: after login as `student`, the app enters a simplified visual mode (larger type, fewer nav items, playful but non-childish copy — LGPD-friendly wording).

> **Not yet reworked for the new RBAC:** the SPA predates the approval/admin-bootstrap backend. Pending work (see [progress](./progress.md)): admin user-approval/promotion/password/delete screens under `/admin/*`, making creation/assignment/consent actions conditional on `role` (only educator/admin create students and assign responsables/self-accounts), and handling login of a `pending`/`denied` account with status-aware messaging instead of a generic failure.

## Feature Areas

1. **Form engine renderer** — generic renderer over `FORM#` definitions: renders question types (single, multiple, likert, text, number, date), sections, progress, required validation; submit via `POST /api/students/:id/forms/:formId/responses` (idempotent `requestId`).
2. **VARK wizard** — kid-friendly adaptation of the questionnaire with per-modality progress; on submit shows the resulting profile.
3. **Profile view** — V/A/R/K totals + multimodal label + confidence (from `GET /api/students/:id/predictions`), with plain-language explanation (no raw ML).
4. **Recommendations** — list, filter by `visibility`; educator can propose/approve; guardian/student see approved.
5. **Reports** — generate (async), poll status, download via presigned URL.
6. **Admin** — user management, form version editing, audit browser.

## Local Development

```
Terminal 1:  sam local start-api --env-vars env.json --host 0.0.0.0   (API on :3000)
Terminal 2:  npm run dev                                             (Vite on :5173)
```

- `frontend/.env` (dev only, git-ignored) may set `VITE_API_BASE=http://127.0.0.1:3000` (or the deployed CloudFront/API URL); production builds contain **no** environment-specific values (relative `/api`).
- Runtime API base mirror: `public/env.js` exposes `window.__ENV__.API_BASE` (empty by default → relative `/api`, routed by CloudFront). Same mechanism as 0shared; keeps no config in app code for prod.

## Build & Deploy

1. `npm run build` → `dist/` (TypeScript check + Vite).
2. `terraform/aws-frontend` builds/uploads: `aws s3 sync dist/ → s3://learning-profile-front/ --delete` (hashed assets get long cache via CloudFront) and creates a `/*` invalidation on release, via a `null_resource` that re-runs on any frontend source change.
3. CloudFront serves `dist/` for `/*` and proxies `/api/*` to the API Gateway origin (read from the SAM CloudFormation export `learning-profile-api-ApiEndpoint`).

Single command from the repo root: `make frontend` (build + `terraform apply`). Deployment order and Terraform wiring: [Architecture — Deployment Order](./architecture.md#deployment-order). The SAM template exports `ApiEndpoint` (see `sam-app/template.yaml` Outputs) which `terraform/aws-frontend` reads via `aws_cloudformation_export`.

---

## Dependencies

- **Depends on**: [architecture](./architecture.md) (single-domain design, CloudFront routing), [backend](./backend.md) (endpoints consumed under `/api`), [auth](./auth.md) (sessions, roles, restricted student mode), [design-system](./design-system.md) (tokens, components, accessibility).
- **Required by**: none currently (design-system references it for stack details; there is no frontend-dependent spec yet).

## See Also

- [Backend](./backend.md) — endpoints consumed under `/api`
- [Authentication](./auth.md) — sessions, roles, restricted student mode
- [Design System](./design-system.md) — tokens, components, accessibility
- [Architecture](./architecture.md) — single-domain design, CloudFront routing
