---
id: lgpd
title: LGPD Compliance
type: spec
status: stable
since: 2026-08-27
lastReviewed: 2026-08-30
dependsOn:
  - architecture
  - dynamodb-schema
  - auth
  - ml-pipeline
requiredBy:
  - security
  - student-data-features
---

# LGPD Compliance — Learning Profile Analysis System

> The system processes personal data of **students** — including minors (children) — in an educational context. LGPD compliance is in scope for the MVP — consent, minimization, audit, and erasure are foundational, not retrofits. This spec documents the data inventory, lawful bases, consent lifecycle, and the operational flows implementing LGPD rights.

## Scope & Legal Basis

| Processing | Legal basis (LGPD art. 7) | Notes |
|-----------|----------------------------|-------|
| Registration of guardian/educator/admin | Consent + legitimate interest of the institution (accounts are `pending` until an educator/admin approves) | Adult users |
| Registration of the student | The **student self-registers** (`role: student`); the legal basis depends on age, decided from the **birth date** recorded at sign-up: **adult (≥ `MIN_SELF_CONSENT_AGE`)** may consent for themselves (`self_consent`); **minor (< 18)** requires **guardian consent** (art. 14 — children's data) or, without a guardian, **institution authorization** (`legalBasis=institution_authorization`) granted by the responsible educator/admin. An educator links the account to a single student entity (consent-gated) | Faculty-led data entity; age-based consent |
| Filling forms, observations, assessments | Guardian consent or institution authorization (per student, versioned) | `vark`, `anamnesis`, `socioemotional`, `behavior-checklist` |
| ML prediction & recommendations | Same consent basis; anonymized training outside scope | See data minimization below |
| Reports (PDF) | Same consent basis; sharing per `sharedWith` | Presigned URLs |
| Audit log | Legitimate interest + legal compliance (art. 37) | Kept separately from analytics |

> Every consent record stores its **legal basis** (`legalBasis`: `guardian | institution_authorization | self_consent`) and the **role that granted it** (`grantedByRole`), satisfying LGPD accountability (art. 37). Consent is always required — the legal basis only documents *who* authorized the processing, never replaces it. **Age-based self-consent**: `self_consent` is permitted only when the student is **≥ `MIN_SELF_CONSENT_AGE` (18)**; minors (< 18) are consented by a **guardian** or by **institution authorization**. The student's **birth date is collected as an age-verification data point** (LGPD art. 14 §5º + ECA Digital — Lei 15.211/2025, in force since March 2026) and used strictly for this purpose, never for profiling/commercial use.

> Sensitive data: the model treats family income, disability, and socioemotional signals as **sensitive** even when LGPD categories don't formally cover all — stricter handling by default.

### Age-based consent & age verification

- **`MIN_SELF_CONSENT_AGE` (default 18)** — the only incontrovertible threshold for autonomous consent under Brazilian law. `self_consent` is allowed only for students **≥ 18**.
- **Minors (< 18)** are consented by a **guardian** (art. 14 §1º) or by **institution authorization** (guardian-less). This is deliberately conservative: LGPD art. 14 leaves adolescents (12–18) largely unregulated, and both the Código Civil (arts. 3º/4º: absolute incapacity < 16, relative incapacity 16–18) and ANPD/MPCE guidance treat sub-16 autonomous consent as contestable.
- **Age verification (LGPD art. 14 §5º + ECA Digital, Lei 15.211/2025, in force since March 2026):** the controller must make *reasonable efforts* to verify that consent comes from the right party — not a child self-declaring as an adult. Practical controls: collect `birthDate` at sign-up (never mere majority self-declaration), state its purpose as age verification only, and allow admins to correct it. `birthDate`/`age`/`consentEligible` are stored on `USER#/META` (see [DynamoDB Schema](./dynamodb-schema.md)).
- **Best-interest filter (Enunciado CD/ANPD nº 1/2023):** student-entity processing may also rest on the art. 7º/11 bases (e.g. legitimate interest of the educational institution) with the child's best interest prevailing — this grounds the restricted pre-link (`pending`) self-service without relying solely on the minor's own consent.
- **Privacy by default & adapted transparency** (art. 14 §2º, ECA Digital): minor-facing screens use accessible language; collect only the minimum; no behavioral or manipulative design.

## Data Inventory (MVP)

| Item | Entities (`dynamodb-schema.md`) | Purpose |
|------|--------------------------------|---------|
| Identity & contacts (incl. age-verification birth date) | `USER#` | Accounts, login, roles; `birthDate` used strictly for consent eligibility (LGPD art. 14 §5º / ECA Digital), never for profiling |
| Student profile | `STUDENT#/META` | Guardianship, consent, personalization |
| Form responses | `SUBMISSION#` | Profile tracing (VARK scoring) |
| Observations | `OBS#` | Educator feedback, features for future models |
| Scores & labels | `ASSESS#` | Profile interpretation (V/A/R/K + multimodal) |
| Predictions & recommendations | `PRED#`, `REC#` | Personalized strategies |
| Reports | `REPORT#` + S3 PDFs | Documents shared with families/educators |
| Audit events | `AUDIT#` | Traceability, LGPD art. 37 |
| ML artifacts (anonymized) | `-data` bucket snapshots | Offline training — see [ML Pipeline](./ml-pipeline.md) |

## Consent Lifecycle

- **Versioned**: each consent record has `consentVersion` (the terms version accepted) + timestamp; stored as `STUDENT#<c>/CONSENT#<version>#<ts>` and denormalized on `STUDENT#/META` (`consentVersion`, `consentAt`, `consentBy`) together with `consentLegalBasis` and `consentGrantedByRole`.
- **Grant**: a guardian, educator (institution authorization, student followed), linked adult student (≥18, `self_consent`, own entity), or admin calls `POST /api/students/:id/consent` → transaction writes the consent item + updates `META` + `AUDIT#`.
- **Erasure-adjacent control**: self-service is independent of consent — a student account never bypasses consent; revoking consent blocks processing regardless of who holds the account.
- **Revocation**: writes a new `CONSENT#` item with `status=revoked` and updates `META`. After revocation:
  - new submissions, assessments, predictions, observations are rejected (403);
  - read access is limited to what's needed for the rights (access, erasure) and legal obligations;
  - nightly export excludes the student.
- **Re-consent**: a new consent version is accepted explicitly; old version history retained for proof.
- **Student account gating**: linking a self-registered student account to its entity requires an active consent for the student; **a minor (< 18) never consents themselves** — only an adult (≥18) may `self_consent`.

## Audit Log

- Every access/action on a student's data writes `AUDIT#STUDENT#<id>` (actorId, actorRole, action, resource, detail, ip, timestamp).
- User- and student-scoped trails: `AUDIT#USER#<id>` (by actor), `AUDIT#STUDENT#<id>` (by subject).
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
- No third-party analytics/tracking in the SPA or API; no data leaves AWS boundaries except user-initiated presigned downloads.
- Vendor/dataset note: the public training dataset (Armand, Eboue 2021, DOI: 10.17632/bwrr6zypcj.1) is CC BY 4.0, adult-subject data used only for model weights — not personal data processing of system users.

## Roles & Responsibilities

| Actor | Responsibility |
|-------|----------------|
| Institution (controller) | Consent texts, retention policy, DPO contact, erasure requests |
| Guardians | Consent for minors (< 18 or < `MIN_SELF_CONSENT_AGE`), exercise of rights |
| Adult students (≥ 18, linked) | Self-consent (`self_consent`) for their own entity; exercise of rights |
| Educators | Grant institution authorization for guardian-less minors; data minimization when writing observations |
| System | Audit trail, scope enforcement, age-verification of consent, anonymized export |

---

## Dependencies

- **Depends on**: [architecture](./architecture.md) (students/minors, RBAC), [dynamodb-schema](./dynamodb-schema.md) (`CONSENT#`, `AUDIT#`, TTL design), [auth](./auth.md) (consent gates, minor accounts), [ml-pipeline](./ml-pipeline.md) (anonymized export contract, snapshot retention).
- **Required by** (specs that presume this one): [security](./security.md) (personal-data rules), [student-data-features](./student-data-features.md) (anonymization/minimization of exported features).

## See Also

- [Authentication](./auth.md) — consent gates, minor accounts, audit
- [Backend](./backend.md) — consent/audit endpoints
- [DynamoDB Schema](./dynamodb-schema.md) — `CONSENT#`, `AUDIT#`, TTL design
- [ML Pipeline](./ml-pipeline.md) — anonymized export contract, snapshots
