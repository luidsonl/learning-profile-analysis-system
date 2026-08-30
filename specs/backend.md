---
id: backend
title: Backend
type: spec
status: stable
since: 2026-08-27
lastReviewed: 2026-08-30
dependsOn:
  - architecture
  - dynamodb-schema
  - auth
requiredBy:
  - ml-pipeline
  - frontend
---

# Backend — Learning Profile Analysis System

> API-triggered Lambda handlers (Node.js 22 ESM) on AWS SAM, served under `/api/*` behind one CloudFront domain (no CORS). Data access maps 1:1 to the access patterns in [DynamoDB Schema](./dynamodb-schema.md).

## Conventions

- **Base path**: everything is prefixed `/api` (e.g. `POST /api/auth/login`). CloudFront routes `/*` → SPA, `/api/*` → API Gateway.
- **Auth**: `Authorization: Bearer <token>` on all authenticated routes (see [Authentication](./auth.md)).
- **Responses**: `200/201` JSON body for data; empty `204` for deletes.
- **Errors**: uniform envelope
  ```json
  { "error": { "code": "not_found", "message": "Student not found or no access." } }
  ```
  | HTTP | `code` |
  |------|--------|
  | 400 | `validation_failed` |
  | 401 | `unauthorized` |
  | 403 | `forbidden` (role or scope) |
  | 404 | `not_found` |
  | 409 | `conflict` (unique email, version conflict) |
  | 500 | `internal_error` |
- **List responses**: `{ data: [...], count }` (no cursor pagination yet).
- **Validation**: request bodies validated against the form/type schemas in `src/api/lib/validate.mjs`; reject unknown fields.
- **Audit**: actions touching a student's data write `AUDIT#STUDENT#<id>` items via the same transaction where possible (see schema).

## Endpoints

### Auth
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/auth/register` | public | Create guardian/educator account (first educator → admin bootstrap; others `pending`) **or self-register a student account** (`role: "student"`, starts `pending`, `birthDate` recorded for age-based LGPD) | `USER#` + `EMAIL#` reservation + `AUDIT#USER#` (txn) |
| `POST /api/auth/login` | public | Issue session token | `SESSION#` (GSI1 lookup) |
| `POST /api/auth/logout` | any | Revoke current session | delete `SESSION#` |
| `GET /api/auth/me` | any | Current user + role + scoped student count | `USER#<id>/META` |

### Students & guardianship
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/students` | educator, admin | Create student profile (educator auto-`FOLLOW#`; guardian **cannot**) | `STUDENT#<id>/META` + `FOLLOW#`/`EDUCATOR#` (txn) when educator |
| `GET /api/students` | guardian, educator, admin | List students in scope (guardian `GUARD#` / educator `FOLLOW#`; admin all) | Query user partition `GUARD#`/`FOLLOW#` prefix |
| `GET /api/students/:id` | scoped | Student profile | `STUDENT#<c>/META` |
| `PATCH /api/students/:id` | scoped, admin (linked student may edit their own profile fields) | Update profile (non-destructive); a linked student edits their own entity's profile | `STUDENT#<c>/META` |
| `POST /api/students/:id/guardians` | educator (scoped), admin | Grant guardianship to a guardian | `GUARD#` + `GUARDIAN#` + `AUDIT#` (txn) |
| `DELETE /api/students/:id/guardians/:userId` | educator (scoped), admin | Revoke guardianship | reverse txn |
| `POST /api/students/:id/follow` | educator | Follow a student | `FOLLOW#` + `EDUCATOR#` + `AUDIT#` (txn) |
| `DELETE /api/students/:id/follow` | educator | Unfollow | reverse txn |
| `POST /api/students/:id/student-account` | — | **Removed** — student accounts are **self-registered** via `POST /api/auth/register` (`role: "student"`); educators no longer create them | — |
| `POST /api/students/:id/accounts/:userId/link` | educator (followed), admin | **Link** an existing self-registered student account to this student entity: approves it (`pending → active`) and attributes the entity (`studentUserId`, edges) — consent-gated (adult ≥18 self-consents; minor needs guardian/institution); `at most one` account per entity and entity per account | `USER#<s>/STUDENT#<c>` + `STUDENT#<c>/LOGIN#<s>` + `STUDENT#<c>/META` (set `studentUserId`) + flip `USER#<s>/META.status` + `AUDIT#STUDENT#<c>` (txn) |
| `GET /api/students/:id/guardians` | scoped | Guardians of this student | `STUDENT#<c>/GUARDIAN#` prefix |
| `GET /api/students/:id/educators` | scoped | Educators following this student | `STUDENT#<c>/EDUCATOR#` prefix |

