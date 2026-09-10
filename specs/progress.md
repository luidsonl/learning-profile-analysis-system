---
id: progress
title: Project Progress
type: report
status: evolving
since: 2026-08-27
lastReviewed: 2026-09-10
dependsOn: []
requiredBy: []
---

# Project Progress

## Status snapshot

**As of:** 2026-09-10 · **Branch:** `main`

Backend vertical slice + offline ML pipeline are implemented and documented. The **student self-registration + educator-link + age-based consent** flow is implemented and verified live (e2e 125/0, now 134/0 after adding the **account-discovery endpoints**). The **frontend SPA was removed by the owner** (directory deleted, nothing tracked in git); the S3/CloudFront deploy remains unused until/unless the SPA is reintroduced — planned as a **future rebuild in Angular** under fresh specs. **The frontend docs were re-created on 2026-09-10**: `frontend.md` and `design-system.md` are back as `proposed` specs (Angular SPA + Angular Material design system on CSS-variable tokens, WCAG 2.2 AA) — registered in the dependency graph; implementation pending. **Also on 2026-09-10 the specs were sharpened through a design interview**: material-native tokens win by default (custom CSS vars only for gaps), no charting library for now (semantic card components instead), prediction polling contract (backoff 1s→2s→5s, 15s cap, manual retry preserving `requestId`), unit-test-only strategy (Vitest, API mocked; e2e deferred, real API when it comes), lenient session policy without idle logout (risk accepted), and responsive-first layout (mobile bottom nav/drawer, rail ≥ sm, sidebar ≥ md; touch targets ≥ 44 px). **2026-09-10 (backend)**: `GET /auth/pending-accounts` and `GET /users?role=guardian&email=` added (spec `api.yaml`, `lib/accounts.mjs`, handlers in `auth.mjs`/`guardianship.mjs`), deployed and verified live — e2e **134/0**.

| Layer | Status | Notes |
|---|---|---|
| Specs (`specs/`) | ✅ Done | Index (`specs/README.md`) with dependency graph + layer specs; **student self-registration + educator-link + age-based consent** implemented and verified — `auth`/`architecture`/`backend`/`dynamodb-schema`/`lgpd` flipped to `stable`; **`frontend.md`/`design-system.md` re-created 2026-09-10** as `proposed` (Angular SPA + design system) |
| Security & compliance tooling | ✅ Done | gitleaks, pre-commit, secret-scan CI |
| Terraform stateful infra (`aws-bootstrap`, `aws-app`) | ✅ Done | DynamoDB, S3 buckets, SQS report queue, async Lambdas |
| Terraform frontend infra (`terraform/aws-frontend`) | ✅ Done | S3 + CloudFront + `/api/*` origin; validated, mirrors 0shared (unused while the SPA is absent) |
| Backend API (`sam-app`) | ✅ Done | 11 Lambdas (~46 routes), RBAC (admin bootstrap + approval gating) + scoping; **student self-register + educator-link + age-based consent** implemented (link `/students/:id/accounts/:userId/link`) |
| Forms engine | ✅ Done | Code-defined forms; guardian-assisted submissions |
| Binary student self-service | ✅ Done | Student **self-registers** (`role: student`, pending) and is **linked by an educator** to a single student entity (approves + attributes); adult students (≥18) `self_consent`, minors (<18) need guardian/institution — e2e verified |
| ML pipeline (`ml/` + `InferenceFunction`) | ✅ Done | Trained v2.0.0 on public dataset; async invoke on submission (no SQS); deployed and verified live |
| Tests (`sam-app/tests/`) | ✅ Done | 27 unit passing; **e2e 134/0 passing** against the real stack (admin bootstrap + new student flow + account-discovery endpoints) |
| Frontend SPA (`frontend/`) | ⛔ Removed | SPA directory deleted by the owner (not tracked in git); **docs re-created 2026-09-10** (`frontend.md` + `design-system.md`, `proposed`); no S3/CloudFront deploy until reintroduced (planned: Angular) |

---

## Completed work

Everything below is implemented, tested, and documented in its own layer spec (`specs/`, navigable from the [spec index](./README.md) dependency graph):

