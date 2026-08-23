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
- **Pagination**: list endpoints return `{ data: [...], nextToken }`; `nextToken` passed as `?cursor=` (DynamoDB `ExclusiveStartKey` base64).
- **Validation**: request bodies validated against the form/type schemas in `src/lib/validation.mjs`; reject unknown fields.
- **Audit**: actions touching a child's data write `AUDIT#STUDENT#<id>` items via the same transaction where possible (see schema).

## Endpoints

### Auth
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/auth/register` | public | Create guardian/educator/admin account | `USER#` + `EMAIL#` reservation + `AUDIT#USER#` (txn) |
| `POST /api/auth/login` | public | Issue session token | `SESSION#` (GSI1 lookup) |
| `POST /api/auth/logout` | any | Revoke current session | delete `SESSION#` |
| `GET /api/auth/me` | any | Current user + role + scoped student count | `USER#<id>/META` |

### Students & guardianship
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/students` | guardian, educator, admin | Create child profile | `STUDENT#<id>/META` |
| `GET /api/students` | guardian, educator, admin | List children in scope (guardian `GUARD#` / educator `FOLLOW#`; admin all) | Query user partition `GUARD#`/`FOLLOW#` prefix |
| `GET /api/students/:id` | scoped | Child profile | `STUDENT#<c>/META` |
| `PATCH /api/students/:id` | scoped, admin | Update profile (non-destructive) | `STUDENT#<c>/META` |
| `POST /api/students/:id/guardians` | admin, guardian | Grant guardianship to a guardian | `GUARD#` + `GUARDIAN#` + `AUDIT#` (txn) |
| `DELETE /api/students/:id/guardians/:userId` | admin | Revoke guardianship | reverse txn |
| `POST /api/students/:id/follow` | educator | Follow a child | `FOLLOW#` + `EDUCATOR#` + `AUDIT#` (txn) |
| `DELETE /api/students/:id/follow` | educator | Unfollow | reverse txn |
| `POST /api/students/:id/student-account` | guardian (of child), educator (followed), admin | Create the student (minor) account — **consent-gated** (institution-led onboarding when no guardian) | `USER#`+`EMAIL#`+`STUDENT#`+`STUDENT#` edge (txn) |
| `GET /api/students/:id/guardians` | scoped | Who can see this child | `STUDENT#<c>/GUARDIAN#` prefix |
| `GET /api/students/:id/educators` | scoped | Who follows this child | `STUDENT#<c>/EDUCATOR#` prefix |
| `GET /api/students/:id/autonomy` | scoped, admin | Current level + versioned history | `AUTONOMY#` prefix |
| `PATCH /api/students/:id/autonomy` | guardian (of child), educator (followed), admin | Set autonomy level (`supervised|guided|autonomous`) — versioned + audited | `AUTONOMY#<ts>` + `META` + `AUDIT#` (txn) |

### Consent
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/students/:id/consent` | scoped, admin | Current consent + history (incl. `legalBasis`, `grantedByRole`) | `CONSENT#` prefix |
| `POST /api/students/:id/consent` | guardian (of child), educator (followed), admin | Grant/revoke versioned consent; `legalBasis: guardian|institution_authorization|self_consent` | `CONSENT#<v>#<ts>` + `META` + `AUDIT#` (txn) |

### Forms
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/forms?audience=` | any | List forms available to the persona (served from code) | in-memory registry |
| `GET /api/forms/:formId` | scoped | Form definition (read-only) | in-memory registry |
| `POST /api/students/:id/forms/:formId/responses` | persona of the form; **guardian may also submit student-audience forms** (child fills together with the guardian on the guardian's account) | Submit responses (idempotent via `requestId`) | `SUBMISSION#` only — classification is a separate step |
| `GET /api/students/:id/forms/:formId/responses` | scoped | Submission history | Query `SUBMISSION#<formId>#` prefix |
| `GET /api/students/:id/submissions` | scoped | Stored tests across all forms (newest first) | Query `SUBMISSION#` prefix on `STUDENT#` |

### Observations
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/students/:id/observations` | educator | Add observation (behavior/performance/academic) | `OBS#<ts>` |
| `GET /api/students/:id/observations` | scoped (not student) | List observations, newest first | `OBS#` prefix desc |
| `DELETE /api/students/:id/observations/:timestamp` | educator (author) | Remove own observation | delete `OBS#` |

