# Project Progress

## Status snapshot

**As of:** 2026-08-23 · **Commits:** 19 · **Branch:** `main`

The backend vertical slice (auth → children/guardianship → forms/VARK assessment → prediction → recommendations → reports → audit) is implemented, tested, and documented. The two remaining layers are the **frontend SPA** and the **ML pipeline**, plus its CloudFront/S3 Terraform stack.

| Layer | Status | Notes |
|---|---|---|
| Docs (`docs/`) | ✅ Done | 10 documents covering every layer |
| Security & compliance tooling | ✅ Done | gitleaks, pre-commit, secret-scan CI |
| Terraform stateful infra (`terraform/aws-bootstrap`, `aws-app`) | ✅ Done | DynamoDB, S3 buckets, SQS report queue, async Lambdas |
| Terraform frontend infra (`terraform/aws-frontend`) | ❌ Not started | CloudFront + S3 for the SPA |
| Backend API (`sam-app`) | ✅ Done | 14 Lambda functions, ~47 routes, RBAC + scoping |
| Forms engine | ✅ Done | Versioned definitions, processors, decoupled classification |
| Graduated student autonomy | ✅ Done | supervised / guided / autonomous levels |
| Test suites (`sam-app/tests/`) | ✅ Done | Unit + e2e against a deployed API, self-cleaning fixtures |
| Frontend SPA (`frontend/`) | ❌ Not started | React + Vite, pt-BR |
| ML pipeline (`ml/`) | ❌ Not started | Offline training on exported snapshots |

---

## Completed work

### Documentation

All planned layer docs exist and are kept aligned with implementation:

`architecture.md`, `backend.md`, `auth.md`, `dynamodb-schema.md`, `ml-pipeline.md`, `lgpd.md`, `frontend.md`, `design-system.md`, `security.md`, `student-data-features.md`.

Recent additions cover LGPD legal bases, institution consent, and the graduated-autonomy model.

### Security & compliance (public-repo rules)

Per `docs/security.md`: root `.gitignore`, `.gitleaks.toml`, `.pre-commit-config.yaml`, `.github/workflows/secret-scan.yml`, `SECURITY.md`. No secrets, account IDs, or real personal data committed; test fixtures use fabricated identities (`example.com`). Latest hardening: gitleaks-action v3 + checkout v6 in CI.

### Infrastructure — Terraform

- **`aws-bootstrap`**: remote-state bucket (AWS provider 5.x).
- **`aws-app`**: stateful resources via `resources/main.tf` modules:
  - `database` — DynamoDB single table (`learning-profile`)
  - `files` — S3 bucket for reports/documents
  - `data` — S3 bucket for ML data exports/artifacts
  - `report_queue` — SQS + Lambda `report-generator`
  - `feature_export` — nightly snapshot export Lambda (retraining input)
- Async Lambdas source: `terraform/aws-app/src/` (`feature-export.mjs`, `report-generator.mjs`).

### Backend API — SAM (`sam-app/`)

14 API Gateway–triggered Lambda functions (`template.yaml`):

`Health`, `Auth`, `Children`, `Guardianship`, `Consent`, `Autonomy`, `Forms`, `Observations`, `Assessment`, `Predict`, `Recommendations`, `Reports`, `Models`, `Audit`.

Route groups:

- **Auth**: register, login, logout, me — sessions in DynamoDB.
- **Children & guardianship**: CRUD, guardians add/remove, educator follow/unfollow, student-account creation under guardian consent.
- **Consent & autonomy**: versioned consent records; autonomy level get/patch (supervised/guided/autonomous).
- **Forms engine**: form definitions + versions (`GET/POST /forms*`); submissions stored separately from classification.
- **Assessment & prediction**: classification of stored submissions (`/children/{id}/assessments`, `/children/{id}/predict`) — fully decoupled steps; inference reads the active model from the registry (`MODEL#name#version`).
- **Recommendations**: propose/approve/delete lifecycle (educator workflow).
- **Reports**: generate (async via SQS), list, download (presigned URL), delete.
- **Models registry**: list/get, activate, retire (admin-only).
- **Audit**: trail listing + per-child audit query.

Shared library (`src/lib/`): validation, sessions, role/scope enforcement, ID encoding, HTTP helpers, DynamoDB access.

Forms definitions (`src/forms/definitions/`): `vark-kids` (student), `anamnesis` (guardian), `socioemotional` + `behavior-checklist` (educator), each versioned; processors in `src/forms/processors/vark.mjs`.

### Graduated student autonomy

Students are minors with a restricted self-view (no observations, no raw ML output). Autonomy levels gate what a student can see/do themselves:

- **supervised** — actions require guardian mediation
- **guided** — limited self-service (label-only predictions)
- **autonomous** — full restricted self-view

Enforced in handlers + scope lib; covered by unit tests (`tests/unit/autonomy.test.mjs`) and e2e flows (including the educator-led no-guardian case).

### Tests (`sam-app/tests/`)

- **Unit**: VARK processor scoring, forms JSON schema, forms engine, autonomy matrix.
- **E2E** (`api.test.mjs`): runs against a deployed API endpoint (`API_BASE`), creates only its own fixture users/children, and cleans up after itself (`aws-cleanup.mjs` purges test-only emails and orphan sessions). Covers 20 scenario blocks end-to-end: health, auth lifecycle, permissions matrix, consent, guardianship/student account, form visibility by role, submission→classification decoupling, prediction, follow/lists, observations, recommendation approval flow, autonomy-gated predict, reports generation/download, model RBAC, audit trail.

### Tooling & scripts

`sam-app/Makefile`, `samconfig.toml`, `scripts/gen-env.mjs` (env.json.example generator), `scripts/seed.mjs`; `resources.env` for deploy-time config.

---

## Pending work

1. **Frontend SPA** (`frontend/`) — React + Vite, pt-BR, accessible; consumes `/api/*` through the same CloudFront domain (see `docs/frontend.md`, `docs/design-system.md`). Largest remaining piece of the MVP.
2. **ML pipeline** (`ml/`) — dataset preparation (Armand & Eboue 2021 + own collected data), offline scikit-learn training, artifact registry upload to S3 (`MODEL#name#version`), evaluation; per `docs/ml-pipeline.md`. Backend inference handler already exists — it needs a packaged model artifact to serve.
3. **`terraform/aws-frontend`** — S3 + CloudFront stack for the SPA, wiring the `/api/*` origin to the existing API Gateway stage.

---

## MVP vertical slice checklist

| Step | Status |
|---|---|
| Auth (guardian/educator/student/admin) | ✅ |
| Children + guardianship + educator follow | ✅ |
| LGPD consent (versioned) | ✅ |
| VARK assessment via forms engine | ✅ |
| Decoupled assessment → prediction | ✅ (backend ready; awaits first trained model artifact) |
| Recommendations lifecycle | ✅ |
| Async reports (SQS + presigned download) | ✅ |
| Audit trail | ✅ |
| Frontend UI for all personas | ❌ |
| First trained model deployed to PredictFunction | ❌ |

---

## Suggested next steps (in order)

1. Scaffold `frontend/` (Vite + React, pt-BR) and implement persona flows against the live API.
2. Add `terraform/aws-frontend` (CloudFront + S3 + `/api/*` origin integration).
3. Build `ml/` offline pipeline; train v0 on the public dataset; package artifact into `PredictFunction`.
