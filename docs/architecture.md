# Architecture — Learning Profile Analysis System

## Overview

The Learning Profile Analysis System is a serverless platform that personalizes education for gifted students and students with specific needs. It ingests data supplied by guardians, educators, and the students themselves through structured **forms** (academic history, learning preferences, observed behaviors, socioemotional indicators), runs machine learning analysis, and produces adapted pedagogical strategies and visual reports shared between families and educators.

Four personas are served: **educator**, **guardian** (parent/legal responsible), **student** (the child, with a full self-view of own data), and **admin**. Access control is role- and scope-based: guardians see only their own children; educators see only children they follow; students see only their own profile, submissions, predictions, observations, and reports; administrators manage users and the institution's data.

The architecture mirrors the reference project [0shared](https://github.com/luidsonl/0shared): **Terraform** for stateful infrastructure, **AWS SAM** for stateless API-triggered Lambdas, **CloudFront + S3** for a React+Vite SPA, and **DynamoDB single-table** design. It adds a **fully decoupled ML subsystem**: machine learning is trained **offline only** (Python pipeline in `ml/`), the artifact is **bundled into** a Python inference Lambda deployed with SAM, and predictions are generated automatically after form submissions via asynchronous invoke (**no SQS in the ML path**). The system itself never trains models.

The backend API is served under the `/api` path prefix so a single CloudFront distribution serves both the static frontend (`/*`) and the API (`/api/*`) from one domain, without CORS.

---

## Architecture Diagram

```
                         CloudFront
                        ┌──────────┐
                        │  CDN     │
                        └────┬─────┘
            ┌────────────────┴────────────────┐
            │                                 │
            ▼                                 ▼
      ┌──────────┐                    ┌──────────────┐
      │ S3       │                    │ API Gateway  │
      │ (front)  │                    │ (REST API)   │
      └──────────┘                    └──────┬───────┘
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │ Lambda       │
                                      │ (Node.js 22) │
                                      └──────┬───────┘
            ┌───────────────────────────────┴────────────┐
            ▼                                            ▼
      ┌──────────┐                              ┌──────────────┐
      │ DynamoDB │                              │ S3 (files)   │
      │ single-  │                              │ reports,     │
      │ table    │                              │ documents    │
      └──────────┘                              └──────────────┘
            ▲                                            ▲
            │ (async Lambdas — Terraform)                │ (model artifacts,
      ┌─────┴──────────────┐                     ┌───────┴─────┐
      │ feature-export     │                     │ S3 (data)   │
      │ report-generator   │                     │ snapshots + │
      └────────────────────┘                     │ models      │
                                                 └───────┬─────┘
                                                         │ (offline train)
                                                  ┌─────────────┐
                                                  │ ML pipeline │
                                                  │ (Python)    │
                                                  └─────────────┘
```

**Form filling flow (generic engine — submission and classification are decoupled):**

```
  Persona (guardian / educator / student) ──► GET /api/forms/:formId ──► form definition (FORM#)
      │
      ▼
  Persona ──► POST /api/students/:id/forms/:formId/responses ──► Submission Lambda ──► DynamoDB
                                                                     (STUDENT#/SUBMISSION# item)
  Anyone scoped ──► GET /api/students/:id/submissions ──► stored tests (all forms, newest first)
```

**Assessment → prediction flow:**

```
  User ──► POST /api/students/:id/assessments ──► reads latest stored submission
                                                      │ (classify.mjs — form processor score)
                                                      ▼
                                                DynamoDB (ASSESS# item + student profile fields)
  User ──► POST /api/students/:id/forms/:formId/responses ──► Forms Lambda stores SUBMISSION#
                                                      │ fire-and-forget async invoke ("Event")
                                                      ▼
                                  Inference Lambda (Python, bundled model) ──► scores features
                                                      ▼
                                                DynamoDB (PRED# item, written by inference fn)

  Predictions are machine-generated data, distinct from human input (submissions/assessments).
  There is no synchronous predict endpoint; scoped readers poll GET /api/students/:id/predictions.

  Recommendations are a separate, educator-driven concern:
  User ──► POST /api/students/:id/recommendations ──► DynamoDB (REC# item, proposed)
  User ──► PATCH /api/students/:id/recommendations/:recoId ──► approved/published (REC# update)
```

**Report generation flow (async, 0shared pattern):**

```
  User ──► POST /api/students/:id/reports/generate ──► Generate Lambda ──► SQS queue ──► Report Lambda
                                                                                           │
  User ◄── metadata (REPORT# item) ────────────────────────────────────────────────────────┤
  User ──► GET /api/reports/:reportId/download ──► presigned GET URL ◄──── S3 (files) ◄────┘
```

**Feedback loop (offline ML retraining):**

```
  (future phase) VARK submissions + observations ──► nightly EventBridge ──► feature-export Lambda
                                                                    │ (S3 snapshot + manifest)
  v0: ml/ pipeline trains locally on datasets/vark/data.csv
      → make package bundles model.joblib into sam-app/src/inference/model/
      → sam build && sam deploy → predictions now carry the new version
```

Training always happens **outside** the deployed system (local machine). The deployed stack only stores submissions and serves auto-generated predictions from the bundled artifact; it never runs a training job, and **no SQS/queue participates in the ML path** — the submission→prediction trigger is a direct asynchronous Lambda invoke.

---

## Project Structure

```
├── terraform/
│   ├── aws-bootstrap/     # S3 bucket for Terraform state (one-time)
│   ├── aws-app/           # DynamoDB + S3 buckets (files/data) + SQS + async Lambdas
│   │   └── src/           # feature-export.mjs, report-generator.mjs
│   └── aws-frontend/      # S3 static bucket + CloudFront + OAC + deploy
├── frontend/              # React + Vite SPA (pt-BR, accessible)
├── sam-app/               # API Gateway + API-triggered Lambdas (stateless compute)
│   ├── template.yaml      # SAM template (health, auth, students, guardianship,
│   │                      #   observations, forms, assessment,
│   │                      #   recommendations, reports, audit, inference)
│   ├── samconfig.toml     # SAM config (stack name, parameter overrides)
│   ├── resources.env      # Central resource names (source of truth)
│   ├── Makefile           # deploy, redeploy-api, unit/e2e tests, db-clean/db-wipe, clean
│   └── src/handlers/      # Lambda code (Node.js ESM)
│       ├── health.mjs, auth.mjs, students.mjs, guardianship.mjs,
│       ├── observations.mjs, forms.mjs (submissions, assessments,
│       │                  predictions),
│       ├── recommendations.mjs, reports.mjs, audit.mjs
│       ├── middleware/    # requireAuth + requireRole (guardian | educator | student | admin)
│       └── lib/           # Shared utilities (DynamoDB client, VARK scoring, form engine, etc.)
├── ml/                    # Offline Python ML pipeline (decoupled)
│   ├── data/              # Public dataset (Mendeley 10.17632/bwrr6zypcj.1) + feature snapshots
│   ├── features/          # Feature engineering (assessment/observation → feature vectors)
│   ├── train/             # scikit-learn training + k-fold CV
│   ├── evaluate/          # Metrics (accuracy, F1, Hamming loss) + reports
│   └── serve/             # Package model for Lambda (artifact bundle + sanity checks)
├── docs/                  # architecture, backend, auth, dynamodb-schema, ml-pipeline,
│                          #   student-data, lgpd, frontend, design-system
├── agents.md
└── Makefile
```

---

## Tooling Strategy

### Terraform — Infrastructure as Code

Terraform manages all **stateful, long-lived infrastructure**:

| Resource | Responsibility |
|----------|----------------|
| `terraform/aws-bootstrap/` | S3 bucket for Terraform state |
| `terraform/aws-app/` | DynamoDB table, S3 files bucket (reports/documents), S3 data bucket (ML artifacts/Parquet snapshots), SQS report queue + DLQ, async Lambdas (feature-export, report-generator), EventBridge schedule (nightly VARK/observation export), event source mappings |

Rationale matches 0shared: stateful resources must not be recreated, `prevent_destroy` protects them, and non-API-triggered Lambdas are centralized with the infrastructure they process.

### AWS SAM — Application Layer

SAM manages **stateless, ephemeral compute** (API-triggered Lambdas) plus API Gateway:

| Resource | Responsibility |
|----------|----------------|
| `template.yaml` | All API handlers (Node.js 22 ESM), inference Lambda (Python 3.12, bundled model, invoked asynchronously by the Forms handler), REST API Gateway |
`sam-app/src/handlers/` | Business logic

The API is exercised via the deployed stack (`make e2e-test` in `sam-app/`); no local Lambda/DynamoDB emulation is wired up.

---

## Resource Name Centralization

Naming follows the 0shared derivation chain: `terraform/aws-app/terraform.tfvars` → `sam-app/resources.env` → `samconfig.toml`.

**Naming formula** (`namespace=learning-profile`, `project=learning-profile`):

| Resource | Formula | Example |
|----------|---------|---------|
| DynamoDB table | `{project_name}{env_under}{table_suffix}` | `learning-profile` |
| Files S3 bucket | `{namespace}-{project_name}{env_dash}{files_bucket_suffix}` | `learning-profile-files` |
| Data S3 bucket (ML) | `{namespace}-{project_name}{env_dash}{data_bucket_suffix}` | `learning-profile-data` |
| Frontend S3 bucket | `{namespace}-{project_name}{env_dash}{front_bucket_suffix}` | `learning-profile-front` |
| Report SQS queue | `{project_name}{env_under}{queue_suffix}` | `learning-profile_reports` |
| SAM stack | hardcoded in `samconfig.toml` | `app-learning-profile-backend` |

---

## Integration Between Terraform and SAM

The two layers share values using the same two mechanisms as 0shared:

1. **SAM → Terraform (CloudFormation exports):** SAM exports `ApiEndpoint`; the frontend Terraform module reads it via `data "aws_cloudformation_export"`.
2. **Terraform → SAM (SAM parameters):** table name, bucket names, async Lambda names, SQS queue URL are passed via `--parameter-overrides`, sourced from `resources.env` and live Terraform outputs.

---

## Forms Engine

Data collection is built on a generic, hybrid forms engine:

- **Generic engine underneath:** form definitions (`FORM#<formId>`, versioned) describe sections and typed questions; submissions are stored per child (`STUDENT#<studentId> / SUBMISSION#<formId>#<timestamp>`). Question types: single choice, multiple choice, Likert scale, text, number, date.
- **Curated forms library (in code):** definitions live in `src/forms/definitions/` and are served read-only — no form state in the database. The engine ships with domain forms, each targeting a persona:

  | Form | Filled by | Purpose |
  |------|-----------|---------|
  | `vark` | Student (with guardian/educator help if needed) | VARK questionnaire — scored into a VARK learning profile |
  | `anamnesis` | Guardian | Academic history, background, socio-family intake |
  | `socioemotional` | Educator | Socioemotional indicators |
  | `behavior-checklist` | Educator | Observed behaviors / performance feedback |

- **A profile is traced from a filled form:** each form submission is interpreted by a profile module into dimensions and labels (e.g., the `vark` form produces the VARK profile — V/A/R/K totals + multimodal label per Fleming's method, stored as an assessment `ASSESS#`). The MVP implements the VARK profile; future profiles (giftedness, difficulty, socioemotional) follow the same pattern: a form + a scoring/classification step.
- **Admin editing:** form content is editable via the admin panel; edits create a new form **version** (never a destructive update), so past submissions stay interpretable.

Forms are the system's data-collection mechanism; machine learning is an **offline, decoupled layer** that classifies profiles from form-derived features. See [Profiles & Machine Learning](#profiles--machine-learning-decoupled) and the standalone [ML Pipeline](./ml-pipeline.md) spec.

---

## Profiles & Machine Learning (decoupled)

The core idea: **a profile is traced from a filled form.** Forms collect structured responses, and a profile module interprets a student's submissions into dimensions and labels. The MVP implements the **VARK learning profile** (V/A/R/K + multimodal label); future profiles (giftedness, difficulty, socioemotional) reuse the same pattern — a form plus a scoring/classification step.

Machine learning is a *separate, offline* layer that classifies those profiles:

- The running system **never trains**. It stores submissions and serves machine-generated predictions from the artifact bundled into the inference function (details in [ML Pipeline](./ml-pipeline.md)).
- Training runs offline (local machine) on the committed public dataset (`datasets/vark/data.csv`); the packaged `model.joblib` + `meta.json` are **copied into** `sam-app/src/inference/model/` and deployed with SAM — no S3 fetch at runtime; each `PRED#` item records the `model` + `modelVersion` that produced it (traceability without a registry).
- Inference runs asynchronously: storing a new submission fires a fire-and-forget invoke (`InvocationType: "Event"`, **no SQS**) at the Python inference Lambda, which scores and persists the `PRED#` item itself. There is no synchronous predict endpoint.
- MVP model: `vark-predictor` (offline-trained Logistic Regression; dataset labels are remapped at serving via `{A→R, V→A, K→K}` — see [ML Pipeline](./ml-pipeline.md)). Heuristic `giftedness-indicator` and `difficulty-indicator` remain rule-based companions.

The dataset (Armand, Eboue 2021, Mendeley Data, V1, DOI: 10.17632/bwrr6zypcj.1), the snapshot/export contract, training, and retraining are documented in the standalone **[ML Pipeline](./ml-pipeline.md)** spec — kept separate so future trainings and ideas can evolve it without touching the system.

---

## Security & LGPD

- **RBAC:** roles `guardian | educator | student | admin` enforced by `requireRole` middleware on top of Bearer-token sessions (0shared auth flow).
- **Scope enforcement:** guardians query children via their `USER#` partition (guardianship edges); educators via `FOLLOW#` edges; students access only their own child profile through a dedicated student link. No cross-tenant enumeration.
- **Binary student self-service:** there are no autonomy levels — access is binary. A user either has an account or does not; a form is filled either by its intended audience or by the responsible adult acting for them. A student account holder gets the full self-view of own data (submissions, predictions with scores, observations, reports) and can only edit their own name. Enforcement lives in `src/lib/scope.mjs`.
- **Explicit consent:** consent (versioned, with **legal basis** `guardian | institution_authorization | self_consent` and `grantedByRole`) is required before a child's data is processed. Creating a student account is initiated by the guardian **or an educator following the child** (institution-led onboarding for students without a guardian) and gated by consent. Consent revocation blocks new processing.
- **Audit log:** every access/action on a student's data writes a `AUDIT#` item (who, what, when).
- **Data minimization & retention:** students' records are kept minimal; retention/erasure policy is documented in `lgpd.md`.
- **Encryption:** S3 buckets use SSE; DynamoDB uses AWS KMS; in-transit TLS via CloudFront/API Gateway.
- **S3 buckets** block public access; files bucket objects are private and served only via presigned URLs.

---

## Local Development Workflow

```
Terminal 1:  (sam-app/)  make e2e-test      # e2e suite against the deployed API
Terminal 2:  npm run dev                    # Vite on :5173, proxies /api → deployed API
```

`frontend/vite.config.ts` proxies `/api` in dev; production uses relative paths routed by CloudFront — no environment-specific config in app code.

---

## Deployment Order

```
 1. terraform/aws-bootstrap/   (one-time S3 state bucket)
 2. terraform/aws-app/        (DynamoDB + S3 files/data + SQS report queue + async Lambdas + EventBridge)
 3. sam-app/                  (API-triggered Lambdas + API Gateway, exports ApiEndpoint)
 4. terraform/aws-frontend/   (S3 static + CloudFront + frontend build & upload)
```

The root `Makefile` orchestrates the whole chain, mirroring 0shared:

```sh
make deploy-full   # first time: bootstrap + infra + backend (+ frontend when it exists)
make deploy        # regular: infra + backend
make backend       # SAM only: sam build && sam deploy && forced API Gateway deployment
make train package # offline ML: retrain and bundle a new artifact into sam-app
make destroy-backend / make destroy
```

`sam-app/Makefile` handles the backend alone; its `redeploy-api` step works around the SAM "empty deployment" race (a no-op deploy can leave the Prod stage without the routes). Database maintenance: `make db-clean` (default: legacy `MODEL#`/`FORM#` orphans; pass `PREFIXES="..."` to target others) and `make db-wipe CONFIRM=yes` (full wipe).

Cleanup happens in reverse order.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Serverless (no persistent servers) | Low cost at low load, no operations burden — fits a small institution |
| Split Terraform / SAM | Stateful infra is protected and centralized; stateless compute benefits from `sam local start-api` |
| Single CloudFront domain with `/api` prefix | No CORS; one domain for app + API + future mobile consumption |
| DynamoDB single-table | Follows 0shared; disciplined access-pattern design with entity prefixes and GSIs |
| Student as a restricted persona | Minors exercise LGPD rights; scoped self-view without exposing educator observations |
| Hybrid forms engine (generic engine + curated library) | One mechanism for all data collection (VARK, anamnese, socioemotional, behavior) with code-versioned definitions |
| Profiles traced from forms | A profile is the interpretation of a filled form (VARK in the MVP); new forms → new profiles additively |
| ML fully decoupled — offline training only | System never trains; standalone `ml-pipeline.md` spec keeps dataset + training evolvable independently |
| Small packaged model in Lambda over SageMaker | Cheapest for the MVP; SageMaker remains a documented upgrade path |
| Heuristic giftedness/difficulty indicators in MVP | No public dataset exists; heuristic rules are honest and explainable while data is collected |
| PDF reports server-side via SQS | Async generation avoids request timeouts; output lands in S3 and is shared by presigned URL |
| LGPD in-scope for MVP | Students' data is sensitive (minors especially); consent + audit are foundational, not retrofits |
| VARK questionnaire | Closes the domain gap with the public dataset (students aged 10-18+); serves every persona |

---

## Extending This Architecture

- **New API handler:** add `sam-app/src/handlers/<name>.mjs`, wire in `template.yaml` under `/api/*`.
- **New async processing:** add a Terraform-managed Lambda + SQS/EventBridge wiring in `terraform/aws-app`.
- **New model:** extend the offline `ml/` pipeline (see [ML Pipeline](./ml-pipeline.md)) and bundle it into the inference handler.
- **New DynamoDB access pattern:** document it in `dynamodb-schema.md` first, then add the GSI/attribute — schema changes are treated as design changes, not hacks.

---

## See Also

- [Backend](./backend.md) — API endpoints, error handling
- [Authentication](./auth.md) — sessions, RBAC, consent
- [DynamoDB Schema](./dynamodb-schema.md) — single-table design, entities, indexes
- [ML Pipeline](./ml-pipeline.md) — features, training, inference
- [Student Data Features](./student-data-features.md) — structured data for student categorization (future direction)
- [LGPD](./lgpd.md) — consent, audit, retention
- [Frontend](./frontend.md) — SPA, routes, build & deploy
- [Design System](./design-system.md) — tokens, components, accessibility
