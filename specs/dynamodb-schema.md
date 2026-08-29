---
id: dynamodb-schema
title: DynamoDB Schema
type: spec
status: stable
since: 2026-08-27
lastReviewed: 2026-08-29
dependsOn:
  - architecture
requiredBy:
  - auth
  - backend
  - ml-pipeline
  - lgpd
  - student-data-features
---

# DynamoDB Schema — Learning Profile Analysis System

> Single-table design on the `learning-profile` table, mirroring the 0shared patterns: entity-prefixed keys, GSIs per access pattern, transactions for multi-item invariants and uniqueness reservations.

## Principles

- **One table**: `learning-profile` (name from `terraform/aws-app/terraform.tfvars`, passed to SAM via `resources.env`).
- **Key schema**: composite `PK` (entity-prefixed partition) + `SK` (entity-prefixed sort). Items are addressed by natural access patterns first; indexes only where a partition cannot serve the query.
- **Prefixes**: `USER#`, `EMAIL#`, `STUDENT#`, `GUARD#`, `FOLLOW#`, `LOGIN#`, `CONSENT#`, `SESSION#`, `SUBMISSION#`, `OBS#`, `ASSESS#`, `PRED#`, `REC#`, `REPORT#`, `AUDIT#`.
- **Fat items**: attributes are denormalized onto the item where they are read (e.g., role snapshot on sessions, form version on submissions).
- **Strong vs eventual**: edge and consent invariants are written in transactions (strongly consistent by default); high-frequency reads (report listing, submissions) may use eventually consistent reads.
- **TTL** for ephemeral data only (sessions); students' data is never TTL-expired — retention is handled by LGPD flows (see [LGPD](./lgpd.md)).
- **Billing**: on-demand.

## Table & Indexes

| Item | Spec |
|------|------|
| Table name | `learning-profile` |
| Key | `PK` (String, HASH) · `SK` (String, RANGE) |
| GSI1 `Lookup` | `GSI1PK` (HASH) · `GSI1SK` (RANGE) — inverted lookups: session-by-token, report-by-id, and export/analytics partitions per form/profile/category |
| GSI2 `RoleStatus` | `GSI2PK` (HASH) · `GSI2SK` (RANGE) — listing: users by role, forms by audience, models by status, students by status |
| TTL | `ttl` attribute — sessions (and report artifacts when retention applies) |
| Encryption | AWS-owned KMS key (default) |

All GSI items carry `GSI1PK`/`GSI1SK` (or `GSI2PK`/`GSI2SK`) duplicate attributes; projections use `ALL` for the MVP (simplicity over cost; revisit when hot).

---

## Entities & Items

### USER

**Profile item**
| PK | SK | Attributes |
|----|----|-----------|
| `USER#<userId>` | `META` | `userId`, `email` (normalized), `name`, `role` (`guardian|educator|student|admin`), `status` (`active|pending|denied`; `createdBy` on student accounts), `createdAt`, `updatedAt` |
| `USER#<userId>` | `META` | GSI2PK `ROLE#<role>`, GSI2SK `USER#<userId>#<status>` |

> **Approval flow**: registration writes `USER#ROLE#<role>` on GSI2. `hasAdmin()` (register bootstrap + delete/last-admin guards) scans `USER#ROLE#admin`; `admin` lists users by role/status via GSI2. Setting status `pending|active|denied` rewrites `GSI2PK`/`GSI2SK` atomically.

**Email uniqueness reservation** — written in the same transaction as the profile (aborts user creation on collision):
| PK | SK | Attributes |
|----|----|-----------|
| `EMAIL#<normalized-email>` | `USER#<userId>` | `userId` |

**Session item** (TTL `ttl` = `expiresAt`):
| PK | SK | Attributes |
|----|----|-----------|
| `USER#<userId>` | `SESSION#<token>` | `token`, `role` (snapshot at login), `createdAt`, `expiresAt`, `ip` |
| — | — | GSI1PK `SESSION#<token>`, GSI1SK `USER#<userId>` |

> Access patterns: validate token → `GSI1` Query `SESSION#<token>`; revoke/list user sessions → Query `USER#<u>` SK begins_with `SESSION#`.

### STUDENT

