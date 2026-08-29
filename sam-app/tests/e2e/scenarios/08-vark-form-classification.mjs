import { api, expect, pollUntil, step } from "../helpers.mjs";
import { varkDefinition } from "../../../src/api/forms/definitions/vark.mjs";
import { scoreVark } from "../../../src/api/forms/processors/vark.mjs";

// Full form → classification loop on a fresh student. Lia is an ADULT (>= 18), so
// she SELF-CONSENTS (legalBasis=self_consent) and her self-registered account is
// LINKED by the educator. Then the vark form is submitted, the deterministic
// assessment is run, and BOTH the assessment and the ML prediction must ride along
// in GET .../forms/vark/responses. See specs/auth.md + lgpd.md (self_consent).
export default async (ctx) => {
  step("classify: dedicated chain setup");
  const created = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Lia Mendes", birthDate: "2004-04-20" } });
  expect("educator creates dedicated student", created.status === 201 && !!created.data.studentId, JSON.stringify(created.data));
  ctx.liaId = created.data.studentId;

  // Adult student self-registers (pending). The link is consent-gated: an adult
  // (>= 18) self-consents (self_consent), a minor needs guardian/institution consent
  // already granted — for Lia the adult self-consent satisfies the gate.
  const reg = await api("POST", "/auth/register", {
    body: { email: "lia.mendes@example.com", name: "Lia Mendes", password: "lia12345", role: "student", birthDate: "2004-04-20" },
  });
  expect("adult student self-registers pending", reg.status === 201 && reg.data.user.status === "pending", JSON.stringify(reg.data));
  ctx.liaUserId = reg.data.user.userId;

  const login = await api("POST", "/auth/login", { body: { email: "lia.mendes@example.com", password: "lia12345" } });
  expect("pending adult student self login", login.status === 200 && !!login.data.token, JSON.stringify(login.data));
  ctx.liaToken = login.data.token;

  // Educators no longer create accounts — they LINK the self-registered one.
  const acc = await api("POST", `/students/${ctx.liaId}/accounts/${ctx.liaUserId}/link`, { token: ctx.educatorToken, body: {} });
  expect("educator links + approves adult student account", acc.status === 200 && acc.data.studentId === ctx.liaId, JSON.stringify(acc.data));

  // A linked ADULT student may self-consent on their own entity (self_consent);
  // minors (< 18) never can — verified in 09-student-record-rules.mjs.
  const selfConsent = await api("POST", `/students/${ctx.liaId}/consent`, {
    token: ctx.liaToken,
    body: { consentVersion: "v1", status: "active", legalBasis: "self_consent" },
  });
  expect("linked adult student self-consents on own entity", selfConsent.status === 200 && selfConsent.data.legalBasis === "self_consent", JSON.stringify(selfConsent.data));

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
