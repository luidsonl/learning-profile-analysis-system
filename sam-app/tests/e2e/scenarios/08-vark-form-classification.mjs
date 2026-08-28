import { api, expect, pollUntil, step } from "../helpers.mjs";
import { varkDefinition } from "../../../src/api/forms/definitions/vark.mjs";
import { scoreVark } from "../../../src/api/forms/processors/vark.mjs";

// Full form → classification loop on a fresh student: the educator creates the
// student, the vark form is submitted, the deterministic assessment is run, and
// BOTH the assessment and the ML prediction must ride along in GET .../forms/vark/responses.
export default async (ctx) => {
  step("classify: dedicated chain setup");
  const created = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Lia Mendes", birthDate: "2012-03-14" } });
  expect("educator creates dedicated student", created.status === 201 && !!created.data.studentId, JSON.stringify(created.data));
  ctx.liaId = created.data.studentId;

  // Submissions are consent-gated (forms.mjs) — grant before submitting.
  const consent = await api("POST", `/students/${ctx.liaId}/consent`, { token: ctx.educatorToken, body: { consentVersion: "v1", status: "active", legalBasis: "institution_authorization" } });
  expect("consent granted for dedicated student", consent.status === 200 && consent.data.status === "active", JSON.stringify(consent.data));

  // The vark form has audience=student, so only a guardian or the student's own
  // account may fill it. Create the student self-account and submit as herself
  // (educator still reads the assessment/prediction via FOLLOW#).
  const acc = await api("POST", `/students/${ctx.liaId}/student-account`, { token: ctx.educatorToken, body: { email: "lia.mendes@example.com", name: "Lia Mendes", password: "lia12345" } });
  expect("educator creates student self-account", acc.status === 201 && !!acc.data.userId, JSON.stringify(acc.data));

  const login = await api("POST", "/auth/login", { body: { email: "lia.mendes@example.com", password: "lia12345" } });
  expect("student self login", login.status === 200 && !!login.data.token, JSON.stringify(login.data));
  ctx.liaToken = login.data.token;

  // Kinesthetic-dominant answers (K=5.0, A=2.0, R=1.0 → unimodal gap > 2).
  const answers = {};
  for (const section of varkDefinition.sections) {
    for (const q of section.questions) {
      const group = String(q.group || "").toLowerCase();
      answers[q.id] = group === "k" ? 5 : group === "a" ? 2 : 1;
    }
  }
  const expected = scoreVark(varkDefinition, answers);
  expect("local scoring yields a decisive label", expected.label && expected.label !== "multimodal", JSON.stringify(expected));

  const sub = await api("POST", `/students/${ctx.liaId}/forms/vark/responses`, { token: ctx.liaToken, body: { answers } });
  expect("vark submission accepted", sub.status === 201 && !!sub.data.submissionId, JSON.stringify(sub.data));
  ctx.liaSubmissionId = sub.data.submissionId;

  step("classify: assessment endpoint returns server-side scoring");
  const assess = await api("POST", `/students/${ctx.liaId}/assessments`, { token: ctx.educatorToken, body: {} });
  expect(
    "assessment matches local computation",
    assess.status === 201 &&
      assess.data.label === expected.label &&
      JSON.stringify(assess.data.scores) === JSON.stringify(expected.scores) &&
      assess.data.multimodal === expected.multimodal &&
      assess.data.method === expected.method,
    JSON.stringify(assess.data),
  );

  step("classify: classification rides along in GET responses");
  let ride = null;
  for (let i = 0; i < 5; i++) {
    const r = await api("GET", `/students/${ctx.liaId}/forms/vark/responses`, { token: ctx.educatorToken });
    const item = r.status === 200 ? r.data?.data?.find((s) => s.submissionId === ctx.liaSubmissionId) : null;
    if (item?.assessment) { ride = item; break; }
    await new Promise((res) => setTimeout(res, 1000));
  }
  expect(
    "responses GET carries the classification",
    !!ride,
    JSON.stringify(ride || { count: 0 }),
  );
  expect(
    "classification fields match the assessment",
    ride?.assessment &&
      ride.assessment.label === expected.label &&
      JSON.stringify(ride.assessment.scores) === JSON.stringify(expected.scores) &&
      typeof ride.assessment.createdAt === "string",
    JSON.stringify(ride?.assessment),
  );

  step("classify: prediction eventually rides along too");
  const withPred = await pollUntil(async () => {
    const r = await api("GET", `/students/${ctx.liaId}/forms/vark/responses`, { token: ctx.educatorToken });
    const item = r.status === 200 ? r.data?.data?.find((s) => s.submissionId === ctx.liaSubmissionId) : null;
    return item?.prediction ? item : null;
  }, { tries: 60, delayMs: 3000 });
  expect(
    "same response carries both classification and prediction",
    !!withPred && withPred.assessment && ["R", "A", "K"].includes(withPred.prediction.label) && typeof withPred.prediction.confidence === "number",
    JSON.stringify(withPred || null),
  );
};