**Profile item**
| PK | SK | Attributes |
|----|----|-----------|
| `STUDENT#<studentId>` | `META` | `studentId`, `name`, `birthDate`, `gender`, `grade`, `school`, `status` (`active|archived`), `studentUserId`, `consentVersion`, `consentAt`, `consentBy`, `consentLegalBasis`, `consentGrantedByRole`, `accountability` (JSON: institution/authorizedBy/note), `createdAt`, `updatedAt` |
| — | — | GSI2PK `STUDENT#STATUS#<status>`, GSI2SK `STUDENT#<studentId>` |

**Edges (student side — reverse of the user-side edges)**
| PK | SK | Attributes |
|----|----|-----------|
| `STUDENT#<studentId>` | `GUARDIAN#<userId>` | `relation` (`parent|legal_guardian`), `createdAt` |
| `STUDENT#<studentId>` | `EDUCATOR#<userId>` | `createdAt` |
| `STUDENT#<studentId>` | `LOGIN#<userId>` | `createdAt` (self-service login link) |

**Consent records (versioned)**
| PK | SK | Attributes |
|----|----|-----------|
| `STUDENT#<studentId>` | `CONSENT#<version>#<timestamp>` | `consentVersion`, `scope`, `grantedBy`, `grantedByRole`, `legalBasis` (`guardian|institution_authorization|self_consent`), `status` (`granted|revoked`), `at` |

> Current consent is denormalized on `STUDENT#<id>/META` (`consentVersion`, `consentAt`, `consentBy`, `consentLegalBasis`, `consentGrantedByRole`); revocation writes a new `CONSENT#` item and updates `META` (blocks new processing).

### Edges (user side)

| PK | SK | Attributes |
|----|----|-----------|
| `USER#<userId>` | `GUARD#<studentId>` | `studentId`, `relation`, `consentVersion`, `createdAt` (guardian → student) |
| `USER#<userId>` | `FOLLOW#<studentId>` | `studentId`, `createdAt` (educator → student) |
| `USER#<studentUserId>` | `STUDENT#<studentId>` | `studentId`, `createdAt` (logged-in student → their own record) |

> Pattern: "list students a guardian/educator can see" → Query the user partition SK begins_with `GUARD#` / `FOLLOW#`. Reverse edges (student partition) serve consent display and scope checks ("who has access to this student"). Edges are written **bidirectionally in one transaction** + an `AUDIT#` item.

> **`STUDENT#` is a record, not a login.** A student exists independently of any user account and relates to users through independent, cumulative edges: **guardians** (`GUARD#`/`GUARDIAN#` — a single guardian user can guard **many** students, one edge per student), **educators** (`FOLLOW#`/`EDUCATOR#`), and **a self-account** (`USER#<s>/STUDENT#<c>` + `STUDENT#<c>/LOGIN#<s>` — **at most one** per student, enforced by the single-valued `studentUserId`). These links are not mutually exclusive: a student may have a guardian **and** its own account at the same time (account creation only adds the login edges; guardian/educator edges are untouched), only a guardian (forms filled by the responsible adult), or only a self-account (students without a guardian).

### SUBMISSION (per-student form responses)

> Form definitions are **not stored in the database** — they live in code (`sam-app/src/forms/definitions/*.mjs`) and are served read-only by the API. Only the answers are persisted; each submission records the static `formVersion` exported by the definition module, so future question changes keep old submissions interpretable.

| PK | SK | Attributes |
|----|----|-----------|
| `STUDENT#<studentId>` | `SUBMISSION#<formId>#<timestamp>` | `studentId`, `submissionId`, `formId`, `formVersion`, `answers` (`{questionId: value}`), `submittedBy`, `submittedByRole`, `requestId` (idempotency), `createdAt` |
| — | — | GSI1PK `SUBMISSION#<formId>`, GSI1SK `SUBMISSION#<formId>#<timestamp>` |

> Pattern: latest submissions per form → Query student partition SK begins_with `SUBMISSION#<formId>#`, descending; nightly export per form → GSI1.

### OBS (educator observations)

| PK | SK | Attributes |
|----|----|-----------|
| `STUDENT#<studentId>` | `OBS#<timestamp>` | `studentId`, `educatorId`, `category` (`behavior|performance|academic`), `text`, `rating` (optional ordinal), `createdAt` |
| — | — | GSI1PK `OBS#<category>`, GSI1SK `OBS#<category>#<timestamp>` |

### ASSESS (profile traced from a filled form — explicit classification step)

