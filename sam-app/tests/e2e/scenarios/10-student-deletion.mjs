import { api, expect, step } from "../helpers.mjs";

// Validates `DELETE /api/students/:id` — the LGPD erasure flow
// (specs/backend.md, specs/lgpd.md, specs/dynamodb-schema.md):
//
//  1. An educator (in scope — following the student) can hard-delete the record;
//     the data is gone for every persona and the audit event of the deletion is kept.
//  2. Denials: a guardian cannot delete; a linked student cannot delete their own
//     record; an educator that does not follow the student cannot delete.
//  3. An admin can delete any student (no follow edge required).
//  4. The linked self-registered account (+ its session) is erased together with
//     the student entity.
//
// Consumes ctx from earlier scenarios (Ana Clara = guardian-managed + self-account;
// Pedro = linked no-guardian student with a self-account).
export default async (ctx) => {
  step("deletion: educator hard-deletes a student they follow (LGPD erasure)");
  let targetedId;
  {
    const c = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Erasable Child", birthDate: "2015-07-08" } });
    expect("educator creates student to erase", c.status === 201 && !!c.data.studentId, JSON.stringify(c.data));
    targetedId = c.data.studentId;

    // Enrich the partition so the cascade actually has edges, consent, data and
    // a submission to erase.
    const consent = await api("POST", `/students/${targetedId}/consent`, {
      token: ctx.educatorToken,
      body: { consentVersion: "v1", status: "active", legalBasis: "institution_authorization" },
    });
    expect("educator grants consent on erasable student", consent.status === 200 && consent.data.status === "active", JSON.stringify(consent.data));

    const guard = await api("POST", `/students/${targetedId}/guardians`, { token: ctx.educatorToken, body: { userId: ctx.guardianId } });
    expect("educator assigns guardian to erasable student", guard.status === 201, JSON.stringify(guard.data));

    const obs = await api("POST", `/students/${targetedId}/observations`, {
      token: ctx.educatorToken,
      body: { category: "behavior", text: "Avaliação temporária para o teste de apagamento.", rating: 3 },
    });
    expect("educator adds observation on erasable student", obs.status === 201, JSON.stringify(obs.data));

    const reco = await api("POST", `/students/${targetedId}/recommendations`, {
      token: ctx.educatorToken,
      body: { title: "Estratégia temporária", text: "Acompanhar a evolução em leitura." },
    });
    expect("educator proposes recommendation on erasable student", reco.status === 201, JSON.stringify(reco.data));

    const sub = await api("POST", `/students/${targetedId}/forms/anamnesis/responses`, {
      token: ctx.guardianToken,
      body: { answers: { a01: "2015-07-08", a02: "dentro do esperado", a03: "não", a07: "Boa adaptação", a10: "Nenhuma" } },
    });
    expect("guardian submits anamnesis on erasable student", sub.status === 201, JSON.stringify(sub.data));

    const del = await api("DELETE", `/students/${targetedId}`, { token: ctx.educatorToken });
    expect("educator deletes student (204)", del.status === 204, JSON.stringify(del.data));

    const byEducator = await api("GET", `/students/${targetedId}`, { token: ctx.educatorToken });
    expect("student is gone for the educator (404)", byEducator.status === 404, JSON.stringify(byEducator.data));

    const byAdmin = await api("GET", `/students/${targetedId}`, { token: ctx.adminToken });
    expect("student is gone for admin (404)", byAdmin.status === 404, JSON.stringify(byAdmin.data));

    const byGuardian = await api("GET", `/students/${targetedId}`, { token: ctx.guardianToken });
    expect("guardian lost access — record erased (404)", byGuardian.status === 404, JSON.stringify(byGuardian.data));

    const list = await api("GET", "/students", { token: ctx.educatorToken });
    expect(
      "deleted student missing from educator list",
      list.status === 200 && !list.data.data.some((s) => s.studentId === targetedId),
      JSON.stringify(list.data),
    );

    const audit = await api("GET", `/audit/students/${targetedId}`, { token: ctx.adminToken });
    expect(
      "audit trail of the deletion is kept",
      audit.status === 200 && audit.data.data.some((e) => e.action === "student_deleted"),
      JSON.stringify(audit.data),
    );
  }

  step("deletion: role and scope denials");
  {
    const byGuardian = await api("DELETE", `/students/${ctx.studentId}`, { token: ctx.guardianToken });
    expect("guardian cannot delete a guarded student (403)", byGuardian.status === 403, JSON.stringify(byGuardian.data));

    const byStudent = await api("DELETE", `/students/${ctx.studentId}`, { token: ctx.studentToken });
    expect("linked student cannot delete own record (403)", byStudent.status === 403, JSON.stringify(byStudent.data));

    const created = await api("POST", "/students", { token: ctx.adminToken, body: { name: "Unfollowed Kid", birthDate: "2016-01-15" } });
    expect("admin creates an unfollowed student", created.status === 201 && !!created.data.studentId, JSON.stringify(created.data));

    const denied = await api("DELETE", `/students/${created.data.studentId}`, { token: ctx.educatorToken });
    expect("educator without a follow edge cannot delete (403)", denied.status === 403, JSON.stringify(denied.data));

    const byAdmin = await api("DELETE", `/students/${created.data.studentId}`, { token: ctx.adminToken });
    expect("admin deletes the unfollowed student (204)", byAdmin.status === 204, JSON.stringify(byAdmin.data));
  }

  step("deletion: linked self-account is erased together with the student");
  {
    const del = await api("DELETE", `/students/${ctx.noGuardianStudentId}`, { token: ctx.educatorToken });
    expect("educator deletes linked student (204)", del.status === 204, JSON.stringify(del.data));

    const login = await api("POST", "/auth/login", { body: { email: "pedro.alves@example.com", password: "pedro12345" } });
    expect("linked account gone -> login fails (401)", login.status === 401, JSON.stringify(login.data));

    const stale = await api("GET", "/students", { token: ctx.pedroToken });
    expect("old student session is gone (401)", stale.status === 401, JSON.stringify(stale.data));
  }
};