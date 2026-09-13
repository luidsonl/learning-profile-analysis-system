---
id: progress
title: Project Progress
type: report
status: evolving
since: 2026-08-27
lastReviewed: 2026-09-13
dependsOn: []
requiredBy: []
---

# Project Progress

## Status snapshot

**As of:** 2026-09-13 · **Branch:** `main`

Backend vertical slice + offline ML pipeline are implemented and documented. The **student self-registration + educator-link + age-based consent** flow is implemented and verified live. **2026-09-13 (access tab fix + e2e against a live table)**: ficha's **Acessos** tab reworked — `GET /auth/pending-accounts` became **`GET /auth/student-accounts`** (full catalog: pending + active with `status`/`available`/`linkedStudentId`, so a linked account shows as **already-attributed and unusable**); `GET /users` lists **all active guardians** (email optional → client-side filter). Frontend: guardian catalog with filter + assigned-responsables list; linkable accounts separated from accounts "que já não podem ser usadas". **The e2e suite no longer requires a clean table**: if an admin already exists it runs in **staged-admin mode** (registers a fixture educator and promotes it to admin directly in the DB; the bootstrap "first educator → admin" is skipped and asserted only when no admin exists). The full suite ran green **155/0 against the production stack with real users present** (covering the new catalog endpoints, guardian list, student editing in `s09` and LGPD deletion in `s10`). Fix: `GET /students/{id}` checks existence before scope, so an erased/unscoped record is a plain **404** (no existence leak), while a live-but-unscoped one stays 403. Backend unit **27/0**, frontend unit **54/0**, SAM deploy OK.

| Layer | Status | Notes |
|---|---|---|
| Specs (`specs/`) | ✅ Done | Index (`specs/README.md`) with dependency graph + layer specs; **student self-registration + educator-link + age-based consent** implemented and verified — `auth`/`architecture`/`backend`/`dynamodb-schema`/`lgpd` flipped to `stable`; **`frontend.md`/`design-system.md` re-created 2026-09-10** as `proposed` (Angular SPA + design system) |
| Security & compliance tooling | ✅ Done | gitleaks, pre-commit, secret-scan CI |
| Terraform stateful infra (`aws-bootstrap`, `aws-app`) | ✅ Done | DynamoDB, S3 buckets, SQS report queue, async Lambdas |
| Terraform frontend infra (`terraform/aws-frontend`) | ✅ Done | S3 + CloudFront + `/api/*` origin; validated, mirrors 0shared (unused while the SPA is absent) |
| Backend API (`sam-app`) | ✅ Done | 11 Lambdas (~46 routes), RBAC (admin bootstrap + approval gating) + scoping; **student self-register + educator-link + age-based consent** implemented (link `/students/:id/accounts/:userId/link`); **`DELETE /students/:id` (LGPD erasure) + `studentUser` on `GET /students/:id` added 2026-09-13 & deployed** |
| Forms engine | ✅ Done | Code-defined forms; guardian-assisted submissions |
| Binary student self-service | ✅ Done | Student **self-registers** (`role: student`, pending) and is **linked by an educator** to a single student entity (approves + attributes); adult students (≥18) `self_consent`, minors (<18) need guardian/institution — e2e verified |
| ML pipeline (`ml/` + `InferenceFunction`) | ✅ Done | Trained v2.0.0 on public dataset; async invoke on submission (no SQS); deployed and verified live |
| Tests (`sam-app/tests/`) | ✅ Done | 27 unit passing; **e2e 155/0 passing against the live stack with real users present** (staged-admin mode — no clean table required; deleted/edit/account-catalog scenarios covered) |
| Frontend SPA (`frontend/`) | ✅ Active (Angular) | **Rebuilt in Angular** (tracked in git) after the owner's removal; **ficha tabbed** (`/estudantes/:id`): Dados (edit + LGPD removal), Perfil VARK, Avaliação, Observações, Recomendações, Acessos (responsable catalog with client-side filter + **student-account catalog with used/unusable states**); `studentUser` on the profile; routes `/perfil/:studentId` and `/estudantes/:id/editar` removed; unit **54/0**, build OK |

---

## Completed work

Everything below is implemented, tested, and documented in its own layer spec (`specs/`, navigable from the [spec index](./README.md) dependency graph):

