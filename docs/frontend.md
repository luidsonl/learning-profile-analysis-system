# Frontend — Learning Profile Analysis System

> React + Vite + TypeScript SPA (pt-BR, accessible), served from `s3://learning-profile-front` behind CloudFront. One domain serves the app (`/*`) and the API (`/api/*`) — no CORS, no environment-specific config in app code.

## Stack

- **React 18 + TypeScript + Vite** (build output → `dist/`).
- **State**: auth context (token + user/role) + lightweight data fetching layer over the API client; React Query for cache/retry where server state grows.
- **Styling**: design tokens + component library from [Design System](./design-system.md).
- **Routing**: `react-router` (or framework-agnostic equivalent), role-guarded routes.
- **Accessibility**: WCAG 2.1 AA baseline, keyboard-first, reduced-motion, screen-reader labels (see [Design System](./design-system.md)).

## API Client & Proxy

- All calls go to relative `/api/...` — no absolute URLs.
- **Dev**: Vite dev server proxies `/api` → `http://localhost:3000` (the SAM local API). Config in `frontend/vite.config.ts`.
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
| `/students/:id` | scoped | Child profile + consent status |
| `/students/:id/forms` | scoped | Available forms for the child |
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

- `frontend/.env` (dev only) sets `VITE_API_PROXY_TARGET=http://localhost:3000`; production builds contain **no** environment-specific values (relative `/api`).

## Build & Deploy

1. `npm run build` → `dist/` (TypeScript check + Vite).
2. Upload to `s3://learning-profile-front/` (with `--cache-control` for hashed assets).
3. CloudFront (`terraform/aws-frontend`) serves `dist/`; invalidation on release.

Deployment order and Terraform wiring: [Architecture — Deployment Order](./architecture.md#deployment-order).

---

## See Also

- [Backend](./backend.md) — endpoints consumed under `/api`
- [Authentication](./auth.md) — sessions, roles, restricted student mode
- [Design System](./design-system.md) — tokens, components, accessibility
- [Architecture](./architecture.md) — single-domain design, CloudFront routing
