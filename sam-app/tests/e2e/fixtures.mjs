import { cleanupStudent, cleanupUser, findStudentsByCreator, findUserByEmail } from "./aws-cleanup.mjs";

// Solely the fixture identities the e2e suite itself creates. Cleanup deletes
// ONLY data added by the tests (users/students keyed to these test-only emails)
// and never touches anything else in the table.
export const TEST_FIXTURES = [
  { email: "maria.responsavel@example.com", name: "Maria da Silva", password: "senha12345", role: "guardian" },
  { email: "prof.joao@example.com", name: "João Pereira", password: "senha12345", role: "educator" },
  { email: "ana.clara@example.com", name: "Ana Clara", password: "senha12345", role: "student" },
  { email: "pedro.aluno@example.com", name: "Pedro Silva", password: "senha12345", role: "student" },
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
