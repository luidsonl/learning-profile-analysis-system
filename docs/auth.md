# Authentication & Authorization — Learning Profile Analysis System

> Mirrors the 0shared auth flow: bearer-token sessions over a stateless Lambda layer, role middleware, and **scope enforcement** backed by the DynamoDB edges (`GUARD#`, `FOLLOW#`, `STUDENT#`). LGPD consent gates access to students' data.

## Roles & Personas

| Role | Sees | Restricted from |
|------|------|-----------------|
| `guardian` | Only their own students (via `GUARD#` edges) | Other students, educator observations |
| `educator` | Only students they follow (via `FOLLOW#` edges) | Guardianship management |
| `student` | Full self-view of own data — profile, forms/submissions, predictions (with scores), observations, reports | Managing others, audit trail, raw model internals |
| `admin` | Everything (users, students, audit) | — |

> **Educator = admin-like authority over the student flows:** an educator following a student can grant/revoke consent and create the student account (institution-led onboarding), mirroring what an admin can do. Guardians do the same for their own students; a student account holder manages only their own data.

## Session Flow

1. **Register** — `POST /api/auth/register` creates `USER#<id>/META` + `EMAIL#` reservation in one transaction (409 on duplicate email). Password stored hashed (bcrypt, 12 rounds).
2. **Login** — `POST /api/auth/login` validates credentials → creates `SESSION#` item (`USER#<id>/SESSION#<token>`, role snapshot, `expiresAt` = 7 days sliding) with GSI1 `SESSION#<token>` lookup.
3. **Authenticated requests** — `Authorization: Bearer <token>`; `requireAuth` middleware resolves the token via GSI1, checks `status=active` and `expiresAt`, and attaches `{userId, role, scope}` to the request context.
4. **Logout / revocation** — deletes the `SESSION#` item; admin can suspend a user (`USER#<id>/META.status=suspended`), which blocks all future token validation.
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
| `requireAuth` | Validates token → context `{userId, role}`; 401 otherwise |
| `requireRole(...roles)` | Rejects if `role` not allowed; 403 |
| `assertScopeStudent(studentId)` | For student routes: guardian → `GUARD#`/`GUARDIAN#` edge; educator → `FOLLOW#`/`EDUCATOR#` edge; student → own link only; admin → always; else 403. |

Scope checks are **edge lookups, not role checks** — a guardian cannot enumerate other people's students even with a valid token.

> Per-endpoint rules: [Backend — RBAC Matrix](./backend.md#rbac-matrix).

## Student Self-View

Access is **binary** — there are no autonomy levels. A user either has an account or does not; a form is filled either by its intended audience or by the responsible adult acting for them. A student account holder gets the **full self-view** of their own data: profile, submissions, predictions (label + scores + confidence), observations (read-only), recommendations (published) and reports (generate/list/download). Enforcement lives in `src/api/lib/scope.mjs`; students can only edit their own name and never access the audit trail, other students' data, or raw model internals.

## Student (Minor) Accounts

- Created via `POST /api/students/:id/student-account` by the **primary guardian**, an **educator following the student** (institution-led onboarding, e.g. no guardian), or an **admin** — gated by the student's current consent (409 if no active consent).
- A minor **cannot** register directly, can only edit their own name, and never sees the audit trail, other students' data, or raw model internals.
- The student identity is linked through `STUDENT#<c>/STUDENT#<userId>` + `USER#<s>/STUDENT#<c>` edges, written in the same transaction as the user creation.
- UI: the student persona renders the self-view (see [Frontend](./frontend.md)).

## Students Without a Guardian

- An educator or admin can register the student (`POST /api/students`) and record optional `accountability` (institution/authorized-by/note) on the student META.
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
- Admin suspension is checked at token validation time (session validity reflects current `USER#<id>/META.status`).

---

## See Also

- [Backend](./backend.md) — endpoint list and middleware wiring
- [DynamoDB Schema](./dynamodb-schema.md) — `SESSION#`, edges, consent items
- [LGPD](./lgpd.md) — consent lifecycle, audit, minor data
