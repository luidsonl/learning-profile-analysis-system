# Project Progress

## Status snapshot

**As of:** 2026-08-23 · **Branch:** `main`

Backend vertical slice + offline ML pipeline are implemented and documented. Remaining: deploy the new inference stack, then the **frontend SPA** and its CloudFront/S3 Terraform stack.

| Layer | Status | Notes |
|---|---|---|
| Docs (`docs/`) | ✅ Done | 10 documents covering every layer |
| Security & compliance tooling | ✅ Done | gitleaks, pre-commit, secret-scan CI |
| Terraform stateful infra (`aws-bootstrap`, `aws-app`) | ✅ Done | DynamoDB, S3 buckets, SQS report queue, async Lambdas |
| Terraform frontend infra (`terraform/aws-frontend`) | ❌ Not started | CloudFront + S3 for the SPA |
| Backend API (`sam-app`) | ✅ Done | 12 Lambdas (~45 routes), RBAC + scoping |
| Forms engine | ✅ Done | Code-defined forms; guardian-assisted submissions |
| Graduated student autonomy | ✅ Done | supervised / guided / autonomous levels |
| ML pipeline (`ml/` + `InferenceFunction`) | ✅ Implemented | Trained v2.0.0 on public dataset; async invoke on submission; no SQS — **pending `sam build && sam deploy`** |
| Tests (`sam-app/tests/`) | ✅ Done | 29 unit passing; e2e updated to the new prediction flow (needs redeploy to run) |
| Frontend SPA (`frontend/`) | ❌ Not started | React + Vite, pt-BR |

---

## Completed work

Everything below is implemented, tested, and documented in its own layer doc (`docs/`):

- **Infra**: Terraform stateful stack (DynamoDB single table, S3 files/data buckets, SQS report queue, async Lambdas) + SAM app with API-triggered functions.
- **Backend API**: auth/sessions, students & guardianship, versioned consent, graduated autonomy, forms engine (4 curated forms), observations, recommendations lifecycle, reports (presigned download), audit trail.
- **ML integration**: `ml/` trains a Logistic Regression offline on the committed public dataset (`datasets/vark/data.csv`, macro-F1 ≈ 0.93); artifact is committed as a static serving file at `sam-app/src/inference/model/`; submissions trigger the Python `InferenceFunction` asynchronously (`InvocationType: "Event"`); it scores and writes its own `PRED#` item linked to the submission; predictions ride along in `GET /responses`. Legacy heuristic predict path removed. Dataset label quirk handled via `{A→R, V→A, K→K}` remap (see `docs/ml-pipeline.md`).
- **Security tooling**: gitleaks + pre-commit + CI secret scan; packaged-model commit exception documented.

---

## Pending work

1. **Deploy ML stack** — `make deploy` at the repo root (or `cd sam-app && make deploy`; python3.12 runtime needs pip available for native builds or use docker), then run `make e2e-test` against the deployed API. Ops tooling in place: root orchestrator Makefile, `redeploy-api` race workaround, `db-clean`/`db-wipe`.
2. **Frontend SPA** (`frontend/`) — React + Vite, pt-BR, accessible; consumes `/api/*` through the same CloudFront domain (see `docs/frontend.md`, `docs/design-system.md`). Largest remaining piece of the MVP.
3. **`terraform/aws-frontend`** — S3 + CloudFront stack for the SPA, wiring the `/api/*` origin to the existing API Gateway stage.
4. **Report generator Lambda** — still a stub by scope decision; PDF export is future work.

---

## Suggested next steps (in order)

1. Deploy the SAM app and register model v2.0.0; validate e2e (submission → async prediction visible in responses).
2. Scaffold `frontend/` (Vite + React, pt-BR) and implement persona flows against the live API.
3. Add `terraform/aws-frontend` (CloudFront + S3 + `/api/*` origin integration).
