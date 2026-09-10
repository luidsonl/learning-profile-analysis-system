---
id: auth
title: Authentication & Authorization
type: spec
status: stable
since: 2026-08-27
lastReviewed: 2026-08-30
dependsOn:
  - architecture
  - dynamodb-schema
requiredBy:
  - backend
  - frontend
  - lgpd
  - security
---

# Authentication & Authorization — Learning Profile Analysis System

> Mirrors the 0shared auth flow: bearer-token sessions over a stateless Lambda layer, role middleware, and **scope enforcement** backed by the DynamoDB edges (`GUARD#`, `FOLLOW#`, `STUDENT#`). LGPD consent gates access to students' data.

## Roles & Personas

| Role | Sees | Restricted from |
|------|------|-----------------|
| `guardian` | Only their assigned students (via `GUARD#` edges) — edit profile + fill forms | Other students; cannot create/remove students |
| `educator` | Only students they follow (via `FOLLOW#` edges) | Full user management (approve educators, promote/demote, passwords, delete) |
| `student` | Self-registers; once **linked by an educator** to a single `STUDENT#` entity, full self-view of that one entity — profile, forms/submissions, predictions (with scores), observations, reports | Other students, managing others, audit trail, raw model internals |
| `admin` | Everything (users, students, audit) | Cannot demote self / remove last active admin |

### Account status & approval flow

Accounts are **approval-gated** before they can sign in:

| Status | Meaning | Notes |
|--------|---------|-------|
| `pending` | Awaiting approval | educator/guardian on register; **student** on self-register (and while unlinked) — student `pending` signs in to a **restricted self-service area** only; login blocked → `403 pending_approval` for educator/guardian |
| `active` | Approved, can sign in | educator/guardian after approval; **student after an educator links them** (link approves); first educator to register becomes **admin + active** automatically (bootstrap) |
| `denied` | Rejected by an admin/educator | login blocked → `403 account_denied`; can be re-approved later (`pending`→`active`) |

