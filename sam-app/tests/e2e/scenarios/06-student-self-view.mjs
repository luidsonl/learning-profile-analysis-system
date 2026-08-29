import { api, expect, pollUntil, step } from "../helpers.mjs";
import { answers } from "../fixtures.mjs";

// Educator-led student (minor, no guardian): institution consent replaces family
// consent, the student SELF-REGISTERS a `pending` account, and while pending they
// only reach a restricted self-service area. The educator LINKS the account
// (approving it, pending -> active); the linked student sees its own data in full —
// submissions, observations and complete ML predictions. See specs/auth.md + backend.md.
export default async (ctx) => {
  step("self-view: minor without guardian setup + pending restriction");
  {
    const c = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Pedro Alves", birthDate: "2011-09-30" } });
    expect("educator creates student without guardian", c.status === 201 && !!c.data.studentId, JSON.stringify(c.data));
    ctx.noGuardianStudentId = c.data.studentId;

    const consent = await api("POST", `/students/${ctx.noGuardianStudentId}/consent`, {
      token: ctx.educatorToken,
      body: { consentVersion: "v1", status: "active", legalBasis: "institution_authorization" },
    });
    expect("educator grants institution consent", consent.status === 200 && consent.data.status === "active", JSON.stringify(consent.data));

    // Pedro self-registers (role student + birthDate). Minor, so it starts `pending`.
    const reg = await api("POST", "/auth/register", {
      body: { email: PEDRO_EMAIL, name: "Pedro Alves", password: "pedro12345", role: "student", birthDate: "2011-09-30" },
    });
    expect("student self-registers pending", reg.status === 201 && reg.data.user.role === "student" && reg.data.user.status === "pending", JSON.stringify(reg.data));
    ctx.pedroUserId = reg.data.user.userId;

    // Pending student signs in to the restricted self-service area only.
    const login = await api("POST", "/auth/login", { body: { email: PEDRO_EMAIL, password: "pedro12345" } });
    expect("pending student can sign in (restricted self-service)", login.status === 200 && !!login.data.token && login.data.user.status === "pending", JSON.stringify(login.data));
    ctx.pedroToken = login.data.token;

    const me = await api("GET", "/auth/me", { token: ctx.pedroToken });
    expect("pending student sees own account with no entity yet", me.status === 200 && me.data.user.status === "pending" && me.data.studentId === null, JSON.stringify(me.data));

    // Not linked yet -> not scoped to any entity; cannot touch a student's data.
    const noScoped = await api("GET", `/students/${ctx.noGuardianStudentId}`, { token: ctx.pedroToken });
    expect("unlinked pending student has no entity access", noScoped.status === 403, JSON.stringify(noScoped.data));
  }

  step("self-view: educator links account -> active full self-view");
  {
    const acc = await api("POST", `/students/${ctx.noGuardianStudentId}/accounts/${ctx.pedroUserId}/link`, { token: ctx.educatorToken, body: {} });
    expect("educator links + approves student account", acc.status === 200 && acc.data.studentId === ctx.noGuardianStudentId, JSON.stringify(acc.data));
  }

  step("self-view: student fills its own form");
  {
    const sub = await api("POST", `/students/${ctx.noGuardianStudentId}/forms/vark/responses`, { token: ctx.pedroToken, body: { answers } });
    expect("linked student submits own form", sub.status === 201 && !!sub.data.submissionId, JSON.stringify(sub.data));
    ctx.pedroSubmissionId = sub.data.submissionId;
  }

  step("self-view: student reads own observations");
  {
    const obs = await api("POST", `/students/${ctx.noGuardianStudentId}/observations`, {
      token: ctx.educatorToken,
      body: { category: "behavior", text: "Participa ativamente das aulas práticas.", rating: 4 },
    });
    expect("educator adds observation", obs.status === 201, JSON.stringify(obs.data));

    const own = await api("GET", `/students/${ctx.noGuardianStudentId}/observations`, { token: ctx.pedroToken });
    expect("student reads own observations", own.status === 200 && own.data.count === 1, JSON.stringify(own.data));
  }

  step("self-view: student lists own submissions");
  {
    const list = await api("GET", `/students/${ctx.noGuardianStudentId}/submissions`, { token: ctx.pedroToken });
    expect("student lists own submissions", list.status === 200 && list.data.count === 1, JSON.stringify(list.data));
  }

  step("self-view: student sees full ML prediction");
  {
    const preds = await pollUntil(async () => {
      const r = await api("GET", `/students/${ctx.noGuardianStudentId}/predictions`, { token: ctx.pedroToken });
      return r.status === 200 && r.data.count >= 1 ? r.data : null;
    }, { tries: 40 });
    expect("student prediction list arrives", !!preds, JSON.stringify(preds || { count: 0 }));

    const p = preds?.data?.[0];
    const scores = p?.scores;
    const sum = scores ? Object.values(scores).reduce((a, b) => a + b, 0) : -1;
    expect(
      "full payload with valid distribution",
      p && ["R", "A", "K"].includes(p.label) && Math.abs(sum - 1) < 0.01 && typeof p.confidence === "number",
      JSON.stringify(p),
    );

    const resp = await pollUntil(async () => {
      const r = await api("GET", `/students/${ctx.noGuardianStudentId}/forms/vark/responses`, { token: ctx.pedroToken });
      const pred = r.status === 200 ? r.data?.data?.[0]?.prediction : null;
      return pred && typeof pred.scores === "object" ? r : null;
    }, { tries: 40 });
    expect(
      "own responses carry full ml prediction",
      resp?.status === 200 && typeof resp.data?.data?.[0]?.prediction?.scores === "object",
      JSON.stringify(resp?.data?.data?.[0]?.prediction),
    );
  }

  step("self-view: student manages own reports");
  {
    const gen = await api("POST", `/students/${ctx.noGuardianStudentId}/reports/generate`, { token: ctx.pedroToken, body: {} });
    expect("student generates own report", gen.status === 201, JSON.stringify(gen.data));

    const listed = await api("GET", `/students/${ctx.noGuardianStudentId}/reports`, { token: ctx.pedroToken });
    expect("student lists own reports", listed.status === 200 && listed.data.count >= 1, JSON.stringify(listed.data));
  }
};

const PEDRO_EMAIL = "pedro.alves@example.com";
