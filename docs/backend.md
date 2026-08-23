# Backend — Learning Profile Analysis System

> API-triggered Lambda handlers (Node.js 22 ESM) on AWS SAM, served under `/api/*` behind one CloudFront domain (no CORS). Data access maps 1:1 to the access patterns in [DynamoDB Schema](./dynamodb-schema.md).

## Conventions

- **Base path**: everything is prefixed `/api` (e.g. `POST /api/auth/login`). CloudFront routes `/*` → SPA, `/api/*` → API Gateway.
- **Auth**: `Authorization: Bearer <token>` on all authenticated routes (see [Authentication](./auth.md)).
- **Responses**: `200/201` JSON body for data; empty `204` for deletes.
- **Errors**: uniform envelope
  ```json
  { "error": { "code": "not_found", "message": "Child not found or no access." } }
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
- **Audit**: actions touching a child's data write `AUDIT#CHILD#<id>` items via the same transaction where possible (see schema).

## Endpoints

### Auth
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/auth/register` | public | Create guardian/educator/admin account | `USER#` + `EMAIL#` reservation + `AUDIT#USER#` (txn) |
| `POST /api/auth/login` | public | Issue session token | `SESSION#` (GSI1 lookup) |
| `POST /api/auth/logout` | any | Revoke current session | delete `SESSION#` |
| `GET /api/auth/me` | any | Current user + role + scoped children count | `USER#<id>/META` |

### Children & guardianship
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/children` | guardian, educator, admin | Create child profile | `CHILD#<id>/META` |
| `GET /api/children` | guardian, educator, admin | List children in scope (guardian `GUARD#` / educator `FOLLOW#`; admin all) | Query user partition `GUARD#`/`FOLLOW#` prefix |
| `GET /api/children/:id` | scoped | Child profile | `CHILD#<c>/META` |
| `PATCH /api/children/:id` | scoped, admin | Update profile (non-destructive) | `CHILD#<c>/META` |
| `POST /api/children/:id/guardians` | admin, guardian | Grant guardianship to a guardian | `GUARD#` + `GUARDIAN#` + `AUDIT#` (txn) |
| `DELETE /api/children/:id/guardians/:userId` | admin | Revoke guardianship | reverse txn |
| `POST /api/children/:id/follow` | educator | Follow a child | `FOLLOW#` + `EDUCATOR#` + `AUDIT#` (txn) |
| `DELETE /api/children/:id/follow` | educator | Unfollow | reverse txn |
| `POST /api/children/:id/student-account` | guardian (of child), educator (followed), admin | Create the student (minor) account — **consent-gated** (institution-led onboarding when no guardian) | `USER#`+`EMAIL#`+`STUDENT#`+`CHILD#` edge (txn) |
| `GET /api/children/:id/guardians` | scoped | Who can see this child | `CHILD#<c>/GUARDIAN#` prefix |
| `GET /api/children/:id/educators` | scoped | Who follows this child | `CHILD#<c>/EDUCATOR#` prefix |
| `GET /api/children/:id/autonomy` | scoped, admin | Current level + versioned history | `AUTONOMY#` prefix |
| `PATCH /api/children/:id/autonomy` | guardian (of child), educator (followed), admin | Set autonomy level (`supervised|guided|autonomous`) — versioned + audited | `AUTONOMY#<ts>` + `META` + `AUDIT#` (txn) |

### Consent
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/children/:id/consent` | scoped, admin | Current consent + history (incl. `legalBasis`, `grantedByRole`) | `CONSENT#` prefix |
| `POST /api/children/:id/consent` | guardian (of child), educator (followed), admin | Grant/revoke versioned consent; `legalBasis: guardian|institution_authorization|self_consent` | `CONSENT#<v>#<ts>` + `META` + `AUDIT#` (txn) |

