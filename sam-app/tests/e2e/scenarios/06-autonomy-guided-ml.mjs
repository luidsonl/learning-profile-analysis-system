import { api, expect, pollUntil, step } from "../helpers.mjs";
import { TEST_FIXTURES, answers } from "../fixtures.mjs";

// Educator-led student (no guardian): autonomy levels gated by the educator,
// including guided-level access to ML scores.
export default async (ctx) => {
  step("autonomy: student without guardian (educator-led)");
  {
    const c = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Pedro Silva", birthDate: "2012-09-01", accountability: { institution: "Escola Municipal Flores" } } });
    expect("educator creates student without guardian", c.status === 201, JSON.stringify(c.data));
    ctx.noGuardianChildId = c.data.studentId;

    const consent = await api("POST", `/students/${ctx.noGuardianChildId}/consent`, { token: ctx.educatorToken, body: { consentVersion: "v1", status: "active", legalBasis: "institution_authorization" } });
    expect("educator grants institution consent", consent.status === 200 && consent.data.legalBasis === "institution_authorization", JSON.stringify(consent.data));

    const cGet = await api("GET", `/students/${ctx.noGuardianChildId}/consent`, { token: ctx.educatorToken });
    expect("consent basis persisted", cGet.data?.current?.legalBasis === "institution_authorization" && cGet.data?.current?.grantedByRole === "educator", JSON.stringify(cGet.data));

    const s = await api("POST", `/students/${ctx.noGuardianChildId}/student-account`, { token: ctx.educatorToken, body: { email: TEST_FIXTURES[3].email, name: TEST_FIXTURES[3].name, password: TEST_FIXTURES[3].password } });
    expect("educator creates student account", s.status === 201 && !!s.data.userId, JSON.stringify(s.data));

    const stu = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[3].email, password: TEST_FIXTURES[3].password } });
    expect("no-guardian student login", stu.status === 200 && !!stu.data.token, JSON.stringify(stu.data));
    const pedroToken = stu.data.token;
    ctx.pedroToken = pedroToken;

    const sub = await api("POST", `/students/${ctx.noGuardianChildId}/forms/vark/responses`, { token: pedroToken, body: { answers } });
    expect("student without guardian submits own form", sub.status === 201, JSON.stringify(sub.data));

    const obsDenied = await api("GET", `/students/${ctx.noGuardianChildId}/observations`, { token: pedroToken });
    expect("supervised cannot read observations", obsDenied.status === 403, JSON.stringify(obsDenied.data));

    const subsDenied = await api("GET", `/students/${ctx.noGuardianChildId}/submissions`, { token: pedroToken });
    expect("supervised cannot list submissions", subsDenied.status === 403, JSON.stringify(subsDenied.data));

    await api("POST", `/students/${ctx.noGuardianChildId}/observations`, { token: ctx.educatorToken, body: { category: "academic", text: "Ótima concentração.", rating: 5 } });

    const up = await api("PATCH", `/students/${ctx.noGuardianChildId}/autonomy`, { token: ctx.educatorToken, body: { level: "guided", reason: "autonomia progressiva" } });
    expect("educator raises autonomy to guided", up.status === 200 && up.data.level === "guided", JSON.stringify(up.data));

    const obsOk = await api("GET", `/students/${ctx.noGuardianChildId}/observations`, { token: pedroToken });
    expect("guided reads own observations", obsOk.status === 200 && obsOk.data.count >= 1, JSON.stringify(obsOk.data));

    const subsOk = await api("GET", `/students/${ctx.noGuardianChildId}/submissions`, { token: pedroToken });
    expect("guided lists own submissions", subsOk.status === 200 && subsOk.data.count >= 1, JSON.stringify(subsOk.data));
  }

  step("ml: guided student sees full prediction");
  {
    const guidedPreds = await pollUntil(
      () => api("GET", `/students/${ctx.noGuardianChildId}/predictions`, { token: ctx.pedroToken }),
      { tries: 15 },
    ).then((r) => (r && r.status === 200 && r.data.count >= 1 ? r.data : null));
    expect("guided predict includes scores", !!guidedPreds && guidedPreds.data[0].scores && guidedPreds.data[0].confidence !== undefined, JSON.stringify(guidedPreds?.data?.[0]));

    const own = await pollUntil(async () => {
      const r = await api("GET", `/students/${ctx.noGuardianChildId}/forms/vark/responses`, { token: ctx.pedroToken });
      const pred = r.data?.data?.[0]?.prediction;
      return pred && pred.scores !== undefined ? r : null;
    }, { tries: 15 });
    const ownPred = own?.data?.data?.[0]?.prediction;
    expect(
      "guided responses carry full ml prediction",
      ownPred && typeof ownPred.scores === "object" && ownPred.confidence !== undefined && ["R", "A", "K"].includes(ownPred.label),
      JSON.stringify(ownPred),
    );
  }

  step("autonomy: history + report gating");
  {
    const hist = await api("GET", `/students/${ctx.noGuardianChildId}/autonomy`, { token: ctx.educatorToken });
    expect("autonomy history recorded", hist.status === 200 && hist.data.current.level === "guided" && hist.data.history.length >= 1, JSON.stringify(hist.data));

    const repDenied = await api("POST", `/students/${ctx.noGuardianChildId}/reports/generate`, { token: ctx.pedroToken, body: { kind: "profile" } });
    expect("guided cannot generate own reports", repDenied.status === 403, JSON.stringify(repDenied.data));

    await api("POST", "/auth/logout", { token: ctx.pedroToken });
  }
};
