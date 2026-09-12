import { findAdmins, purgeOrphanSessions } from "./aws-cleanup.mjs";
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
const ALL_SCENARIOS = [
  ["01", "health-auth", s01],
  ["02", "students-consent", s02],
  ["03", "forms-submissions", s03],
  ["04", "ml-inference", s04],
  ["05", "guardianship-observations-recommendations", s05],
  ["06", "student-self-view", s06],
  ["07", "reports-audit", s07],
  ["08", "vark-form-classification", s08],
  ["09", "student-record-rules", s09],
];

// FILTER is an optional filter that limits the run to a contiguous prefix of
// the suite. It accepts either the two-digit id ("04") or a case-insensitive
// substring of the label ("inference", "ml"). Later scenarios reuse ctx state
// seeded by earlier ones, so only a contiguous prefix is safely runnable in
// isolation; everything after the matched scenario is skipped. An empty FILTER
// runs the full suite.
const FILTER_ALIASES = { inferencia: "ml-inference", inferncia: "ml-inference" };
const FILTER = process.env.FILTER ? process.env.FILTER.trim().toLowerCase() : "";
const normalized = FILTER_ALIASES[FILTER] || FILTER;

const selectScenarios = (filter) => {
  if (!filter) return ALL_SCENARIOS;
  const byId = ALL_SCENARIOS.find(([id]) => id === filter);
  const byLabel = ALL_SCENARIOS.filter(([, label]) => label.includes(filter));
  if (byId) return ALL_SCENARIOS.slice(0, ALL_SCENARIOS.indexOf(byId) + 1);
  if (byLabel.length === 1) return ALL_SCENARIOS.slice(0, ALL_SCENARIOS.indexOf(byLabel[0]) + 1);
  const labels = ALL_SCENARIOS.map(([id, label]) => `${id} (${label})`).join(", ");
  const hint = byLabel.length > 1 ? ` matches several: ${byLabel.map(([, l]) => l).join(", ")}` : ".";
  console.error(`Unknown FILTER "${FILTER}"${hint} Valid values: ${labels} (or omit to run the full suite).`);
  process.exit(2);
};

const selected = selectScenarios(normalized);
const scenarios = selected.map(([, , fn]) => fn);
if (FILTER) {
  console.log(`Running scenarios up to ${selected.at(-1)[0]} (${selected.at(-1)[1]}): ${selected.map(([id]) => id).join(" → ")}`);
}

const ctx = {};

const cleanupErrors = [];

// The suite assumes a clean table: the FIRST educator to register must become
// the initial admin (auth.mjs hasAdmin bootstrap). If a leftover admin (not one
// of our fixture emails) already exists, that bootstrap never fires and the
// whole run fails in cascade. Fail fast with an actionable message instead.
const assertCleanBootstrap = async () => {
  const fixtureEmails = new Set(TEST_FIXTURES.map((f) => f.email.toLowerCase()));
  const stray = (await findAdmins()).find((a) => !fixtureEmails.has(a.email.toLowerCase()));
  if (stray) {
    console.error(
      `\nERROR[preflight]: admin "${stray.email}" exists but is not an e2e fixture. ` +
        `The suite requires a clean table (first educator -> initial admin). ` +
        `Remove it manually or wipe the dev table: make clean CONFIRM=yes\n`,
    );
    process.exit(2);
  }
};

try {
  // Purge only the fixture identities these tests create (incl. leftovers of a
  // previous crashed run). Students are removed only when their creator is a
  // fixture user — anything else in the table is left untouched.
  await purgeFixtures();
  await assertCleanBootstrap();
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
