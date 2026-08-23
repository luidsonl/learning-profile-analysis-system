# DynamoDB Schema — Learning Profile Analysis System

> Single-table design on the `learning-profile` table, mirroring the 0shared patterns: entity-prefixed keys, GSIs per access pattern, transactions for multi-item invariants and uniqueness reservations.

## Principles

- **One table**: `learning-profile` (name from `terraform/aws-app/terraform.tfvars`, passed to SAM via `resources.env`).
- **Key schema**: composite `PK` (entity-prefixed partition) + `SK` (entity-prefixed sort). Items are addressed by natural access patterns first; indexes only where a partition cannot serve the query.
- **Prefixes**: `USER#`, `EMAIL#`, `CHILD#`, `GUARD#`, `FOLLOW#`, `STUDENT#`, `CONSENT#`, `SESSION#`, `FORM#`, `SUBMISSION#`, `OBS#`, `ASSESS#`, `PRED#`, `REC#`, `REPORT#`, `MODEL#`, `AUDIT#`.
- **Fat items**: attributes are denormalized onto the item where they are read (e.g., role snapshot on sessions, form version on submissions).
- **Strong vs eventual**: edge and consent invariants are written in transactions (strongly consistent by default); high-frequency reads (report listing, submissions) may use eventually consistent reads.
- **TTL** for ephemeral data only (sessions); children's data is never TTL-expired — retention is handled by LGPD flows (see [LGPD](./lgpd.md)).
- **Billing**: on-demand.

## Table & Indexes

| Item | Spec |
|------|------|
| Table name | `learning-profile` |
| Key | `PK` (String, HASH) · `SK` (String, RANGE) |
| GSI1 `Lookup` | `GSI1PK` (HASH) · `GSI1SK` (RANGE) — inverted lookups: session-by-token, report-by-id, and export/analytics partitions per form/profile/category |
| GSI2 `RoleStatus` | `GSI2PK` (HASH) · `GSI2SK` (RANGE) — listing: users by role, forms by audience, models by status, children by status |
| TTL | `ttl` attribute — sessions (and report artifacts when retention applies) |
| Encryption | AWS-owned KMS key (default) |

All GSI items carry `GSI1PK`/`GSI1SK` (or `GSI2PK`/`GSI2SK`) duplicate attributes; projections use `ALL` for the MVP (simplicity over cost; revisit when hot).

---

## Entities & Items

### USER

**Profile item**
| PK | SK | Attributes |
|----|----|-----------|
| `USER#<userId>` | `META` | `userId`, `email` (normalized), `name`, `role` (`guardian|educator|student|admin`), `status` (`active|suspended|deleted`), `consentGranted`, `createdAt`, `updatedAt` |
| `USER#<userId>` | `META` | GSI2PK `ROLE#<role>`, GSI2SK `USER#<userId>` |

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

### CHILD

**Profile item**
| PK | SK | Attributes |
|----|----|-----------|
| `CHILD#<childId>` | `META` | `childId`, `name`, `birthDate`, `gender`, `grade`, `school`, `status` (`active|archived`), `studentUserId`, `consentVersion`, `consentAt`, `consentBy`, `consentLegalBasis`, `consentGrantedByRole`, `autonomyLevel` (`supervised|guided|autonomous`), `autonomyUpdatedAt`, `autonomyUpdatedBy`, `accountability` (JSON: institution/authorizedBy/note), `createdAt`, `updatedAt` |
| — | — | GSI2PK `CHILD#STATUS#<status>`, GSI2SK `CHILD#<childId>` |

**Edges (child side — reverse of the user-side edges)**
| PK | SK | Attributes |
|----|----|-----------|
| `CHILD#<childId>` | `GUARDIAN#<userId>` | `relation` (`parent|legal_guardian`), `createdAt` |
| `CHILD#<childId>` | `EDUCATOR#<userId>` | `createdAt` |
| `CHILD#<childId>` | `STUDENT#<userId>` | `createdAt` (student account link) |

**Consent records (versioned)**
| PK | SK | Attributes |
|----|----|-----------|
| `CHILD#<childId>` | `CONSENT#<version>#<timestamp>` | `consentVersion`, `scope`, `grantedBy`, `grantedByRole`, `legalBasis` (`guardian|institution_authorization|self_consent`), `status` (`granted|revoked`), `at` |

