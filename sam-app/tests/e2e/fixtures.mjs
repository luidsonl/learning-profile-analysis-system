import { cleanupStudent, cleanupUser, findStudentsByCreator, findUserByEmail } from "./aws-cleanup.mjs";

// Solely the fixture identities the e2e suite itself creates. Cleanup deletes
// ONLY data added by the tests (users/students keyed to these test-only emails)
// and never touches anything else in the table.
//
// Role/flow under the specs (auth.md / backend.md / lgpd.md):
// - On a table with NO admin, the FIRST educator to register becomes the
//   initial admin (active bootstrap). When an admin already exists, the suite
//   switches to staged mode: ADMIN_EDUCATOR registers `pending` and is promoted
//   to admin directly in the DB (see api.test.mjs + scenario 01).
// - Later educators register as `pending` and are activated by an admin.
// - Guardian accounts register as `pending` and are activated by an educator/admin.
// - STUDENT accounts SELF-REGISTER via POST /api/auth/register (role: "student",
//   birthDate for LGPD age eligibility), starting `pending`. An educator (or admin)
//   LINKs the account to a student entity via POST /students/:id/accounts/:userId/link,
//   which approves it (pending -> active) and attributes the entity — consent-gated:
//   adults (>= 18) self-consent; minors (< 18) need guardian or institution consent.
export const TEST_FIXTURES = [
  // Admin of the suite (bootstrap admin on a clean table; staged-promoted otherwise).
  { email: "admin.sistema@example.com", name: "Adriana Lopes", password: "senha12345", role: "educator" },
  // Common educator -> registers pending, then approved by the admin.
  { email: "prof.joao@example.com", name: "João Pereira", password: "senha12345", role: "educator" },
  // Guardian -> registers pending, then approved by an educator/admin.
  { email: "maria.responsavel@example.com", name: "Maria da Silva", password: "senha12345", role: "guardian" },
  // Minor student accounts (self-register + educator link). Ana Clara is guardian-managed.
  { email: "ana.clara@example.com", name: "Ana Clara", password: "senha12345", role: "student", birthDate: "2016-03-12" },
  // Minor student without a guardian -> linked on institution_authorization consent.
  { email: "pedro.alves@example.com", name: "Pedro Alves", password: "pedro12345", role: "student", birthDate: "2011-09-30" },
  // ADULT student (>= 18) -> self-consents (self_consent) on its own entity.
  { email: "lia.mendes@example.com", name: "Lia Mendes", password: "lia12345", role: "student", birthDate: "2004-04-20" },
];

// Emails created inline by scenarios (not index-accessed fixtures) that must
// also be purged so the suite stays re-runnable — otherwise a second run hits
// `email_in_use` on registration.
export const AUXILIARY_TEST_EMAILS = [
  "sem.consentimento@example.com", // s02: no-consent minor
  "ana2@example.com", // s02: at-most-one duplicate account try
  "rafael.nao@example.com", // s09: guardian-cannot-link account try
];

// Decisively reading/writing-dominant answers: R=5.0, A=1.0, K=2.0 (R-K=3 > 2,
// so the Flemming rule labels it R, unambiguous regardless of small tweaks).
export const answers = {
  q01: 5, q02: 5, q03: 5, q04: 5, q05: 5,
  q06: 1, q07: 1, q08: 1, q09: 1, q10: 1,
  q11: 2, q12: 2, q13: 2, q14: 2, q15: 2,
};

export const purgeFixtures = async () => {
  const emails = [...TEST_FIXTURES.map((f) => f.email), ...AUXILIARY_TEST_EMAILS];
  for (const email of emails) {
    const userId = await findUserByEmail(email);
    if (!userId) continue;
    for (const studentId of await findStudentsByCreator(userId)) {
      await cleanupStudent(studentId);
    }
    await cleanupUser(userId, email);
  }
};