| PK | SK | Attributes |
|----|----|-----------|
| `ASSESS#<studentId>` | `VARK#<timestamp>` | `studentId`, `kind` (`vark`), `scores` (`{R, A, K}`), `label` (e.g. `K`, `multimodal`), `multimodal`, `method` (`flemming`), `submission` (source `SUBMISSION#` SK), `createdAt` |
| — | — | GSI1PK `ASSESS#vark`, GSI1SK `ASSESS#vark#<timestamp>` |

> Classification is **decoupled from submission**: `POST /students/:id/assessments` reads the latest stored submission (`src/api/forms/classify.mjs`) and writes this item. Labeled assessments are the **training labels** for retraining (export via GSI1).

### PRED (ML prediction)

| PK | SK | Attributes |
|----|----|-----------|
| `PRED#<studentId>` | `PRED#<predictionId>` | **Machine-generated** (written by the inference Lambda, never by API handlers): `studentId`, `model`, `modelVersion`, `method` (`ml`), `label`, `scores`, `confidence`, `form`, `createdBy` (`system:inference`), `createdAt` |
| — | — | GSI1PK `PRED#<model>`, GSI1SK `PRED#<model>#<timestamp>` |

> Predictions are produced automatically after form submissions via asynchronous invoke (no SQS). Submissions (`SUBMISSION#`) and assessments (`ASSESS#`) are human-flow data; `PRED#` is machine-generated data in its own partition. There is no model registry — each prediction carries the `model` + `modelVersion` that produced it.

### REC (recommendations)

| PK | SK | Attributes |
|----|----|-----------|
| `STUDENT#<studentId>` | `REC#<recoId>` | `studentId`, `recoId`, `kind` (`manual`), `title`, `text`, `tags`, `status` (`proposed|approved|rejected`), `visibility` (`private|published`), `createdBy`, `createdAt`, `approvedBy`, `approvedAt` |

### REPORT

| PK | SK | Attributes |
|----|----|-----------|
| `STUDENT#<studentId>` | `REPORT#<reportId>` | `studentId`, `reportId`, `type`, `status` (`queued|processing|ready|failed`), `s3Key`, `sizeBytes`, `requestedBy`, `requestedAt`, `approvedBy`, `approvedAt`, `sharedWith[]`, `ttl` (retention) |
| — | — | GSI1PK `REPORT#<reportId>`, GSI1SK `REPORT#<reportId>` |

### AUDIT

| PK | SK | Attributes |
|----|----|-----------|
| `AUDIT#<subjectType>#<subjectId>` | `EVENT#<timestamp>#<seq>` | `actorId`, `actorRole`, `action`, `resource`, `detail`, `ip`, `createdAt` |

> Subjects: `AUDIT#STUDENT#<studentId>`, `AUDIT#USER#<userId>`. Every access/action on a student's data writes an audit item (see [LGPD](./lgpd.md)).

---

## Access Patterns

| Operation | Query/Scan |
|-----------|-----------|
| Login / validate session token | GSI1 Query `SESSION#<token>` |
| List user's sessions / revoke | Query `USER#<u>`, SK `SESSION#` prefix |
| List students a guardian guards | Query `USER#<u>`, SK begins_with `GUARD#` |
| List students an educator follows | Query `USER#<u>`, SK begins_with `FOLLOW#` |
| Student's guardians / educators (scope check) | Query `STUDENT#<c>`, SK `GUARDIAN#` / `EDUCATOR#` prefix |
| Own record (student self-view) | Query `USER#<s>`, SK `STUDENT#` |
| Get student profile | Query `STUDENT#<c>` SK `META` |
| List students by status (admin) | GSI2 Query `STUDENT#STATUS#<status>` |
| List users by role (admin / educator) | GSI2 Query `ROLE#<role>` (educator restricted to guardian/student) |
| Check first-admin bootstrap / last-admin | GSI2 Query `USER#ROLE#admin` (count active) |
| Submissions of a student (one form) | Query `STUDENT#<c>`, SK begins_with `SUBMISSION#<formId>#`, desc |
| Submissions of a student (all forms) | Query `STUDENT#<c>`, SK begins_with `SUBMISSION#`, desc |
| Submissions by form (export) | GSI1 Query `SUBMISSION#<formId>` |
| Latest assessment for profile | Query `ASSESS#<c>`, SK begins_with `VARK#`, desc → first |
| Labeled assessments by profile (retrain) | GSI1 Query `ASSESS#vark` |
| Latest prediction for profile | Query `PRED#<c>`, SK begins_with `PRED#`, desc → first |
| Observations by category (analytics) | GSI1 Query `OBS#<category>` |
| Recommendations for a student | Query `STUDENT#<c>`, SK `REC#` prefix, desc |
| Report by id | GSI1 Query `REPORT#<reportId>` |
| Reports of a student | Query `STUDENT#<c>`, SK `REPORT#` prefix |
| Audit trail of a student | Query `AUDIT#STUDENT#<studentId>`, SK `EVENT#` prefix, desc |