> Current consent is denormalized on `CHILD#<id>/META` (`consentVersion`, `consentAt`, `consentBy`, `consentLegalBasis`, `consentGrantedByRole`); revocation writes a new `CONSENT#` item and updates `META` (blocks new processing).

**Autonomy history (versioned — mirrors the consent pattern)**
| PK | SK | Attributes |
|----|----|-----------|
| `AUTONOMY#<childId>` | `AUTONOMY#<timestamp>` | `level`, `reason`, `changedBy`, `changedByRole`, `at` |

> Current autonomy level is denormalized on `CHILD#<id>/META`; `PATCH /children/:id/autonomy` writes a history item + `META` update + `AUDIT#` in one transaction.

### Edges (user side)

| PK | SK | Attributes |
|----|----|-----------|
| `USER#<userId>` | `GUARD#<childId>` | `childId`, `relation`, `consentVersion`, `createdAt` (guardian → child) |
| `USER#<userId>` | `FOLLOW#<childId>` | `childId`, `createdAt` (educator → child) |
| `USER#<studentUserId>` | `CHILD#<childId>` | `childId`, `createdAt` (student → their child) |

> Pattern: "list children a guardian/educator can see" → Query the user partition SK begins_with `GUARD#` / `FOLLOW#`. Reverse edges (child partition) serve consent display and scope checks ("who has access to this child"). Edges are written **bidirectionally in one transaction** + an `AUDIT#` item.

### FORM

**Version item** (form definitions are immutable once versioned)
| PK | SK | Attributes |
|----|----|-----------|
| `FORM#<formId>` | `VERSION#<versionNumber>` | `formId`, `version`, `title`, `audience` (`guardian|educator|student|admin`), `sections[]` (id, title, `questions[]` — id, `type` (`single|multiple|likert|text|number|date`), label, `options[]`, required, `group` (modality for VARK)), `status` (`draft|active|archived`), `createdBy`, `createdAt`, `updatedAt` |
| — | — | GSI2PK `FORM#AUD#<audience>`, GSI2SK `FORM#<formId>#<version>` |

**Current-version pointer**
| PK | SK | Attributes |
|----|----|-----------|
| `FORM#<formId>` | `CURRENT` | `activeVersion`, `latestVersion`, `updatedAt` |

> Admin editing creates a new `VERSION#` item and updates the `CURRENT` pointer (conditional update); past submissions keep their `formVersion` and remain interpretable.

### SUBMISSION (per-child form responses)

| PK | SK | Attributes |
|----|----|-----------|
| `CHILD#<childId>` | `SUBMISSION#<formId>#<timestamp>` | `childId`, `submissionId`, `formId`, `formVersion`, `answers` (`{questionId: value}`), `submittedBy`, `submittedByRole`, `requestId` (idempotency), `createdAt` |
| — | — | GSI1PK `SUBMISSION#<formId>`, GSI1SK `SUBMISSION#<formId>#<timestamp>` |

> Pattern: latest submissions per form → Query child partition SK begins_with `SUBMISSION#<formId>#`, descending; nightly export per form → GSI1.

### OBS (educator observations)

| PK | SK | Attributes |
|----|----|-----------|
| `CHILD#<childId>` | `OBS#<timestamp>` | `childId`, `educatorId`, `category` (`behavior|performance|academic`), `text`, `rating` (optional ordinal), `createdAt` |
| — | — | GSI1PK `OBS#<category>`, GSI1SK `OBS#<category>#<timestamp>` |

### ASSESS (profile traced from a filled form — explicit classification step)

| PK | SK | Attributes |
|----|----|-----------|
| `ASSESS#<childId>` | `VARK#<timestamp>` | `childId`, `kind` (`vark`), `scores` (`{R, A, K}`), `label` (e.g. `K`, `multimodal`), `multimodal`, `method` (`flemming`), `submission` (source `SUBMISSION#` SK), `createdAt` |
| — | — | GSI1PK `ASSESS#vark`, GSI1SK `ASSESS#vark#<timestamp>` |

> Classification is **decoupled from submission**: `POST /children/:id/assessments` reads the latest stored submission (`src/forms/classify.mjs`) and writes this item. Labeled assessments are the **training labels** for retraining (export via GSI1).

