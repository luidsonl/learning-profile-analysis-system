import { cleanupStudent, cleanupUser, findStudentsByCreator, findUserByEmail } from "./aws-cleanup.mjs";

// Solely the fixture identities the e2e suite itself creates. Cleanup deletes
// ONLY data added by the tests (users/students keyed to these test-only emails)
// and never touches anything else in the table.
//
// Role flow under the new RBAC rules:
// - The FIRST educator to register becomes the initial admin (active).
// - Later educators register as `pending` and are activated by an admin.
// - Guardian accounts register as `pending` and are activated by an educator/admin.
// - Student accounts are created by an educator/admin (they do not self-register).
export const TEST_FIXTURES = [
  // First educator to register -> becomes admin (active bootstrap).
  { email: "admin.sistema@example.com", name: "Adriana Lopes", password: "senha12345", role: "educator" },
  // Common educator -> registers pending, then approved by the admin.
  { email: "prof.joao@example.com", name: "João Pereira", password: "senha12345", role: "educator" },
  // Guardian -> registers pending, then approved by an educator/admin.
  { email: "maria.responsavel@example.com", name: "Maria da Silva", password: "senha12345", role: "guardian" },
  // Students (self accounts created by educator/admin).
  { email: "ana.clara@example.com", name: "Ana Clara", password: "senha12345", role: "student" },
  { email: "pedro.aluno@example.com", name: "Pedro Silva", password: "senha12345", role: "student" },
  { email: "pedro.alves@example.com", name: "Pedro Alves", password: "pedro12345", role: "student" },
  { email: "lia.mendes@example.com", name: "Lia Mendes", password: "lia12345", role: "student" },
];

// Decisively reading/writing-dominant answers: R=5.0, A=1.0, K=2.0 (R-K=3 > 2,
// so the Flemming rule labels it R, unambiguous regardless of small tweaks).
export const answers = {
  q01: 5, q02: 5, q03: 5, q04: 5, q05: 5,
  q06: 1, q07: 1, q08: 1, q09: 1, q10: 1,
  q11: 2, q12: 2, q13: 2, q14: 2, q15: 2,
};

export const purgeFixtures = async () => {
  for (const { email } of TEST_FIXTURES) {
    const userId = await findUserByEmail(email);
    if (!userId) continue;
    for (const studentId of await findStudentsByCreator(userId)) {
      await cleanupStudent(studentId);
    }
    await cleanupUser(userId, email);
  }
};
