# LGPD Compliance — Learning Profile Analysis System

> The system processes personal data of **students** — including minors (children) — in an educational context. LGPD compliance is in scope for the MVP — consent, minimization, audit, and erasure are foundational, not retrofits. This spec documents the data inventory, lawful bases, consent lifecycle, and the operational flows implementing LGPD rights.

## Scope & Legal Basis

| Processing | Legal basis (LGPD art. 7) | Notes |
|-----------|----------------------------|-------|
| Registration of guardian/educator/admin | Consent + legitimate interest of the institution | Adult users |
| Registration of the student (minor) | **Consent of the guardian** (art. 14 — children's data); for students without a guardian, **institution authorization** (`legalBasis=institution_authorization`) granted by the responsible educator/admin, documented on the consent record | Guardian- or institution-led |
| Filling forms, observations, assessments | Guardian consent or institution authorization (per student, versioned) | `vark`, `anamnesis`, `socioemotional`, `behavior-checklist` |
| ML prediction & recommendations | Same consent basis; anonymized training outside scope | See data minimization below |
| Reports (PDF) | Same consent basis; sharing per `sharedWith` | Presigned URLs |
| Audit log | Legitimate interest + legal compliance (art. 37) | Kept separately from analytics |

> Every consent record stores its **legal basis** (`legalBasis`: `guardian | institution_authorization | self_consent`) and the **role that granted it** (`grantedByRole`), satisfying LGPD accountability (art. 37). Consent is always required — the legal basis only documents *who* authorized the processing, never replaces it. Minors never consent for themselves (`self_consent` is reserved for adults in future self-service flows).

> Sensitive data: the model treats family income, disability, and socioemotional signals as **sensitive** even when LGPD categories don't formally cover all — stricter handling by default.

## Data Inventory (MVP)

| Item | Entities (`dynamodb-schema.md`) | Purpose |
|------|--------------------------------|---------|
| Identity & contacts | `USER#` | Accounts, login, roles |
| Child profile | `STUDENT#/META` | Guardianship, consent, personalization |
| Form responses | `SUBMISSION#` | Profile tracing (VARK scoring) |
| Observations | `OBS#` | Educator feedback, features for future models |
| Scores & labels | `ASSESS#` | Profile interpretation (V/A/R/K + multimodal) |
| Predictions & recommendations | `PRED#`, `REC#` | Personalized strategies |
| Reports | `REPORT#` + S3 PDFs | Documents shared with families/educators |
| Audit events | `AUDIT#` | Traceability, LGPD art. 37 |
| ML artifacts (anonymized) | `-data` bucket snapshots | Offline training — see [ML Pipeline](./ml-pipeline.md) |

## Consent Lifecycle

- **Versioned**: each consent record has `consentVersion` (the terms version accepted) + timestamp; stored as `STUDENT#<c>/CONSENT#<version>#<ts>` and denormalized on `STUDENT#/META` (`consentVersion`, `consentAt`, `consentBy`) together with `consentLegalBasis` and `consentGrantedByRole`.
- **Grant**: guardian, educator (institution authorization, child followed), or admin calls `POST /api/students/:id/consent` → transaction writes the consent item + updates `META` + `AUDIT#`.
- **Erasure-adjacent control**: self-service is independent of consent — a student account never bypasses consent; revoking consent blocks processing regardless of who holds the account.
- **Revocation**: writes a new `CONSENT#` item with `status=revoked` and updates `META`. After revocation:
  - new submissions, assessments, predictions, observations are rejected (403);
  - read access is limited to what's needed for the rights (access, erasure) and legal obligations;
  - nightly export excludes the student.
- **Re-consent**: a new consent version is accepted explicitly; old version history retained for proof.
- **Student account gating**: creating a student account requires an active consent for the child; a minor can never consent themselves.

## Audit Log

- Every access/action on a child's data writes `AUDIT#STUDENT#<id>` (actorId, actorRole, action, resource, detail, ip, timestamp).
- User- and form-scoped trails: `AUDIT#USER#<id>`, `AUDIT#FORM#<id>`.
- Retained according to the retention policy (below); not used for analytics/training.

## Data Minimization & Retention

- **Collect minimally**: forms only ask fields required for the profile; optional fields are explicit. No biometric data; no behavioral tracking beyond what forms capture.
- **Retention**:
  | Data | Default retention |
  |------|-------------------|
  | Sessions | 7 days (TTL) |
  | Reports (PDF + `REPORT#`) | 90 days or per institution policy (TTL + object lifecycle) |
  | Submissions / assessments / predictions | Kept while consent active; erasure on revocation request or at the end of the institution's term (configurable) |
  | Audit log | 2 years (configurable), never TTL'd by default |
  | Export snapshots (`-data`) | Anonymized → retained for ML retraining per policy |
- **TTL is never used for students' data** as a substitute for explicit erasure flows.
- **Anonymization at export**: the nightly `feature-export` strips direct identifiers (names, emails, birth dates, user/student IDs) and emits only scores/labels/aggregate attributes — the decoupling contract in [ML Pipeline](./ml-pipeline.md). Anonymized data falls outside LGPD personal-data scope.

## Data Subject Rights (operational flows)

| Right (LGPD art. 18) | Endpoint / flow |
|----------------------|-----------------|
| Access | `GET /api/students/:id` (guardian) / `GET /api/students/:id/...` data download; admin export |
| Correction | `PATCH /api/students/:id` (non-destructive, versioned) |
| Erasure (apagamento) | **Erasure flow** (admin/DPO): delete `STUDENT#` partition items (submissions, assess, pred, rec, obs, reports + S3 PDFs, consent history), `GUARD#`/`FOLLOW#`/`STUDENT#` edges, student `USER#` + `EMAIL#` reservation; keep only anonymized snapshots + audit record of the deletion |
| Consent revocation | `POST /api/students/:id/consent` with `status=revoked` |
| Portability | Structured export (JSON) of the student's `SUBMISSION#`, `ASSESS#`, `PRED#`, `REC#` for the guardian |
| Anonymous review / complaints | Institution DPO contact surfaced in the UI (footer) |

Erasure is a **documented script/runbook** (admin-triggered Lambda or CLI) with a preflight dry-run and an `AUDIT#` record of execution.

## Security Controls (recap from Architecture)

- Encryption at rest: DynamoDB (KMS), S3 SSE; in transit: TLS via CloudFront/API Gateway.
- S3 buckets block public access; files served only via presigned URLs.
- RBAC + scope enforcement via edges (see [Authentication](./auth.md)); students get a full self-view of their own data.
- No third-party analytics/tracking on the SPA; no data leaves AWS boundaries except user-initiated presigned downloads.
- Vendor/dataset note: the public training dataset (Armand, Eboue 2021, DOI: 10.17632/bwrr6zypcj.1) is CC BY 4.0, adult-subject data used only for model weights — not personal data processing of system users.

## Roles & Responsibilities

| Actor | Responsibility |
|-------|----------------|
| Institution (controller) | Consent texts, retention policy, DPO contact, erasure requests |
| Guardians | Consent for minors, exercise of rights |
| Educators | Data minimization when writing observations |
| System | Audit trail, scope enforcement, anonymized export |

---

## See Also

- [Authentication](./auth.md) — consent gates, minor accounts, audit
- [Backend](./backend.md) — consent/audit endpoints
- [DynamoDB Schema](./dynamodb-schema.md) — `CONSENT#`, `AUDIT#`, TTL design
- [ML Pipeline](./ml-pipeline.md) — anonymized export contract, snapshots
