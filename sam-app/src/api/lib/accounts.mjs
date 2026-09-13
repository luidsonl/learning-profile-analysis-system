import { ageFromRecord } from "./age.mjs";

// Pure helpers shared by the account-discovery endpoints (GET /auth/student-accounts
// and GET /users). Kept free of DynamoDB so the decision logic unit-tests the same
// way the rest of the codebase does.

export const consentRequired = (user, minAge) =>
  ageFromRecord(user) >= minAge ? "self" : "guardian_institution";

export const toStudentAccountDto = (user, minAge) => ({
  userId: user.userId,
  name: user.name,
  email: user.email,
  birthDate: user.birthDate,
  createdAt: user.createdAt,
  consentRequired: consentRequired(user, minAge),
});

// Catalog of every student account an educator may need to act on: `pending`
// accounts are still available to be linked to a ficha (`available: true`); once
// an account is linked its status flips to `active` and it owns a student entity
// (`linkedStudentId`) — such an account already has a profile attributed and can
// never be linked again (at-most-one, see specs/dynamodb-schema.md).
export const selectStudentAccounts = (items, minAge) =>
  items
    .filter((u) => (u.status === "pending" || u.status === "active") && u.userId)
    .map((u) => ({
      ...toStudentAccountDto(u, minAge),
      status: u.status,
      linkedStudentId: u.linkedStudentId ?? null,
      available: u.status === "pending" && !u.linkedStudentId,
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