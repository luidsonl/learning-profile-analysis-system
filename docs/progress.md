# Project Progress

## Status snapshot

**As of:** 2026-08-27 · **Branch:** `main`

Backend vertical slice + offline ML pipeline + **frontend SPA** are implemented and documented. Remaining: cloud deploy of the frontend stack (S3 + CloudFront) once AWS creds are available, and the report-generator PDF stub is future work.

| Layer | Status | Notes |
|---|---|---|
| Docs (`docs/`) | ✅ Done | 10 documents covering every layer |
| Security & compliance tooling | ✅ Done | gitleaks, pre-commit, secret-scan CI |
| Terraform stateful infra (`aws-bootstrap`, `aws-app`) | ✅ Done | DynamoDB, S3 buckets, SQS report queue, async Lambdas |
| Terraform frontend infra (`terraform/aws-frontend`) | ✅ Done | S3 + CloudFront + `/api/*` origin; validated, mirrors 0shared |
| Backend API (`sam-app`) | ✅ Done | 11 Lambdas (~43 routes), RBAC + scoping |
| Forms engine | ✅ Done | Code-defined forms; guardian-assisted submissions |
| Binary student self-service | ✅ Done | student account = full self-view (no autonomy levels) |
| ML pipeline (`ml/` + `InferenceFunction`) | ✅ Done | Trained v2.0.0 on public dataset; async invoke on submission (no SQS); deployed and verified live |
| Tests (`sam-app/tests/`) | ✅ Done | 23 unit passing; e2e 76/76 green against the real stack |
| Frontend SPA (`frontend/`) | ✅ Done (code) | Tailwind v4 + Radix + Vite; all persona routes; build + lint green; deploy pending |

---

## Completed work

Everything below is implemented, tested, and documented in its own layer doc (`docs/`):

- **Infra**: Terraform stateful stack (DynamoDB single table, S3 files/data buckets, SQS report queue, async Lambdas) + SAM app with API-triggered functions.
- **Backend API**: auth/sessions, students & guardianship, versioned consent, binary student self-service, forms engine (4 curated forms), observations, recommendations lifecycle, reports (presigned download), audit trail.
- **ML integration**: `ml/` trains a Logistic Regression offline on the committed public dataset (`datasets/vark/data.csv`, macro-F1 ≈ 0.93); artifact is committed as a static serving file at `sam-app/src/inference/model/`; submissions trigger the Python `InferenceFunction` asynchronously (`InvocationType: "Event"`); it scores and writes its own `PRED#` item linked to the submission; predictions ride along in `GET /responses`. Legacy heuristic predict path removed. Dataset label quirk handled via `{A→R, V→A, K→K}` remap (see `docs/ml-pipeline.md`).
- **Security tooling**: gitleaks + pre-commit + CI secret scan; packaged-model commit exception documented.
- **Dev loop**: `make sync` (`sam sync --watch`) pushes handler code changes straight to the live Lambdas in seconds — no CloudFormation wait; `template.yaml` changes still take the full `make deploy` path, which remains the source of truth.
- **Frontend SPA** (`frontend/`): React + Vite + Tailwind v4 + Radix, pt-BR, accessible. Full persona slice: auth (login/register), dashboards, student overview + consent (LGPD), generic form engine renderer, dedicated VARK wizard (stepper), V/A/R/K profile view, recommendations, reports (generate/download), observations (educator), per-student + global audit, `/admin` audit trail, and the reduced **student self-view** mode (larger type, own-data only). Simple `apiFetch` client (token + 401 handler, no React Query yet). `npm run build` + `npm run lint` green.
- **Frontend infra** (`terraform/aws-frontend`): S3 + CloudFront distribution serving the built `dist/` for SPA routes and proxying `/api/*` to the API Gateway origin (reads the `learning-profile-api-ApiEndpoint` export). OAC + bucket policy, SPA fallback (`403/404 → index.html`), `null_resource` upload + invalidation. `terraform validate` passes. Root `make frontend` builds then deploys.

---

## Pending work

1. **Deploy the frontend** — run `make frontend` (requires AWS creds): builds the SPA, `terraform apply`s `terraform/aws-frontend` (S3 + CloudFront), and prints the `cloudfront_domain_name`. Confirm the app loads at the CloudFront URL and `/api/*` reaches the API Gateway origin.
2. **Optional cloud re-deploy checks** — `make deploy` re-runs infra/backend/frontend end-to-end if the stack changed.
3. **Report generator Lambda** — still a stub by scope decision; PDF export is future work.

---

## Suggested next steps (in order)

1. Run `make frontend` with AWS credentials to deploy the SPA and CloudFront distribution; smoke-test the app + API under the single CloudFront domain.
2. If needed, exercise the full persona flows against the deployed stack (guardian registers → adds student → consent → VARK wizard → async prediction → profile/recommendations/report) and the student self-view login.
