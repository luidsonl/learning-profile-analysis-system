// Pure helpers shared by the account-discovery endpoints (GET /auth/student-accounts
// and GET /users). Kept free of DynamoDB so the decision logic unit-tests the same
// way the rest of the codebase does.

export const toStudentAccountDto = (user) => ({
  userId: user.userId,
  name: user.name,
  email: user.email,
  birthDate: user.birthDate,
  createdAt: user.createdAt,
});

// Catalog of every student account an educator may need to act on. A `pending`
// account is still available to be linked to a ficha (`available: true`); a
// linked account has flpped to `active` and owns a student entity
// (`linkedStudentId`) — already-attributed, can never be linked again (at-most-one,
// see specs/dynamodb-schema.md). An `active` account WITHOUT `linkedStudentId`
// is an orphan (previously activated by a manual approval, now blocked by
// `PATCH /admin/users`); it has no profile attributed, so it remains linkable
// and the link self-heals it into a proper attributed account.
// Consent is decided on the STUDENT entity, never on the account (age authority
// is the ficha, see specs/lgpd.md) — so the catalog carries no consent fields.
export const selectStudentAccounts = (items) =>
  items
    .filter((u) => (u.status === "pending" || u.status === "active") && u.userId)
    .map((u) => ({
      ...toStudentAccountDto(u),
      status: u.status,
      linkedStudentId: u.linkedStudentId ?? null,
      available: !u.linkedStudentId,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

export const guardianEmailMatches = (user, prefix) =>
  !prefix || (user.email || "").toLowerCase().startsWith(prefix.toLowerCase());

export const selectGuardianHits = (items, emailPrefix, limit = 100) =>
  items
    .filter((u) => u.status === "active" && u.userId && guardianEmailMatches(u, emailPrefix))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .slice(0, limit)
    .map((u) => ({ userId: u.userId, name: u.name, email: u.email }));