### PRED (ML prediction)

| PK | SK | Attributes |
|----|----|-----------|
| `PRED#<childId>` | `PRED#<predictionId>` | **Machine-generated** (written by the inference Lambda, never by API handlers): `childId`, `model`, `modelVersion`, `method` (`ml`), `label`, `scores`, `confidence`, `form`, `createdBy` (`system:inference`), `createdAt` |
| — | — | GSI1PK `PRED#<model>`, GSI1SK `PRED#<model>#<timestamp>` |

> Predictions are produced automatically after form submissions via asynchronous invoke (no SQS). Submissions (`SUBMISSION#`) and assessments (`ASSESS#`) are human-flow data; `PRED#` is generated data in its own partition.

> Predictions are produced automatically after form submissions via asynchronous invoke (no SQS). Submissions (`SUBMISSION#`) and assessments (`ASSESS#`) are human-flow data; `PRED#` is generated data in its own partition. There is no model registry — each prediction carries the `model` + `modelVersion` that produced it.

### REC (recommendations)

| PK | SK | Attributes |
|----|----|-----------|
| `CHILD#<childId>` | `REC#<recoId>` | `childId`, `recoId`, `kind` (`manual`), `title`, `text`, `tags`, `status` (`proposed|approved|rejected`), `visibility` (`private|published`), `createdBy`, `createdAt`, `approvedBy`, `approvedAt` |

### REPORT

| PK | SK | Attributes |
|----|----|-----------|
| `CHILD#<childId>` | `REPORT#<reportId>` | `childId`, `reportId`, `type`, `status` (`queued|processing|ready|failed`), `s3Key`, `sizeBytes`, `requestedBy`, `requestedAt`, `approvedBy`, `approvedAt`, `sharedWith[]`, `ttl` (retention) |
| — | — | GSI1PK `REPORT#<reportId>`, GSI1SK `REPORT#<reportId>` |

### AUDIT

| PK | SK | Attributes |
|----|----|-----------|
| `AUDIT#<subjectType>#<subjectId>` | `EVENT#<timestamp>#<seq>` | `actorId`, `actorRole`, `action`, `resource`, `detail`, `ip`, `createdAt` |

> Subjects: `AUDIT#CHILD#<childId>`, `AUDIT#USER#<userId>`, `AUDIT#FORM#<formId>`. Every access/action on a child's data writes an audit item (see [LGPD](./lgpd.md)).

---

## Access Patterns

| Operation | Query/Scan |
|-----------|-----------|
| Login / validate session token | GSI1 Query `SESSION#<token>` |
| List user's sessions / revoke | Query `USER#<u>`, SK `SESSION#` prefix |
| List children a guardian guards | Query `USER#<u>`, SK begins_with `GUARD#` |
| List children an educator follows | Query `USER#<u>`, SK begins_with `FOLLOW#` |
| Child's guardians / educators (scope check) | Query `CHILD#<c>`, SK `GUARDIAN#` / `EDUCATOR#` prefix |
| Student's child (self-view) | Query `USER#<s>`, SK `CHILD#` |
| Get child profile | Query `CHILD#<c>` SK `META` |
| List children by status (admin) | GSI2 Query `CHILD#STATUS#<status>` |
| List users by role (admin) | GSI2 Query `ROLE#<role>` |
| List forms by audience | GSI2 Query `FORM#AUD#<audience>` |
| Get active form definition | Query `FORM#<formId>` SK `CURRENT` → fetch `VERSION#<v>` |
| List form versions | Query `FORM#<formId>`, SK `VERSION#` prefix |
| Submissions of a child (one form) | Query `CHILD#<c>`, SK begins_with `SUBMISSION#<formId>#`, desc |
| Submissions of a child (all forms) | Query `CHILD#<c>`, SK begins_with `SUBMISSION#`, desc |
| Submissions by form (export) | GSI1 Query `SUBMISSION#<formId>` |
| Latest assessment for profile | Query `ASSESS#<c>`, SK begins_with `VARK#`, desc → first |
| Labeled assessments by profile (retrain) | GSI1 Query `ASSESS#vark` |
| Latest prediction for profile | Query `PRED#<c>`, SK begins_with `PRED#`, desc → first |
| Observations by category (analytics) | GSI1 Query `OBS#<category>` |
| Recommendations for a child | Query `CHILD#<c>`, SK `REC#` prefix, desc |
| Report by id | GSI1 Query `REPORT#<reportId>` |
| Reports of a child | Query `CHILD#<c>`, SK `REPORT#` prefix |
| Audit trail of a child | Query `AUDIT#CHILD#<childId>`, SK `EVENT#` prefix, desc |
| Autonomy history of a child | Query `AUTONOMY#<childId>`, SK `AUTONOMY#` prefix, desc |