### Forms
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/forms?audience=` | any | List active forms for a persona | GSI2 `FORM#AUD#<audience>` |
| `GET /api/forms/:formId` | any | Active form definition | `FORM#<id>/CURRENT` → `VERSION#<v>` |
| `GET /api/forms/:formId/versions/:version` | admin, scoped | Historical definition | `FORM#<id>/VERSION#<v>` |
| `POST /api/forms` | admin | Publish a new form version (never destructive) | `VERSION#` + `CURRENT` (txn) |
| `POST /api/children/:id/forms/:formId/responses` | persona of the form; **guardian may also submit student-audience forms** (child fills together with the guardian on the guardian's account) | Submit responses (idempotent via `requestId`) | `SUBMISSION#` only — classification is a separate step |
| `GET /api/children/:id/forms/:formId/responses` | scoped | Submission history | Query `SUBMISSION#<formId>#` prefix |
| `GET /api/children/:id/submissions` | scoped | Stored tests across all forms (newest first) | Query `SUBMISSION#` prefix on `CHILD#` |

### Observations
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/children/:id/observations` | educator | Add observation (behavior/performance/academic) | `OBS#<ts>` |
| `GET /api/children/:id/observations` | scoped (not student) | List observations, newest first | `OBS#` prefix desc |
| `DELETE /api/children/:id/observations/:timestamp` | educator (author) | Remove own observation | delete `OBS#` |

> Students **never** see observations (restricted self-view).

### Assessment & Prediction
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/children/:id/assessments` | student (own), guardian, educator | Classify the child's latest stored submission | `ASSESS#vark#<ts>` + child profile fields |
| `GET /api/children/:id/assessments?profile=vark` | scoped | Assessment history | `ASSESS#<profile>#` prefix desc |
| `POST /api/children/:id/predict` | scoped | Run inference on the stored submission (active model registry) | `PRED#<profile>#<ts>` (no `REC#`) |
| `GET /api/children/:id/predictions?profile=vark` | scoped | Prediction history with confidence | `PRED#<profile>#` prefix desc |

> Student view shows only their own latest profile/confidence — never raw model internals.

### Recommendations
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/children/:id/recommendations` | scoped | Recommendation list (filtered by `visibility`) | `REC#` prefix desc |
| `POST /api/children/:id/recommendations` | educator | Propose recommendations | `REC#<type>#<ts>` |
| `PATCH /api/children/:id/recommendations/:timestamp` | educator, admin | Approve/publish or reject | update `REC#` status |
| `DELETE /api/children/:id/recommendations/:timestamp` | educator, admin | Remove | delete `REC#` |

> Recommendations are a **manual, educator-driven** concern: prediction never auto-creates `REC#`. Educators propose and approve; students only ever see approved/published ones.

### Reports (async, 0shared pattern)
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `POST /api/children/:id/reports/generate` | scoped | Enqueue report generation | `REPORT#<id>` status `queued` → SQS |
| `GET /api/children/:id/reports` | scoped | Report metadata list | `REPORT#` prefix desc |
| `GET /api/reports/:reportId/download` | scoped, sharedWith | Presigned GET URL to the PDF | GSI1 `REPORT#<id>` → S3 presign |
| `DELETE /api/reports/:reportId` | admin, scoped | Remove report (and object) | delete `REPORT#` + S3 object |

### Admin — Models & Audit
| Method & Path | Roles | Description | Schema items |
|---------------|-------|-------------|--------------|
| `GET /api/models` | admin | List models by status | GSI2 `MODEL#STATUS#<status>` |
| `GET /api/models/:name` | admin | Model + versions + metrics | `MODEL#<name>` partition |
| `POST /api/models/:name/activate` | admin | Promote a trained version to active | `MODEL#<name>/CURRENT` (conditional) |
| `POST /api/models/:name/retire` | admin | Retire a version | `VERSION#` status update |
| `GET /api/audit/children/:id` | admin, scoped | Audit trail of a child | `AUDIT#CHILD#<c>` prefix desc |
| `GET /api/audit?actor=` | admin | Audit trail by actor | `AUDIT#USER#<id>` prefix desc |
| `GET /api/health` | public | Lambda health/liveness | — |

---

## RBAC Matrix

| Endpoint group | guardian | educator | student | admin |
|----------------|:--------:|:--------:|:-------:|:-----:|
| Auth (login/logout/me) | ✓ | ✓ | ✓ | ✓ |
| Children CRUD | own children | followed (create/edit) | own profile (read; edit name only when `autonomous`) | ✓ |
| Guardianship | view own | ✗ | ✗ | ✓ |
| Follow | ✗ | ✓ | ✗ | ✗ |
| Student account | own children | followed (institution onboarding) | ✗ | ✓ |
| Consent | own children | followed (grant/revoke, institution basis) | ✗ | ✓ |
| Autonomy level | own children (set) | followed (set) | ✗ | ✓ |
| Forms (fill) | anamnesis | socioemotional, behavior-checklist | vark-kids | define |
| Observations | ✗ | ✓ | own read-only if `guided`+ | ✓ |
| Assessments / Predict | own children | followed | own (label always; scores+confidence if `guided`+) | ✓ |
| Recommendations | own children (approved) | propose/approve | own (published) | ✓ |
| Reports | own children | followed | own if `autonomous` (never delete) | ✓ |
| Models registry | ✗ | ✗ | ✗ | ✓ |
| Audit | own children (trail) | ✗ | ✗ | ✓ |

Every data access is additionally **scope-checked** (edges in DynamoDB), not just role-checked — see [Authentication](./auth.md).

---

## Async Processing (Terraform-managed Lambdas)

| Lambda | Trigger | Work |
|--------|---------|------|
| `report-generator` | SQS `learning-profile_reports` | Generate PDF from child data → `s3://learning-profile-files/reports/<id>.pdf` → set `REPORT#` status `ready` |
| `feature-export` | EventBridge nightly | Export labeled assessments + observations to versioned snapshots on `-data` bucket (decoupling contract, see [ML Pipeline](./ml-pipeline.md)) |

Both are stateful-adjacent and therefore live in `terraform/aws-app`, not SAM.

---

## Local Development

```
Terminal 1:  sam local start-api --env-vars env.json --host 0.0.0.0   (API on :3000)
Terminal 2:  npm run dev                                               (Vite on :5173, proxies /api → :3000)
```

`sam-app/env.json` points to local DynamoDB (or DynamoDB Local) and local bucket names from `resources.env`.

---

## See Also

- [Authentication](./auth.md) — `requireAuth`/`requireRole`, scope checks over edges
- [DynamoDB Schema](./dynamodb-schema.md) — the access patterns each endpoint uses
- [Architecture](./architecture.md) — flows, deployment order
- [Frontend](./frontend.md) — SPA consuming these endpoints under `/api`
