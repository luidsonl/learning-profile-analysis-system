import { ageFromRecord } from "./age.mjs";

// Pure helpers shared by the account-discovery endpoints (GET /auth/pending-accounts
// and GET /users). Kept free of DynamoDB so the decision logic unit-tests the same
// way the rest of the codebase does.

export const consentRequired = (user, minAge) =>
  ageFromRecord(user) >= minAge ? "self" : "guardian_institution";

export const toPendingAccountDto = (user, minAge) => ({
  userId: user.userId,
  name: user.name,
  email: user.email,
  birthDate: user.birthDate,
  createdAt: user.createdAt,
  consentRequired: consentRequired(user, minAge),
});

export const selectPendingAccounts = (items, minAge) =>
  items
    .filter((u) => u.status === "pending" && u.userId)
    .map((u) => toPendingAccountDto(u, minAge))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

export const guardianEmailMatches = (user, prefix) =>
  (user.email || "").toLowerCase().startsWith(prefix.toLowerCase());

export const selectGuardianHits = (items, emailPrefix, limit = 25) =>
  items
    .filter((u) => u.status === "active" && u.userId && guardianEmailMatches(u, emailPrefix))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .slice(0, limit)
    .map((u) => ({ userId: u.userId, name: u.name, email: u.email }));