---

## Transactions (atomic invariants)

| Flow | Items written atomically |
|------|--------------------------|
| Create user | `USER#<id>/META` + `EMAIL#<email>/USER#<id>` (uniqueness reservation) + `AUDIT#USER#<id>` |
| Grant guardianship | `USER#<g>/GUARD#<c>` + `CHILD#<c>/GUARDIAN#<g>` + `AUDIT#CHILD#<c>` |
| Educator follow | `USER#<e>/FOLLOW#<c>` + `CHILD#<c>/EDUCATOR#<e>` + `AUDIT#CHILD#<c>` |
| Create student account | `USER#<s>/META` + `EMAIL#` reservation + `USER#<s>/CHILD#<c>` + `CHILD#<c>/STUDENT#<s>` + `CHILD#<c>/META` (set `studentUserId`) + `AUDIT#CHILD#<c>` |
| Consent grant / revoke | `CHILD#<c>/CONSENT#<v>#<ts>` + `CHILD#<c>/META` (consent attrs incl. legal basis, conditional) + `AUDIT#CHILD#<c>` |
| Set autonomy level | `AUTONOMY#<c>/AUTONOMY#<ts>` + `CHILD#<c>/META` (autonomy attrs) + `AUDIT#CHILD#<c>` |
| Submit form (idempotent) | `CHILD#<c>/SUBMISSION#…` (conditional write, no classification side-effect) |
| Classify submission → assessment | `ASSESS#<c>/VARK#<ts>` + `CHILD#<c>/META` (profile attrs) |
| Predict (inference) | `PRED#<c>/PRED#<id>` |
| Publish form version | `FORM#<id>/VERSION#<v>` + `FORM#<id>/CURRENT` (conditional on latest) |

Uniqueness reservations (`EMAIL#`) and version pointers (`CURRENT`, `latest`) use **conditional writes** inside the transaction so concurrent attempts fail instead of overwriting.

---

## Consistency & Partitioning Notes

- A child's core record lives in one partition (`CHILD#<childId>`): guardians, educators, consent, submissions, recommendations, observations, reports. Assessments (`ASSESS#<childId>`) and predictions (`PRED#<childId>`) live in dedicated partitions so their `SK` can be a pure timestamp id without the child's data mixing; reads stay single-partition and ordered by timestamp.
- Export partitions (`SUBMISSION#<formId>`, `ASSESS#vark`, `OBS#<category>`, `PRED#<model>`) live on **GSI1** so the nightly `feature-export` Lambda scans one hot GSI partition per form/profile instead of a full table scan.
- No item approaches 400 KB: submissions store answers as a small JSON map; VARK form keeps ~15 Likert items.
- High-frequency counters (e.g., "total submissions for retraining trigger") should be maintained as atomic `Add` on dedicated counter items (`STAT#FORM#<formId>`) if needed — not scanned.

---

## Seed Data

- Curated forms (`FORM#`): `vark-kids` (student), `anamnesis` (guardian), `socioemotional` (educator), `behavior-checklist` (educator) — v1 definitions + `CURRENT` pointers, seeded via `make seed` in `sam-app/` (idempotent conditional writes). No other seed data — everything else is produced at runtime.

---

## See Also

- [Architecture](./architecture.md) — forms engine, flows, RBAC
- [Backend](./backend.md) — handlers mapping to these access patterns
- [Authentication](./auth.md) — sessions, roles, scope enforcement over the edges above
- [ML Pipeline](./ml-pipeline.md) — snapshot export contract, retraining loop
- [Student Data Features](./student-data-features.md) — attributes collected via the forms/observations above
- [LGPD](./lgpd.md) — retention, consent, erasure flows on these items
