# Authentication & Authorization — Learning Profile Analysis System

> Mirrors the 0shared auth flow: bearer-token sessions over a stateless Lambda layer, role middleware, and **scope enforcement** backed by the DynamoDB edges (`GUARD#`, `FOLLOW#`, `STUDENT#`). LGPD consent gates access to children's data.

## Roles & Personas

| Role | Sees | Restricted from |
|------|------|-----------------|
| `guardian` | Only their own children (via `GUARD#` edges) | Other children, educator observations |
| `educator` | Only children they follow (via `FOLLOW#` edges) | Guardianship management, consent granting |
| `student` | Own profile, recommendations, approved reports, forms they can fill | Observations, raw ML internals, other children |
| `admin` | Everything (users, children, models, audit) | — |

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
                                           scopeCheck(childId, role)  → edges
```

## Middleware (`sam-app/src/handlers/middleware/`)

| Middleware | Responsibility |
|------------|----------------|
| `requireAuth` | Validates token → context `{userId, role}`; 401 otherwise |
| `requireRole(...roles)` | Rejects if `role` not allowed; 403 |
| `requireScopeChild(childId)` | For children routes: guardian → `USER#<u>/GUARD#<c>` exists; educator → `FOLLOW#`; student → `USER#<s>/CHILD#<c>`; admin → always; else 403. Uses the reverse edge (`CHILD#<c>/GUARDIAN#`/`EDUCATOR#`) where the query is cheaper. |

Scope checks are **edge lookups, not role checks** — a guardian cannot enumerate other people's children even with a valid token.

## Access Rules per Resource

| Resource | guardian | educator | student | admin |
|----------|----------|----------|---------|-------|
| Child profile | own (`GUARD#`) | followed (`FOLLOW#`) | own link (`CHILD#`) | all |
| Submissions | own children (read) | followed (read) | own (read/write own forms) | all |
| Observations | ✗ | followed (write) | ✗ | all |
| Assessments/Predictions | own children | followed | own (limited payload) | all |
| Recommendations | own children (approved) | propose + approve | own (published only) | all |
| Reports | own children (incl. generate) | followed | approved reports | all |
| Consent | own children (grant/revoke) | ✗ | ✗ | all |
| Forms definition | list/fill by audience | list/fill by audience | list/fill by audience | define/edit |
| Models registry | ✗ | ✗ | ✗ | ✓ |
| Audit | own children (read) | ✗ | ✗ | all |

> Details on the exact endpoints in [Backend — RBAC Matrix](./backend.md#rbac-matrix).

## Student (Minor) Accounts

- Created by the **guardian** via `POST /api/children/:id/student-account`, gated by the child's current consent (409 if no active consent).
- The student identity is linked through `CHILD#<c>/STUDENT#<userId>` + `USER#<s>/CHILD#<c>` edges, written in the same transaction as the user creation.
- A minor **cannot** register directly, cannot change the child profile, cannot see observations or raw model output.
- UI: the student persona renders the simplified self-view (see [Frontend](./frontend.md)).

## LGPD & Consent

- **Explicit consent** (versioned: `consentVersion`, `consentAt`) is required before any child data is processed; recorded via `POST /api/children/:id/consent` (see [LGPD](./lgpd.md)).
- Consent **revocation** flips `CHILD#<id>/META` state and blocks new processing (new submissions/predictions are rejected with 403).
- Every authenticated access to a child's data writes an `AUDIT#CHILD#<id>` item (who, what, when, ip) — the audit trail is queryable by admin and by the guardian for their own children.
- Tokens and sessions are short-lived; no third-party analytics/telemetry touches the SPA.

## Security Notes

- Password hashing: bcrypt (cost 12); tokens: `crypto.randomBytes(32)` hex.
- All traffic over HTTPS (CloudFront/API Gateway); no secrets in client code.
- Rate limiting on `login`/`register` (API Gateway throttling) to mitigate brute force.
- `requireAuth` runs for every handler except `health`, `login`, `register`, and `GET /api/forms` (public listing).
- Admin suspension is checked at token validation time (session validity reflects current `USER#<id>/META.status`).

---

## See Also

- [Backend](./backend.md) — endpoint list and middleware wiring
- [DynamoDB Schema](./dynamodb-schema.md) — `SESSION#`, edges, consent items
- [LGPD](./lgpd.md) — consent lifecycle, audit, minor data