- **Infra**: Terraform stateful stack (DynamoDB single table, S3 files/data buckets, SQS report queue, async Lambdas) + SAM app with API-triggered functions.
- **Backend API**: auth/sessions (admin bootstrap, approval gating), students & guardianship (educator/admin-only creation & assignment), versioned consent, new **admin user management** (`/admin/users` — approve/deny, promote/demote, reset password, delete), forms engine (4 curated forms), observations, recommendations lifecycle, reports (presigned download), audit trail.
- **Student self-registration + educator-link + age-based consent**: students self-register (`role: student`, `pending`, `birthDate` recorded as age verification); an educator (followed) or admin **links** the account to a single student entity via `POST /students/:id/accounts/:userId/link` (approves `pending→active`, attributes the entity, at-most-one both directions). Consent gates the link: an **adult (≥ `MIN_SELF_CONSENT_AGE=18`)** self-consents (`self_consent`) on their own entity; a **minor (< 18)** requires guardian/institution consent already granted. Pending students sign in to a restricted self-service area (`me` returns `studentId: null`); once linked they get the full self-view of their own entity. `admin.mjs` can correct `birthDate`/`age`. Implemented across `auth.mjs`, `guardianship.mjs`, `consent.mjs`, `students.mjs`, `session.mjs`, `admin.mjs`, `lib/age.mjs`; verified by e2e scenarios `02`/`06`/`08`/`09`.
- **ML integration**: `ml/` trains a Logistic Regression offline on the committed public dataset (`datasets/vark/data.csv`, macro-F1 ≈ 0.93); artifact is committed as a static serving file at `sam-app/src/inference/models/vark/`; submissions trigger the Python `InferenceFunction` asynchronously (`InvocationType: "Event"`); the inference Lambda is now **multi-model**: it routes the event's `formId` to its bundled model dir (`models/<formId>/`), so new inferences are additive (register in `ml/features/prepare.py` `MODELS`, `make package-all`, redeploy) and `GET /predictions` exposes `form`/`submission` with a `?form=` filter. It scores and writes its own `PRED#` item linked to the submission; predictions ride along in `GET /responses`. Legacy heuristic predict path removed. Dataset label quirk handled via `{A→R, V→A, K→K}` remap (see `specs/ml-pipeline.md`).
- **Security tooling**: gitleaks + pre-commit + CI secret scan; packaged-model commit exception documented.
- **Dev loop**: `make sync` (`sam sync --watch`) pushes handler code changes straight to the live Lambdas in seconds — no CloudFormation wait; `template.yaml` changes still take the full `make deploy-sam-app` path, which remains the source of truth.
- **Frontend SPA** (`frontend/`): **removed by the owner** (React + Vite + Tailwind v4 + Radix app that implemented auth, dashboards, forms renderer, VARK wizard, V/A/R/K profile, recommendations, reports, observations, audit, and a student self-view mode — plus the RBAC-rework screens `/admin/users`, role-conditional actions and status-aware login — was deleted along with its `npm run build`/`npm run lint` setup). Not tracked in git. The `frontend.md` and `design-system.md` specs were **deleted too** — the SPA is planned to be **rebuilt in Angular** with fresh specs (`frontend.md`, `design-system.md`) when started.
- **Frontend infra** (`terraform/aws-frontend`): S3 + CloudFront distribution + `/api/*` origin (OAC, SPA fallback, upload + invalidation) remain validated but are **unused/un-deployed while the SPA is absent**; root `make deploy-aws-front` no longer applies until a SPA is reintroduced (planned Angular rebuild).

---

## Pending work

1. **Clean data + deploy + validate e2e (RBAC rework)** — clear the DynamoDB table (e2e assumes a clean table: the first educator must bootstrap as admin), `sam build && sam deploy` (template gained `AdminFunction`), then run `npm run test:e2e` against the real API. ✅ **Done** — deployed; *(superseded 2026-09-13: the suite now runs in staged-admin mode against a live table, no clean table required — see Status snapshot).*
2. **Frontend RBAC rework** — ✅ **Done** at the time (admin screens, role-conditional actions, status-aware login); **obsolete** — the SPA was removed by the owner.
3. ~~**Deploy the frontend**~~ — **superseded**: the SPA was removed; `make deploy-aws-front`/S3/CloudFront deploy no longer applies until a SPA is reintroduced.
4. **Report generator Lambda** — still a stub by scope decision.
5. ~~**Implement the student self-registration + educator-link + age-based consent flow**~~ — ✅ **Done and verified**: self-register (`pending`, `birthDate`), link via `POST /students/:id/accounts/:userId/link` (approves + attributes, at-most-one), adult (≥18) `self_consent` / minor needs guardian/institution (`MIN_SELF_CONSENT_AGE=18`). Implemented across `auth.mjs`, `guardianship.mjs`, `consent.mjs`, `session.mjs`, `admin.mjs`, `lib/age.mjs`, `resources.env`, `template.yaml`; e2e **125/0**. `auth`/`architecture`/`backend`/`dynamodb-schema`/`lgpd` flipped to `stable`; `frontend.md`/`design-system.md` specs later removed (SPA deleted, Angular rebuild planned).

---

## Suggested next steps (in order)

1. ✅ Cleaned, deployed, e2e validated — admin bootstrap + approval flow verified live.
2. ✅ Student self-registration + educator-link + age-based consent — implemented and verified live (e2e **125/0**); backend specs flipped to `stable`.
3. ⛔ Frontend SPA removed — no deploy pending. **Docs re-created 2026-09-10** as `proposed`: `specs/frontend.md` (Angular SPA) + `specs/design-system.md` (Angular Material, CSS-variable tokens, WCAG 2.2 AA). **Next frontend effort: implement the Angular rebuild per those specs**, then deploy via `terraform/aws-frontend`.
4. Report generator Lambda — still a future-work stub by scope decision.