- **Infra**: Terraform stateful stack (DynamoDB single table, S3 files/data buckets, SQS report queue, async Lambdas) + SAM app with API-triggered functions.
- **Backend API**: auth/sessions (admin bootstrap, approval gating), students & guardianship (educator/admin-only creation & assignment), versioned consent, new **admin user management** (`/admin/users` — approve/deny, promote/demote, reset password, delete), forms engine (4 curated forms), observations, recommendations lifecycle, reports (presigned download), audit trail.
- **Student self-registration + educator-link + age-based consent**: students self-register (`role: student`, `pending`, `birthDate` recorded as age verification); an educator (followed) or admin **links** the account to a single student entity via `POST /students/:id/accounts/:userId/link` (approves `pending→active`, attributes the entity, at-most-one both directions). Consent gates the link: an **adult (≥ `MIN_SELF_CONSENT_AGE=18`)** self-consents (`self_consent`) on their own entity; a **minor (< 18)** requires guardian/institution consent already granted. Pending students sign in to a restricted self-service area (`me` returns `studentId: null`); once linked they get the full self-view of their own entity. `admin.mjs` can correct `birthDate`/`age`. Implemented across `auth.mjs`, `guardianship.mjs`, `consent.mjs`, `students.mjs`, `session.mjs`, `admin.mjs`, `lib/age.mjs`; verified by e2e scenarios `02`/`06`/`08`/`09`.
- **ML integration**: `ml/` trains a Logistic Regression offline on the committed public dataset (`datasets/vark/data.csv`, macro-F1 ≈ 0.93); artifact is committed as a static serving file at `sam-app/src/inference/models/vark/`; submissions trigger the Python `InferenceFunction` asynchronously (`InvocationType: "Event"`); the inference Lambda is now **multi-model**: it routes the event's `formId` to its bundled model dir (`models/<formId>/`), so new inferences are additive (register in `ml/features/prepare.py` `MODELS`, `make package-all`, redeploy) and `GET /predictions` exposes `form`/`submission` with a `?form=` filter. It scores and writes its own `PRED#` item linked to the submission; predictions ride along in `GET /responses`. Legacy heuristic predict path removed. Dataset label quirk handled via `{A→R, V→A, K→K}` remap (see `specs/ml-pipeline.md`).
- **Security tooling**: gitleaks + pre-commit + CI secret scan; packaged-model commit exception documented.
- **Dev loop**: `make sync` (`sam sync --watch`) pushes handler code changes straight to the live Lambdas in seconds — no CloudFormation wait; `template.yaml` changes still take the full `make deploy` path, which remains the source of truth.
- **Frontend SPA** (`frontend/`): **removed by the owner** (React + Vite + Tailwind v4 + Radix app that implemented auth, dashboards, forms renderer, VARK wizard, V/A/R/K profile, recommendations, reports, observations, audit, and a student self-view mode — plus the RBAC-rework screens `/admin/users`, role-conditional actions and status-aware login — was deleted along with its `npm run build`/`npm run lint` setup). Not tracked in git. The `frontend.md` and `design-system.md` specs were **deleted too** — the SPA is planned to be **rebuilt in Angular** with fresh specs (`frontend.md`, `design-system.md`) when started.
- **Frontend infra** (`terraform/aws-frontend`): S3 + CloudFront distribution + `/api/*` origin (OAC, SPA fallback, upload + invalidation) remain validated but are **unused/un-deployed while the SPA is absent**; root `make frontend` no longer applies until a SPA is reintroduced (planned Angular rebuild).

---

## Pending work

1. **Clean data + deploy + validate e2e (RBAC rework)** — clear the DynamoDB table (e2e assumes a clean table: the first educator must bootstrap as admin), `sam build && sam deploy` (template gained `AdminFunction`), then run `npm run test:e2e` against the real API. ✅ **Done** — deployed; still needs a clean table before each full e2e run.
2. **Frontend RBAC rework** — ✅ **Done** at the time (admin screens, role-conditional actions, status-aware login); **obsolete** — the SPA was removed by the owner.
3. ~~**Deploy the frontend**~~ — **superseded**: the SPA was removed; `make frontend`/S3/CloudFront deploy no longer applies until a SPA is reintroduced.
4. **Report generator Lambda** — still a stub by scope decision.
5. ~~**Implement the student self-registration + educator-link + age-based consent flow**~~ — ✅ **Done and verified**: self-register (`pending`, `birthDate`), link via `POST /students/:id/accounts/:userId/link` (approves + attributes, at-most-one), adult (≥18) `self_consent` / minor needs guardian/institution (`MIN_SELF_CONSENT_AGE=18`). Implemented across `auth.mjs`, `guardianship.mjs`, `consent.mjs`, `session.mjs`, `admin.mjs`, `lib/age.mjs`, `resources.env`, `template.yaml`; e2e **125/0**. `auth`/`architecture`/`backend`/`dynamodb-schema`/`lgpd` flipped to `stable`; `frontend.md`/`design-system.md` specs later removed (SPA deleted, Angular rebuild planned).

---

## Suggested next steps (in order)

1. ✅ Cleaned, deployed, e2e validated — admin bootstrap + approval flow verified live.
2. ✅ Student self-registration + educator-link + age-based consent — implemented and verified live (e2e **125/0**); backend specs flipped to `stable`.
3. ⛔ Frontend SPA removed — no deploy pending. **Docs re-created 2026-09-10** as `proposed`: `specs/frontend.md` (Angular SPA) + `specs/design-system.md` (Angular Material, CSS-variable tokens, WCAG 2.2 AA). **Next frontend effort: implement the Angular rebuild per those specs**, then deploy via `terraform/aws-frontend`.
4. Report generator Lambda — still a future-work stub by scope decision.
