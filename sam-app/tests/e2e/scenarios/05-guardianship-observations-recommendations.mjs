import { api, expect, step } from "../helpers.mjs";

// Under the new RBAC, the creator-educator auto-follows a student and the
// responsable is assigned via grantGuardian. This scenario exercises the
// follow mechanic (an educator following a student they did NOT create),
// plus lists, observations and recommendations.
//
// Seeds ctx: recoId.
export default async (ctx) => {
  step("guardianship: lists + follow of an un-owned student");
  {
    // Admin creates a student without following it; the educator then follows.
    const created = await api("POST", "/students", { token: ctx.adminToken, body: { name: "Léo Lima", birthDate: "2013-07-21" } });
    expect("admin creates student (no auto-follow)", created.status === 201 && !!created.data.studentId, JSON.stringify(created.data));
    ctx.followStudentId = created.data.studentId;

    const educatorsBefore = await api("GET", `/students/${ctx.followStudentId}/educators`, { token: ctx.adminToken });
    expect("no educator follows the new student yet", educatorsBefore.status === 200 && educatorsBefore.data.data.length === 0, JSON.stringify(educatorsBefore.data));

    const f = await api("POST", `/students/${ctx.followStudentId}/follow`, { token: ctx.educatorToken });
    expect("educator follows student", f.status === 201, JSON.stringify(f.data));

    const educators = await api("GET", `/students/${ctx.followStudentId}/educators`, { token: ctx.educatorToken });
    expect("educator now listed", educators.status === 200 && educators.data.data[0]?.userId === ctx.educatorId, JSON.stringify(educators.data));

    // On the main student, the creator-educator already follows and the
    // responsable was assigned in the students/consent scenario.
    const guardians = await api("GET", `/students/${ctx.studentId}/guardians`, { token: ctx.guardianToken });
    expect("assigned guardian lists as guardian", guardians.status === 200 && guardians.data.data.some((g) => g.userId === ctx.guardianId), JSON.stringify(guardians.data));

    const educatorsList = await api("GET", "/students", { token: ctx.educatorToken });
    expect("educator lists students (created + followed)", educatorsList.status === 200 && educatorsList.data.count >= 2, JSON.stringify(educatorsList.data));
  }

  step("guardian search (educator picks a responsible)");
  {
    const hit = await api("GET", "/users?role=guardian&email=maria.", { token: ctx.educatorToken });
    expect(
      "educator searches active guardians by email prefix",
      hit.status === 200 && hit.data.data.some((g) => g.userId === ctx.guardianId),
      JSON.stringify(hit.data),
    );
    const restricted = hit.data.data[0];
    expect("search returns minimal identity fields only", Object.keys(restricted).sort().join(",") === "email,name,userId", JSON.stringify(restricted));

    // Without a prefix the full active-guardian catalog is returned; the
    // client-side name/email filter happens in the SPA (Acessos tab).
    const all = await api("GET", "/users?role=guardian", { token: ctx.educatorToken });
    expect(
      "educator lists all active guardians without a prefix",
      all.status === 200 && all.data.count >= 1 && all.data.data.some((g) => g.userId === ctx.guardianId),
      JSON.stringify(all.data),
    );

    const partial = await api("GET", "/users?role=guardian&email=ma", { token: ctx.educatorToken });
    expect("partial prefix still matches guardians", partial.status === 200 && partial.data.data.some((g) => g.userId === ctx.guardianId), JSON.stringify(partial.data));

    const ignoredRole = await api("GET", "/users?role=educator&email=maria.", { token: ctx.educatorToken });
    expect("role param is ignored (always guardians)", ignoredRole.status === 200 && ignoredRole.data.data.some((g) => g.userId === ctx.guardianId), JSON.stringify(ignoredRole.data));

    const studentDenied = await api("GET", "/users?role=guardian&email=maria.", { token: ctx.studentToken });
    expect("student cannot list/search guardians", studentDenied.status === 403, JSON.stringify(studentDenied.data));
  }

  step("observations");
  {
    const o = await api("POST", `/students/${ctx.studentId}/observations`, { token: ctx.educatorToken, body: { category: "academic", text: "Demonstra grande curiosidade por ciências.", rating: 4 } });
    expect("observation added", o.status === 201, JSON.stringify(o.data));

    const adminObs = await api("POST", `/students/${ctx.studentId}/observations`, { token: ctx.adminToken, body: { category: "social", text: "Acompanhamento registrado pela administração." } });
    expect("admin adds an observation too", adminObs.status === 201, JSON.stringify(adminObs.data));

    const guardianDenied = await api("POST", `/students/${ctx.studentId}/observations`, { token: ctx.guardianToken, body: { category: "academic", text: "Tentativa do responsável." } });
    expect("guardian cannot add an observation", guardianDenied.status === 403, JSON.stringify(guardianDenied.data));

    const studentDenied = await api("POST", `/students/${ctx.studentId}/observations`, { token: ctx.studentToken, body: { category: "academic", text: "Tentativa do estudante." } });
    expect("student cannot add an observation", studentDenied.status === 403, JSON.stringify(studentDenied.data));

    const studentView = await api("GET", `/students/${ctx.studentId}/observations`, { token: ctx.studentToken });
    expect("student reads own observations", studentView.status === 200 && studentView.data.count === 2, JSON.stringify(studentView.data));

    const list = await api("GET", `/students/${ctx.studentId}/observations`, { token: ctx.educatorToken });
    expect("educator lists observations", list.status === 200 && list.data.count === 2, JSON.stringify(list.data));
  }

  step("recommendations: propose + approve (educator)");
  {
    const guardianProposeDenied = await api("POST", `/students/${ctx.studentId}/recommendations`, { token: ctx.guardianToken, body: { title: "Tentativa", text: "Proposta do responsável." } });
    expect("guardian cannot propose a recommendation", guardianProposeDenied.status === 403, JSON.stringify(guardianProposeDenied.data));

    const studentProposeDenied = await api("POST", `/students/${ctx.studentId}/recommendations`, { token: ctx.studentToken, body: { title: "Tentativa", text: "Proposta do estudante." } });
    expect("student cannot propose a recommendation", studentProposeDenied.status === 403, JSON.stringify(studentProposeDenied.data));

    const studentRecs = await api("GET", `/students/${ctx.studentId}/recommendations`, { token: ctx.studentToken });
    expect("student sees 0 recs before approval", studentRecs.status === 200 && studentRecs.data.count === 0, JSON.stringify(studentRecs.data));

    const propose = await api("POST", `/students/${ctx.studentId}/recommendations`, { token: ctx.educatorToken, body: { title: "Leitura e escrita", text: "Oferecer materiais escritos e incentivar a reescrita do conteúdo.", tags: ["leitura", "escrita"] } });
    expect("educator proposes recommendation", propose.status === 201 && !!propose.data.recoId, JSON.stringify(propose.data));
    ctx.recoId = propose.data.recoId;

    const studentRecs2 = await api("GET", `/students/${ctx.studentId}/recommendations`, { token: ctx.studentToken });
    expect("student still sees 0 while proposed", studentRecs2.status === 200 && studentRecs2.data.count === 0, JSON.stringify(studentRecs2.data));

    const approve = await api("PATCH", `/students/${ctx.studentId}/recommendations/${ctx.recoId}`, { token: ctx.educatorToken, body: { status: "approved", visibility: "published" } });
    expect("educator approves recommendation", approve.status === 200, JSON.stringify(approve.data));

    const studentRecs3 = await api("GET", `/students/${ctx.studentId}/recommendations`, { token: ctx.studentToken });
    expect("student sees approved recommendation", studentRecs3.status === 200 && studentRecs3.data.count === 1, JSON.stringify(studentRecs3.data));
  }
};
