import { purgeOrphanSessions } from "./aws-cleanup.mjs";
import { api, summary } from "./helpers.mjs";
import { TEST_FIXTURES, purgeFixtures } from "./fixtures.mjs";
import s01 from "./scenarios/01-health-auth.mjs";
import s02 from "./scenarios/02-students-consent.mjs";
import s03 from "./scenarios/03-forms-submissions.mjs";
import s04 from "./scenarios/04-ml-inference.mjs";
import s05 from "./scenarios/05-guardianship-observations-recommendations.mjs";
import s06 from "./scenarios/06-student-self-view.mjs";
import s07 from "./scenarios/07-reports-audit.mjs";
import s08 from "./scenarios/08-vark-form-classification.mjs";
import s09 from "./scenarios/09-student-record-rules.mjs";

const BASE = process.env.API_BASE;
if (!BASE) {
  console.error("API_BASE is required — deployed API endpoint, e.g. https://xxxx.execute-api.us-east-1.amazonaws.com/prod");
  process.exit(2);
}

const TABLE = process.env.TABLE_NAME || "learning-profile";

// Scenarios run in order and share fixture state through ctx
// (tokens, student ids, submission ids created along the way).
const scenarios = [s01, s02, s03, s04, s05, s06, s07, s08, s09];
const ctx = {};

const cleanupErrors = [];

try {
  // Purge only the fixture identities these tests create (incl. leftovers of a
  // previous crashed run). Students are removed only when their creator is a
  // fixture user — anything else in the table is left untouched.
  await purgeFixtures();
  for (const scenario of scenarios) {
    await scenario(ctx);
  }
} finally {
  const tokens = [ctx.guardianToken, ctx.educatorToken, ctx.studentToken];
  for (const token of tokens) {
    if (!token) continue;
    try {
      await api("POST", "/auth/logout", { token });
    } catch {
      /* best effort */
    }
  }
  try {
    await purgeFixtures();
    const removedSessions = await purgeOrphanSessions();
    console.log(`\ncleanup: removed test data from ${TABLE} (${removedSessions} orphan sessions)`);
  } catch (err) {
    cleanupErrors.push(`cleanup failed: ${err.message}`);
  }
}

const { passed, failed, failures } = summary();
console.log(`\n${passed} passed, ${failed} failed`);
if (cleanupErrors.length) {
  console.log("CLEANUP:", cleanupErrors.join("; "));
}
if (failed > 0 || cleanupErrors.length > 0) {
  if (failures.length) console.log("Failures:", failures.join(", "));
  process.exit(1);
}