---

## Transactions (atomic invariants)

| Flow | Items written atomically |
|------|--------------------------|
| Create user | `USER#<id>/META` + `EMAIL#<email>/USER#<id>` (uniqueness reservation) + `AUDIT#USER#<id>` |
| Update user status/role (admin) | `USER#<id>/META` (SET `role`/`status` + `GSI2PK`/`GSI2SK`) + `AUDIT#USER#<id>` |
| Grant guardianship | `USER#<g>/GUARD#<c>` + `STUDENT#<c>/GUARDIAN#<g>` + `AUDIT#STUDENT#<c>` |
| Educator follow | `USER#<e>/FOLLOW#<c>` + `STUDENT#<c>/EDUCATOR#<e>` + `AUDIT#STUDENT#<c>` |
| Create student account | `USER#<s>/META` + `EMAIL#` reservation + `USER#<s>/STUDENT#<c>` + `STUDENT#<c>/STUDENT#<s>` + `STUDENT#<c>/META` (set `studentUserId`) + `AUDIT#STUDENT#<c>` |
| Consent grant / revoke | `STUDENT#<c>/CONSENT#<v>#<ts>` + `STUDENT#<c>/META` (consent attrs incl. legal basis, conditional) + `AUDIT#STUDENT#<c>` |
| Submit form (idempotent) | `STUDENT#<c>/SUBMISSION#…` (conditional write, no classification side-effect) |
| Classify submission → assessment | `ASSESS#<c>/VARK#<ts>` + `STUDENT#<c>/META` (profile attrs) |
| Predict (inference) | `PRED#<c>/PRED#<id>` |

Uniqueness reservations (`EMAIL#`) use **conditional writes** inside the transaction so concurrent attempts fail instead of overwriting.

---

## Consistency & Partitioning Notes

- A student's core record lives in one partition (`STUDENT#<studentId>`): guardians, educators, consent, submissions, recommendations, observations, reports. Assessments (`ASSESS#<studentId>`) and predictions (`PRED#<studentId>`) live in dedicated partitions so their `SK` can be a pure timestamp id without mixing entity kinds in one SK range; reads stay single-partition and ordered by timestamp.
- Export partitions (`SUBMISSION#<formId>`, `ASSESS#vark`, `OBS#<category>`, `PRED#<model>`) live on **GSI1** so the nightly `feature-export` Lambda scans one hot GSI partition per form/profile instead of a full table scan.
- No item approaches 400 KB: submissions store answers as a small JSON map; VARK form keeps ~15 Likert items.
- High-frequency counters (e.g., "total submissions for retraining trigger") should be maintained as atomic `Add` on dedicated counter items dedicated counter items if needed — not scanned.

---

## Seed Data

- **None.** Form definitions live in code (served read-only by the API); every table item is produced at runtime by user actions or the inference Lambda.

---

## Dependencies

- **Depends on**: [architecture](./architecture.md) — single-table philosophy, forms engine, flows, RBAC. Read this first.
- **Required by** (specs that presume this one): [auth](./auth.md) (sessions, edges, consent), [backend](./backend.md) (access patterns per endpoint), [ml-pipeline](./ml-pipeline.md) (`SUBMISSION#`/`ASSESS#`/`PRED#`), [lgpd](./lgpd.md) (retention/erasure on these items), [student-data-features](./student-data-features.md) (storage of attribute sources).

## See Also

- [Architecture](./architecture.md) — forms engine, flows, RBAC
- [Backend](./backend.md) — handlers mapping to these access patterns
- [Authentication](./auth.md) — sessions, roles, scope enforcement over the edges above
- [ML Pipeline](./ml-pipeline.md) — snapshot export contract, retraining loop
- [Student Data Features](./student-data-features.md) — attributes collected via the forms/observations above
- [LGPD](./lgpd.md) — retention, consent, erasure flows on these items