> Students **never** see observations (restricted self-view).

### Assessment & Prediction
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/students/:id/assessments` | student (own), guardian, educator | Classify the child's latest stored submission | `ASSESS#vark#<ts>` + child profile fields |
| `GET /api/students/:id/assessments?profile=vark` | scoped | Assessment history | `ASSESS#<profile>#` prefix desc |
| `GET /api/students/:id/predictions?profile=vark` | scoped | Prediction history with confidence | `PRED#<profile>#` prefix desc |

**Automatic predictions**: storing a *new* form submission triggers the Python inference Lambda asynchronously (`InvocationType: "Event"` — no SQS); it scores the bundled model and writes the `PRED#` item itself. The API never waits on inference and there is no synchronous predict endpoint. If inference fails, no prediction is created; the submission stands.

> Student view shows only their own latest profile/confidence — never raw model internals. Autonomy gating applies at read time: supervised students receive label-only prediction payloads.

### Recommendations
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/students/:id/recommendations` | scoped | Recommendation list (filtered by `visibility`) | `REC#` prefix desc |
| `POST /api/students/:id/recommendations` | educator | Propose recommendations | `REC#<type>#<ts>` |
| `PATCH /api/students/:id/recommendations/:timestamp` | educator, admin | Approve/publish or reject | update `REC#` status |
| `DELETE /api/students/:id/recommendations/:timestamp` | educator, admin | Remove | delete `REC#` |

> Recommendations are a **manual, educator-driven** concern: prediction never auto-creates `REC#`. Educators propose and approve; students only ever see approved/published ones.

### Reports (async, 0shared pattern)
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/students/:id/reports/generate` | scoped | Enqueue report generation | `REPORT#<id>` status `queued` → SQS |
| `GET /api/students/:id/reports` | scoped | Report metadata list | `REPORT#` prefix desc |
| `GET /api/reports/:reportId/download` | scoped, sharedWith | Presigned GET URL to the PDF | GSI1 `REPORT#<id>` → S3 presign |
| `DELETE /api/reports/:reportId` | admin, scoped | Remove report (and object) | delete `REPORT#` + S3 object |

### Admin — Audit
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/audit/students/:id` | admin, scoped | Audit trail of a child | `AUDIT#STUDENT#<c>` prefix desc |
| `GET /api/audit?actor=` | admin | Audit trail by actor | `AUDIT#USER#<id>` prefix desc |
| `GET /api/health` | public | Lambda health/liveness | — |

---

## RBAC Matrix

| Endpoint group | guardian | educator | student | admin |
|----------------|:--------:|:--------:|:-------:|:-----:|
| Auth (login/logout/me) | ✓ | ✓ | ✓ | ✓ |
| Students CRUD | own students | followed (create/edit) | own profile (read; edit name only when `autonomous`) | ✓ |
| Guardianship | view own | ✗ | ✗ | ✓ |
| Follow | ✗ | ✓ | ✗ | ✗ |
| Student account | own students | followed (institution onboarding) | ✗ | ✓ |
| Consent | own students | followed (grant/revoke, institution basis) | ✗ | ✓ |
| Autonomy level | own students (set) | followed (set) | ✗ | ✓ |
| Forms (fill) | anamnesis | socioemotional, behavior-checklist | vark | ✓ all |
| Observations | ✗ | ✓ | own read-only if `guided`+ | ✓ |
| Assessments / Predict | own students | followed | own (label always; scores+confidence if `guided`+) | ✓ |
| Recommendations | own students (approved) | propose/approve | own (published) | ✓ |
| Reports | own students | followed | own if `autonomous` (never delete) | ✓ |
| Audit | own students (trail) | ✗ | ✗ | ✓ |

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

## See Also

- [Authentication](./auth.md) — `requireAuth`/`requireRole`, scope checks over edges
- [DynamoDB Schema](./dynamodb-schema.md) — the access patterns each endpoint uses
- [Architecture](./architecture.md) — flows, deployment order
- [Frontend](./frontend.md) — SPA consuming these endpoints under `/api`