### Consent
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/students/:id/consent` | scoped, admin | Current consent + history (incl. `legalBasis`, `grantedByRole`) | `CONSENT#` prefix |
| `POST /api/students/:id/consent` | guardian (of the student, via `GUARD#`), educator (followed), admin, **linked adult student (≥18, `self_consent`, own entity)** | Grant/revoke versioned consent; `legalBasis: guardian|institution_authorization|self_consent`; minors (<18) never self-consent | `CONSENT#<v>#<ts>` + `META` + `AUDIT#` (txn) |

### Forms
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/forms?audience=` | any | List forms available to the persona (served from code) | in-memory registry |
| `GET /api/forms/:formId` | scoped | Form definition (read-only) | in-memory registry |
| `POST /api/students/:id/forms/:formId/responses` | persona of the form **or any persona acting for the student** (student-audience forms like `vark` may be filled by the student's own account, a guardian or educator acting for them, or an admin) | Submit responses (idempotent via `requestId`); the submission is stored **immediately** — classification/inference is a separate step | `SUBMISSION#` only — classification is a separate step |
| `GET /api/students/:id/forms/:formId/responses` | scoped | Submission history; each item rides along its `assessment` (deterministic classification, once run) and ML `prediction` (once inference lands) | Query `SUBMISSION#<formId>#` prefix + `ASSESS#`/`PRED#` lookups keyed by submission |
| `GET /api/students/:id/submissions` | scoped | Submissions across all forms (newest first) | Query `SUBMISSION#` prefix on `STUDENT#` |

### Observations
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/students/:id/observations` | educator | Add observation (behavior/performance/academic) | `OBS#<ts>` |
| `GET /api/students/:id/observations` | scoped | List observations, newest first (students: own only) | `OBS#` prefix desc |
| `DELETE /api/students/:id/observations/:timestamp` | educator (author) | Remove own observation | delete `OBS#` |

> Students see their own observations (read-only); writing/removing is educator-only.

### Assessment & Prediction
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/students/:id/assessments` | student (own), guardian, educator | Classify the student's latest stored submission | `ASSESS#<c>/VARK#<ts>` + `STUDENT#<c>/META` profile fields |
| `GET /api/students/:id/assessments?profile=vark` | scoped | Assessment history | `ASSESS#<c>` partition, SK `VARK#` prefix desc |
| `GET /api/students/:id/predictions?form=` | scoped | Prediction history with confidence, filtered by form when given | `PRED#<c>` partition, SK `PRED#` prefix desc |

**Automatic predictions**: storing a *new* form submission triggers the Python inference Lambda asynchronously (`InvocationType: "Event"` — no SQS); it scores the bundled model and writes the `PRED#` item itself. The API never waits on inference and there is no synchronous predict endpoint. If inference fails, no prediction is created; the submission stands.

> Any viewer scoped to the student receives the full prediction payload (label + scores + confidence + originating `form`/`submission`). Raw model internals are never exposed.

### Recommendations
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/students/:id/recommendations` | scoped | Recommendation list (filtered by `visibility`) | `REC#` prefix desc |
| `POST /api/students/:id/recommendations` | educator | Propose recommendations | `REC#<type>#<ts>` |
| `PATCH /api/students/:id/recommendations/:recoId` | educator, admin | Approve/publish or reject | update `REC#` status |
| `DELETE /api/students/:id/recommendations/:recoId` | educator, admin | Remove | delete `REC#` |

> Recommendations are a **manual, educator-driven** concern: prediction never auto-creates `REC#`. Educators propose and approve; students only ever see approved/published ones.

### Reports (async, 0shared pattern)
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/students/:id/reports/generate` | scoped | Enqueue report generation | `REPORT#<id>` status `queued` → SQS |
| `GET /api/students/:id/reports` | scoped | Report metadata list | `REPORT#` prefix desc |
| `GET /api/reports/:reportId/download` | scoped, sharedWith | Presigned GET URL to the PDF | GSI1 `REPORT#<id>` → S3 presign |
| `DELETE /api/reports/:reportId` | scoped (any role except student) | Remove report (and object) | delete `REPORT#` + S3 object |

