import { api, expect, step } from "../helpers.mjs";
import { answers } from "../fixtures.mjs";

// Seeds ctx: anamnesisSubmissionId (for the ML linkage scenario).
export default async (ctx) => {
  step("forms: student sees only student forms");
  {
    const all = await api("GET", "/forms", { token: ctx.studentToken });
    expect("student lists forms", all.status === 200 && all.data.data.length === 1 && all.data.data[0].formId === "vark-kids", JSON.stringify(all.data));
    expect("form definition served from code with version", all.data.data[0].version === 1 && Array.isArray(all.data.data[0].sections), JSON.stringify(all.data.data[0]));

    const guardianForms = await api("GET", "/forms", { token: ctx.guardianToken });
    expect("guardian sees all forms", guardianForms.status === 200 && guardianForms.data.count === 4, JSON.stringify(guardianForms.data));

    const one = await api("GET", "/forms/vark-kids", { token: ctx.studentToken });
    expect("get single form definition", one.status === 200 && one.data.form.formId === "vark-kids", JSON.stringify(one.data));
  }

  step("forms: submit tests (decoupled from classification)");
  {
    const r = await api("POST", `/children/${ctx.childId}/forms/vark-kids/responses`, {
      token: ctx.studentToken,
      body: { answers, requestId: "test-run-1" },
    });
    expect("vark submission accepted", r.status === 201 && !!r.data.submissionId, JSON.stringify(r.data));
    ctx.varkSubmissionId = r.data.submissionId;

    const dup = await api("POST", `/children/${ctx.childId}/forms/vark-kids/responses`, {
      token: ctx.studentToken,
      body: { answers, requestId: "test-run-1" },
    });
    expect("duplicate submission idempotent", dup.status === 200 && dup.data.submittedBy === "already_exists", JSON.stringify(dup.data));

    const byGuardian = await api("POST", `/children/${ctx.childId}/forms/anamnesis/responses`, {
      token: ctx.guardianToken,
      body: { answers: { a01: "2016-03-12", a02: "dentro do esperado", a03: "não", a07: "Boa adaptação", a10: "Nenhuma" } },
    });
    expect("guardian anamnesis accepted", byGuardian.status === 201, JSON.stringify(byGuardian.data));
    ctx.anamnesisSubmissionId = byGuardian.data.submissionId;

    const assisted = await api("POST", `/children/${ctx.childId}/forms/vark-kids/responses`, {
      token: ctx.guardianToken,
      body: { answers, requestId: "test-run-guardian" },
    });
    expect("guardian-assisted vark submission accepted", assisted.status === 201 && !!assisted.data.submissionId, JSON.stringify(assisted.data));

    const assistedDup = await api("POST", `/children/${ctx.childId}/forms/vark-kids/responses`, {
      token: ctx.guardianToken,
      body: { answers, requestId: "test-run-guardian" },
    });
    expect("guardian-assisted duplicate idempotent", assistedDup.status === 200 && assistedDup.data.submittedBy === "already_exists", JSON.stringify(assistedDup.data));
  }

  step("submissions: fetch stored tests (no classification side-effect)");
  {
    const before = await api("GET", `/children/${ctx.childId}/submissions`, { token: ctx.guardianToken });
    expect("submissions listed without assessment yet", before.status === 200 && before.data.count === 3, JSON.stringify(before.data));

    const noAssessYet = await api("GET", `/children/${ctx.childId}/assessments`, { token: ctx.guardianToken });
    expect("no assessment persisted yet (decoupled)", noAssessYet.status === 200 && noAssessYet.data.count === 0, JSON.stringify(noAssessYet.data));

    const perForm = await api("GET", `/children/${ctx.childId}/forms/vark-kids/responses`, { token: ctx.guardianToken });
    expect("per-form responses listed", perForm.status === 200 && perForm.data.count === 2, JSON.stringify(perForm.data));
  }

  step("assessment: classify stored submissions");
  {
    const a = await api("POST", `/children/${ctx.childId}/assessments`, { token: ctx.guardianToken });
    expect("assessment labels reading/writing", a.status === 201 && a.data.kind === "assessment" && a.data.label === "R", JSON.stringify(a.data));

    const list = await api("GET", `/children/${ctx.childId}/assessments`, { token: ctx.guardianToken });
    expect("assessment listed", list.status === 200 && list.data.count >= 1, JSON.stringify(list.data));
  }
};