- **First educator → admin bootstrap**: the very first `educator` to register, when **no admin exists** (`GSI2 RoleStatus` `USER#ROLE#admin` scan), is created as `admin` + `active` immediately. All later `educator` and `guardian` registrations start `pending`.
- **Who approves whom**: educators can approve/deny `guardian` and `student` accounts (status only, never roles). Admins have full control — approve/deny educators, promote/demote between `educator↔admin`, reset passwords, delete accounts.
- **`student` accounts are self-registered** via `POST /api/auth/register` (`role: "student"`) — educator/admin do **not** create them. They start `pending` and become `active` when the student is **linked** to a `STUDENT#` entity by an educator/admin (see [Student Accounts](#student-accounts-self-registration--educator-link)).
- Because `requireAuth` **re-reads the user from the DB on every request** (see [Middleware](#middleware)), approving, denying, or demoting a user takes effect immediately (their session no longer validates).

> **Educator = admin-like authority over the student flows:** an educator following a student's entity can grant/revoke consent for minors and **link** the student's self-account to the entity (approving it), mirroring what an admin can do. Guardians only manage **students assigned to them**; a student account holder manages only their own single entity.

## Session Flow

1. **Register** — `POST /api/auth/register` creates `USER#<id>/META` + `EMAIL#` reservation in one transaction (409 on duplicate email). Educator/guardian accounts start `pending` (unless the first educator bootstrap → `admin`+`active`); **student accounts are self-registered** (`role: "student"`) and also start `pending` with their `birthDate` recorded. Password stored hashed (bcrypt, 12 rounds).
2. **Login** — `POST /api/auth/login` validates credentials → creates `SESSION#` item (`USER#<id>/SESSION#<token>`, role snapshot, `expiresAt` = 7 days sliding) with GSI1 `SESSION#<token>` lookup. Non-`active` accounts are rejected **except student `pending`**, which signs in to the restricted self-service area.
3. **Authenticated requests** — `Authorization: Bearer <token>`; `requireAuth` middleware resolves the token via GSI1, checks `status=active` (or student `pending` on the restricted self-service routes) and `expiresAt`, and attaches `{userId, role}` to the request context.
4. **Logout / revocation** — deletes the `SESSION#` item; an admin can set a user's status `pending`/`denied` (or delete the account), which blocks all future token validation.
5. **TTL** — `SESSION#` items carry `ttl=expiresAt`; expired sessions vanish without cleanup work.

```
             ┌────────────┐  POST /api/auth/login
  client ───►│ API Gateway│─────────────────────► auth.mjs
             └────────────┘                          │ bcrypt compare
                  ▲                                  ▼
                  │ GET /api/*   (Authorization: Bearer)   SESSION# (DynamoDB, GSI1)
                  └─────────────────────────────── requireAuth.mjs
                                                  │ session valid?
                                                  ▼
                                           requireRole(roles...) → handler
                                                  │
                                                  ▼
                                           assertScopeStudent(studentId) → edges
```

## Middleware (`sam-app/src/api/lib/`)

| Middleware | Responsibility |
|------------|----------------|
| `requireAuth` | Validates token + re-reads user from DB → context `{userId, role}`; 401 otherwise (blocks non-active users immediately, except student `pending` on the restricted self-service routes via [backend.md](./backend.md)) |
| `requireRole(...roles)` | Rejects if `role` not allowed; 403 |
| `assertScopeStudent(studentId)` | For student routes: guardian → `GUARD#`/`GUARDIAN#` edge; educator → `FOLLOW#`/`EDUCATOR#` edge; student → own link only; admin → always; else 403. |

Scope checks are **edge lookups, not role checks** — a guardian cannot enumerate other people's students even with a valid token.

> Per-endpoint rules: [Backend — RBAC Matrix](./backend.md#rbac-matrix).

## Student Self-View

Access for an **active, linked** student is **binary** — there are no autonomy levels. A student account holder gets the **full self-view** of their own single entity: profile, submissions, predictions (label + scores + confidence), observations (read-only), recommendations (published) and reports (generate/list/download). Enforcement lives in `src/api/lib/scope.mjs`. While the account is still `pending` (registered but **not yet linked** by an educator) it lives in a restricted self-service area only (own account, own data) and has no student entity (`studentId == null`). Once linked and active, the student **fills in and edits their own profile** (the student entity they own) and never accesses the audit trail, other students' data, or raw model internals.

## Student Accounts (self-registration + educator link)

> **`STUDENT#` is a record, not a user.** A student's data entity exists created by an educator, whether or not anyone logs in as them. The account and the entity are linked by the educator (see [Linking below](#linking)). The two are **independent and cumulative**: a student's entity may be guardian-managed, educator-managed, and/or owned via a self-account.
>
> - **1 account → 1 entity (at most one, both directions).** A student self-account can be linked to **at most one** `STUDENT#` entity (`studentUserId` is single-valued on the entity), and its holder owns exactly that entity. The educator link never removes or replaces guardian/educator edges on the entity.

- **Self-registration**: any user signs up as `role: student` via `POST /api/auth/register` — the student creates their own account (with their `birthDate`, used for age-based LGPD eligibility; see [LGPD](./lgpd.md)). The account **starts `pending`** — the student can sign in only to a **restricted self-service area** (own account, no student entity yet) until an educator links them.
- **Linking (by educator)**: an **educator who follows the student's entity (or an admin)** links the self-account to that `STUDENT#` entity via `POST /api/students/:id/accounts/:userId/link`. The link **approves the account** (`pending → active`) and attributes the entity (writes `USER#<s>/STUDENT#<c>` + `STUDENT#<c>/LOGIN#<s>` and sets `studentUserId` on the entity META) in one transaction. Consent (see [LGPD](./lgpd.md)) gates the link: an **adult (≥ 18) self-consents**; a **minor (< 18)** requires guardian or institution consent already granted on the entity.
- Guardianships still **don't** register students and **don't** create/link student accounts — that is educator/admin-led.
- The linked student identity is carried by the `USER#<s>/STUDENT#<c>` edge; `getOwnStudentId` resolves it for the self-view and is `null` while pending/unlinked.

## Students Without a Guardian

- An educator or admin can register the student entity (`POST /api/students`) and record optional `accountability` (institution/authorized-by/note) on the student META. (Guardians do **not** register students.)
- **Consent is still mandatory** — no processing without a documented legal basis. For a **minor without a guardian**, the educator (or admin) grants consent via `POST /api/students/:id/consent` with `legalBasis: "institution_authorization"` (see [LGPD](./lgpd.md)). If a guardian exists, the guardian is the consent authority for minors. An **adult student (≥ 18)** self-consents (`legalBasis: "self_consent"`).
- The educator then links the student's self-account to the entity, approving it. From that point the student behaves like any other — the only difference is who granted consent.

## LGPD & Consent

- **Explicit consent is mandatory before processing** — versioned, with legal basis and granting role (see [LGPD](./lgpd.md)); revocation blocks new processing with 403.
- Every authenticated access to a student's data writes an `AUDIT#STUDENT#<id>` item.

## Security Notes

- Password hashing: bcrypt (cost 12); tokens: `crypto.randomBytes(32)` hex.
- All traffic over HTTPS (CloudFront/API Gateway); no secrets in client code.
- Rate limiting on `login`/`register` (API Gateway throttling) to mitigate brute force.
- `requireAuth` runs for every handler except `health`, `login`, and `register`.
- User status is checked at token validation time (session validity reflects current `USER#<id>/META.status`), so approval/denial/demotion takes effect on the next request.

---

## Dependencies

- **Depends on**: [architecture](./architecture.md) (personas, scope model), [dynamodb-schema](./dynamodb-schema.md) (`USER#`/`SESSION#`, edges, consent items).
- **Required by** (specs that presume this one): [backend](./backend.md) (middleware wiring per endpoint), [lgpd](./lgpd.md) (consent gates, minor accounts), [security](./security.md) (credential handling).

## See Also

- [Backend](./backend.md) — endpoint list and middleware wiring
- [DynamoDB Schema](./dynamodb-schema.md) — `SESSION#`, edges, consent items
- [LGPD](./lgpd.md) — consent lifecycle, audit, minor data