### Admin — User Management (approval & RBAC)
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/admin/users` | admin (all roles), educator (guardian/student only) | List users by optional `role`/`status` filter | GSI2 `RoleStatus` query per role |
| `PATCH /api/admin/users/:id` | admin, educator | Change `status` (approve/deny), `role` (promote/demote, admin only), and **`birthDate`/`age`** (adjust LGPD eligibility); guards: no self-demote, no last-admin removal | `USER#<id>/META` + `AUDIT#USER#` |
| `POST /api/admin/users/:id/password` | admin | Reset a user's password | update `USER#<id>/META` `passwordHash` |
| `DELETE /api/admin/users/:id` | admin | Hard-delete account: user items + `EMAIL#` + sessions + reverse edges | deletes across partitions |

> **Approval gating** — educators/guardians register `pending` and can't sign in until approved. Educators may approve/deny `guardian`/`student` accounts (status only). Admins additionally approve/deny educators and promote/demote `educator↔admin`. The **first educator to register** (when no admin exists) becomes the initial `admin`+`active`.

### Admin — Audit
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/audit/students/:id` | admin, scoped | Audit trail of a student | `AUDIT#STUDENT#<c>` prefix desc |
| `GET /api/audit?actor=` | admin | Audit trail by actor | `AUDIT#USER#<id>` prefix desc |
| `GET /api/health` | public | Lambda health/liveness | — |

---

## RBAC Matrix

| Endpoint group | guardian | educator | student | admin |
|----------------|:--------:|:--------:|:-------:|:-----:|
| Auth (login/logout/me) | ✓ (pending must be approved) | ✓ | ✓ | ✓ |
| Students CRUD | assigned (read/edit; **no create**) | followed (create/edit) | own (read; **edit own profile**, linked ⇒ active) | ✓ |
| Guardianship | view assigned | assign (scoped)/✓ | ✗ | ✓ |
| Follow | ✗ | ✓ | ✗ | ✗ |
| Student account (self-register / link) | ✗ | link + approve (scoped) | self-register (pending self-service); linked ⇒ own | ✓ |
| User management (approval/RBAC) | ✗ | approve guardian/student (status only) | ✗ | ✓ (full, incl. edit birthDate) |
| Consent | assigned students | followed (grant/revoke, institution basis) | own (self_consent, **only if ≥18**) | ✓ |
| Forms (fill) | anamnesis, vark (assistido) | socioemotional, behavior-checklist, vark (assistido) | vark | ✓ all |
| Observations | ✗ | ✓ | own (read-only) | ✓ |
| Assessments / Predict | assigned students | followed | own (full payload) | ✓ |
| Recommendations | assigned (approved) | propose/approve | own (published) | ✓ |
| Reports | assigned students | followed | own (incl. generate; never delete) | ✓ |
| Audit | assigned students (trail) | ✗ | ✗ | ✓ |

Every data access is additionally **scope-checked** (edges in DynamoDB), not just role-checked — see [Authentication](./auth.md).

---

## Async Processing (Terraform-managed Lambdas)

| Lambda | Trigger | Work |
|--------|---------|------|
| `report-generator` | SQS `learning-profile_reports` | Generate PDF from student data → `s3://learning-profile-files/reports/<id>.pdf` → set `REPORT#` status `ready` |
| `feature-export` | EventBridge nightly | Export labeled assessments + observations to versioned snapshots on `-data` bucket (decoupling contract, see [ML Pipeline](./ml-pipeline.md)) |

Both are stateful-adjacent and therefore live in `terraform/aws-app`, not SAM.

---

## Local Development

The API is exercised via the deployed stack (`make e2e-test` runs the e2e suite against it). There is no local Lambda/DynamoDB emulation wired up — keep the feedback loop on the real stack.

---

## Dependencies

- **Depends on**: [architecture](./architecture.md) (flows, deployment), [dynamodb-schema](./dynamodb-schema.md) (access patterns consumed 1:1), [auth](./auth.md) (`requireAuth`/`requireRole`, scope edges, RBAC).
- **Required by** (specs that presume this one): [ml-pipeline](./ml-pipeline.md) (inference trigger + `GET /predictions` read path), [frontend](./frontend.md) (endpoints consumed under `/api`).

## See Also

- [Authentication](./auth.md) — `requireAuth`/`requireRole`, scope checks over edges
- [DynamoDB Schema](./dynamodb-schema.md) — the access patterns each endpoint uses
- [Architecture](./architecture.md) — flows, deployment order
- [Frontend](./frontend.md) — SPA consuming these endpoints under `/api`
