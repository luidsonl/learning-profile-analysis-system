---
id: auth
title: Authentication & Authorization
type: spec
status: stable
since: 2026-08-27
lastReviewed: 2026-08-29
dependsOn:
  - architecture
  - dynamodb-schema
requiredBy:
  - backend
  - lgpd
  - security
  - frontend
---

# Authentication & Authorization — Learning Profile Analysis System

> Mirrors the 0shared auth flow: bearer-token sessions over a stateless Lambda layer, role middleware, and **scope enforcement** backed by the DynamoDB edges (`GUARD#`, `FOLLOW#`, `STUDENT#`). LGPD consent gates access to students' data.

## Roles & Personas

| Role | Sees | Restricted from |
|------|------|-----------------|
| `guardian` | Only their assigned students (via `GUARD#` edges) — edit profile + fill forms | Other students; cannot create/remove students |
| `educator` | Only students they follow (via `FOLLOW#` edges) | Full user management (approve educators, promote/demote, passwords, delete) |
| `student` | Full self-view of own data — profile, forms/submissions, predictions (with scores), observations, reports | Managing others, audit trail, raw model internals |
| `admin` | Everything (users, students, audit) | Cannot demote self / remove last active admin |

### Account status & approval flow

Accounts are **approval-gated** before they can sign in:

| Status | Meaning | Notes |
|--------|---------|-------|
| `pending` | Awaiting approval | educator/guardian on register; login blocked → `403 pending_approval` |
| `active` | Approved, can sign in | first educator to register becomes **admin + active** automatically (bootstrap) |
| `denied` | Rejected by an admin/educator | login blocked → `403 account_denied`; can be re-approved later (`pending`→`active`) |

- **First educator → admin bootstrap**: the very first `educator` to register, when **no admin exists** (`GSI2 RoleStatus` `USER#ROLE#admin` scan), is created as `admin` + `active` immediately. All later `educator` and `guardian` registrations start `pending`.
- **Who approves whom**: educators can approve/deny `guardian` and `student` accounts (status only, never roles). Admins have full control — approve/deny educators, promote/demote between `educator↔admin`, reset passwords, delete accounts.
- **`student` accounts are never self-registered** — created by an educator/admin via `POST /students/:id/student-account`; they start `active`.
- Because `requireAuth` **re-reads the user from the DB on every request** (see [Middleware](#middleware)), approving, denying, or demoting a user takes effect immediately (their session no longer validates).

> **Educator = admin-like authority over the student flows:** an educator following a student can grant/revoke consent and create the student account (institution-led onboarding), mirroring what an admin can do. Guardians only manage **students assigned to them**; a student account holder manages only their own data.

## Session Flow

1. **Register** — `POST /api/auth/register` creates `USER#<id>/META` + `EMAIL#` reservation in one transaction (409 on duplicate email). Educator/guardian accounts start `pending` (unless the first educator bootstrap → `admin`+`active`); password stored hashed (bcrypt, 12 rounds).
2. **Login** — `POST /api/auth/login` validates credentials → creates `SESSION#` item (`USER#<id>/SESSION#<token>`, role snapshot, `expiresAt` = 7 days sliding) with GSI1 `SESSION#<token>` lookup. Non-`active` accounts (pending/denied) are rejected.
3. **Authenticated requests** — `Authorization: Bearer <token>`; `requireAuth` middleware resolves the token via GSI1, checks `status=active` and `expiresAt`, and attaches `{userId, role}` to the request context.
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
| `requireAuth` | Validates token + re-reads user from DB → context `{userId, role}`; 401 otherwise (blocks non-active users immediately) |
| `requireRole(...roles)` | Rejects if `role` not allowed; 403 |
| `assertScopeStudent(studentId)` | For student routes: guardian → `GUARD#`/`GUARDIAN#` edge; educator → `FOLLOW#`/`EDUCATOR#` edge; student → own link only; admin → always; else 403. |

Scope checks are **edge lookups, not role checks** — a guardian cannot enumerate other people's students even with a valid token.

> Per-endpoint rules: [Backend — RBAC Matrix](./backend.md#rbac-matrix).

## Student Self-View

Access is **binary** — there are no autonomy levels. A user either has an account or does not; a form is filled either by its intended audience or by the responsible adult acting for them. A student account holder gets the **full self-view** of their own data: profile, submissions, predictions (label + scores + confidence), observations (read-only), recommendations (published) and reports (generate/list/download). Enforcement lives in `src/api/lib/scope.mjs`; students can only edit their own name and never access the audit trail, other students' data, or raw model internals.

## Student (Minor) Accounts

> **`STUDENT#` is a record, not a user.** A student exists whether or not anyone can log in as them. The two relations are **independent and cumulative**, not mutually exclusive:
>
> - **Guardian-managed only** — a guardian (or educator) holds the edges and the student has no account; the responsible adult fills forms and manages the data on the student's behalf.
> - **Guardian + self-account** — the student also has an account (created by educator/admin under active consent). The guardian **keeps full management** of the student's data (all guardian rows in the [RBAC matrix](./backend.md#rbac-matrix) continue to apply), and the student additionally gets the self-view.
> - **Self-account only** — students without a guardian (see [Students Without a Guardian](#students-without-a-guardian)).
>
> A guardian can be responsible for **any number** of students (one `GUARD#` edge per student); a student has **at most one** self-account (`studentUserId` is single-valued). Creating an account for a student never removes or replaces the guardian/educator edges.

- Created via `POST /api/students/:id/student-account` by an **educator following the student** (institution-led onboarding) or an **admin** — **not** by a guardian (guardians manage only assigned students, not account creation) — gated by the student's current consent (409 if no active consent).
- A minor **cannot** register directly, can only edit their own name, and never sees the audit trail, other students' data, or raw model internals.
- The student identity is linked through `STUDENT#<c>/STUDENT#<userId>` + `USER#<s>/STUDENT#<c>` edges, written in the same transaction as the user creation.
- UI: the student persona renders the self-view (see [Frontend](./frontend.md)).

## Students Without a Guardian

- An educator or admin can register the student (`POST /api/students`) and record optional `accountability` (institution/authorized-by/note) on the student META. (Guardians do **not** register students.)
- **Consent is still mandatory** — no processing without a documented legal basis. The educator (or admin) grants consent via the same `POST /api/students/:id/consent` with `legalBasis: "institution_authorization"` (see [LGPD](./lgpd.md)). If a guardian exists, the guardian remains the consent authority.
- The educator then creates the student account. From that point the student behaves like any other — the only difference is who granted consent.

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
- **Required by** (specs that presume this one): [backend](./backend.md) (middleware wiring per endpoint), [lgpd](./lgpd.md) (consent gates, minor accounts), [security](./security.md) (credential handling), [frontend](./frontend.md) (role guarding, student mode).

## See Also

- [Backend](./backend.md) — endpoint list and middleware wiring
- [DynamoDB Schema](./dynamodb-schema.md) — `SESSION#`, edges, consent items
- [LGPD](./lgpd.md) — consent lifecycle, audit, minor data
