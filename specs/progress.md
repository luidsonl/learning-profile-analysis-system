---
id: progress
title: Project Progress
type: report
status: evolving
since: 2026-08-27
lastReviewed: 2026-08-29
dependsOn: []
requiredBy: []
---

# Project Progress

## Status snapshot

**As of:** 2026-08-27 · **Branch:** `main`

Backend vertical slice + offline ML pipeline + **frontend SPA** are implemented and documented. The **frontend RBAC rework** is done (admin approval/promotion screens, role-conditional actions, status-aware login); the SPA **remains un-deployed** (S3 + CloudFront) pending `make frontend`.

| Layer | Status | Notes |
|---|---|---|
| Specs (`specs/`) | ✅ Done | Index (`specs/README.md`) with dependency graph + 11 layer specs; RBAC updated for the new approval/admin flow |
| Security & compliance tooling | ✅ Done | gitleaks, pre-commit, secret-scan CI |
| Terraform stateful infra (`aws-bootstrap`, `aws-app`) | ✅ Done | DynamoDB, S3 buckets, SQS report queue, async Lambdas |
| Terraform frontend infra (`terraform/aws-frontend`) | ✅ Done | S3 + CloudFront + `/api/*` origin; validated, mirrors 0shared |
| Backend API (`sam-app`) | ✅ Done | 11 Lambdas (~46 routes), RBAC (admin bootstrap + approval gating) + scoping; **AdminFunction** added |
| Forms engine | ✅ Done | Code-defined forms; guardian-assisted submissions |
| Binary student self-service | ✅ Done | student account = full self-view (no autonomy levels) |
| ML pipeline (`ml/` + `InferenceFunction`) | ✅ Done | Trained v2.0.0 on public dataset; async invoke on submission (no SQS); deployed and verified live |
| Tests (`sam-app/tests/`) | In progress | 23 unit passing; e2e rewritten for the new RBAC flow, still to be run against the real stack after data cleanup + deploy |
| Frontend SPA (`frontend/`) | ✅ Reworked | Tailwind v4 + Radix + Vite; RBAC rework complete — `/admin/users` (approval/promotion/password/delete), role-conditional creation/assignment/consent, status-aware pending/denied login; build + lint green |

---

## Completed work

Everything below is implemented, tested, and documented in its own layer spec (`specs/`, navigable from the [spec index](./README.md) dependency graph):

- **Infra**: Terraform stateful stack (DynamoDB single table, S3 files/data buckets, SQS report queue, async Lambdas) + SAM app with API-triggered functions.
- **Backend API**: auth/sessions (admin bootstrap, approval gating), students & guardianship (educator/admin-only creation & assignment), versioned consent, binary student self-service, new **admin user management** (`/admin/users` — approve/deny, promote/demote, reset password, delete), forms engine (4 curated forms), observations, recommendations lifecycle, reports (presigned download), audit trail.
- **ML integration**: `ml/` trains a Logistic Regression offline on the committed public dataset (`datasets/vark/data.csv`, macro-F1 ≈ 0.93); artifact is committed as a static serving file at `sam-app/src/inference/model/`; submissions trigger the Python `InferenceFunction` asynchronously (`InvocationType: "Event"`); it scores and writes its own `PRED#` item linked to the submission; predictions ride along in `GET /responses`. Legacy heuristic predict path removed. Dataset label quirk handled via `{A→R, V→A, K→K}` remap (see `specs/ml-pipeline.md`).
- **Security tooling**: gitleaks + pre-commit + CI secret scan; packaged-model commit exception documented.
- **Dev loop**: `make sync` (`sam sync --watch`) pushes handler code changes straight to the live Lambdas in seconds — no CloudFormation wait; `template.yaml` changes still take the full `make deploy` path, which remains the source of truth.
- **Frontend SPA** (`frontend/`): React + Vite + Tailwind v4 + Radix, pt-BR, accessible. Full persona slice: auth (login/register), dashboards, student overview + consent (LGPD), generic form engine renderer, dedicated VARK wizard (stepper), V/A/R/K profile view, recommendations, reports (generate/download), observations (educator), per-student + global audit, `/admin` audit trail, and the reduced **student self-view** mode (larger type, own-data only). Simple `apiFetch` client (token + 401 handler, no React Query yet). `npm run build` + `npm run lint` green.
- **Frontend infra** (`terraform/aws-frontend`): S3 + CloudFront distribution serving the built `dist/` for SPA routes and proxying `/api/*` to the API Gateway origin (reads the `learning-profile-api-ApiEndpoint` export). OAC + bucket policy, SPA fallback (`403/404 → index.html`), `null_resource` upload + invalidation. `terraform validate` passes. Root `make frontend` builds then deploys.

---

## Pending work

1. **Clean data + deploy + validate e2e (RBAC rework)** — clear the DynamoDB table (e2e assumes a clean table: the first educator must bootstrap as admin), `sam build && sam deploy` (template gained `AdminFunction`), then run `npm run test:e2e` against the real API (e2e rewritten for the admin-pending-approval flow). *(Done: deployed + 117/0 e2e passing — see [frontend rework below].)*
2. **Rework the frontend for the new RBAC** — new admin screens (user management: approval/promotion/password/delete), make creation/assignment/actions conditional by `role`, and handle login of a pending/denied account (status-aware messaging). ✅ **Done** — `frontend.md` mirrors the new role/status rules; `/admin/users` (admin full, educator scoped to guardian/student approvals), creation/assignment gated to `educator`/`admin`, consent to `guardian`/`educator`/`admin`, status-aware login; `npm run build` + `npm run lint` green.
3. **Deploy the frontend** — run `make frontend` (requires AWS creds): builds the SPA, `terraform apply`s `terraform/aws-frontend` (S3 + CloudFront), and prints the `cloudfront_domain_name`. Confirm the app loads at the CloudFront URL and `/api/*` reaches the API Gateway origin.
4. **Report generator Lambda** — still a stub by scope decision; PDF export is future work.

---

## Suggested next steps (in order)

1. ✅ Cleaned, deployed, e2e validated (117/0) — admin bootstrap + approval flow verified live.
2. ✅ Frontend RBAC rework — `/admin/users` + role-conditional actions + status-aware login (build/lint green).
3. Deploy the SPA: run `make frontend` with AWS credentials (build + S3 + CloudFront), then smoke-test the app + API under the single CloudFront domain.
