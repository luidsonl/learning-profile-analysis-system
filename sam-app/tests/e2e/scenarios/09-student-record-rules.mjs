import { api, expect, step } from "../helpers.mjs";
import { answers } from "../fixtures.mjs";

// Validates the "STUDENT# is a record, not a user" business rule family from
// specs/auth.md (SSOT) + specs/dynamodb-schema.md:
//
//  1. A student entity can be linked ONLY to a guardian (no self-account) —
//     the guardian fills forms and manages the data on the student's behalf.
//  2. A student entity can ALSO have its own self-account while the guardian
//     keeps full management (the two relations are cumulative, not exclusive).
//  3. A single guardian guards MANY students (one GUARD# edge per student).
//  4. A minor (role=student) can NEVER grant/revoke consent — self_consent is
//     reserved for adult flows (specs/lgpd.md). Restriction enforced in
//     sam-app/src/api/handlers/consent.mjs.
//  5. Only an educator (following) or an admin can create the student account;
//     a guardian cannot (only the student-account creation, not guardianship).
//  6. Scope: a guardian cannot access a student they do not guard.
//
// Seeds nothing new; consumes ctx from earlier scenarios (Ana Clara = tutor-led
// self-account student, Pedro = no-guardian self-account student).
export default async (ctx) => {
  step("record: guardian-managed only student (no self-account)");
  let managedId;
  {
    const c = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Rafael Souza", birthDate: "2015-07-08" } });
    expect("educator creates guardian-managed student", c.status === 201 && !!c.data.studentId, JSON.stringify(c.data));
    managedId = c.data.studentId;

    const consent = await api("POST", `/students/${managedId}/consent`, { token: ctx.educatorToken, body: { consentVersion: "v1", status: "active", legalBasis: "institution_authorization" } });
    expect("educator grants consent for managed student", consent.status === 200 && consent.data.status === "active", JSON.stringify(consent.data));

    const link = await api("POST", `/students/${managedId}/guardians`, { token: ctx.educatorToken, body: { userId: ctx.guardianId } });
    expect("educator assigns guardian to managed student", link.status === 201, JSON.stringify(link.data));
  }

  step("record: guardian fills forms on behalf of the account-less student");
  {
    const ana = await api("POST", `/students/${managedId}/forms/anamnesis/responses`, {
      token: ctx.guardianToken,
      body: { answers: { a01: "2015-07-08", a02: "dentro do esperado", a03: "não", a07: "Boa adaptação", a10: "Nenhuma" } },
    });
    expect("guardian anamnesis on behalf", ana.status === 201, JSON.stringify(ana.data));

    const vark = await api("POST", `/students/${managedId}/forms/vark/responses`, {
      token: ctx.guardianToken,
      body: { answers, requestId: "managed-vark" },
    });
    expect("guardian-assisted vark on behalf", vark.status === 201, JSON.stringify(vark.data));
  }

  step("record: coexistence — guardian keeps management after self-account");
  {
    // Ana Clara already HAS a self-account (ctx.studentToken) AND her assigned
    // guardian (ctx.guardianToken). Both must read the SAME student record.
    const byGuardian = await api("GET", `/students/${ctx.studentId}`, { token: ctx.guardianToken });
    expect("guardian still reads student with self-account", byGuardian.status === 200 && byGuardian.data.student.name === "Ana Clara", JSON.stringify(byGuardian.data));

    const byStudent = await api("GET", `/students/${ctx.studentId}`, { token: ctx.studentToken });
    expect("self-account holder reads own record", byStudent.status === 200 && byStudent.data.student.name === "Ana Clara", JSON.stringify(byStudent.data));

    const edit = await api("PATCH", `/students/${ctx.studentId}`, { token: ctx.guardianToken, body: { school: "Escola Coexistência" } });
    expect("guardian still edits profile after self-account", edit.status === 200, JSON.stringify(edit.data));

    const ana = await api("POST", `/students/${ctx.studentId}/forms/anamnesis/responses`, {
      token: ctx.guardianToken,
      body: { answers: { a01: "2016-03-12", a02: "esperado", a03: "não", a07: "Boa", a10: "Nenhuma" } },
    });
    expect("guardian still fills forms after self-account", ana.status === 201, JSON.stringify(ana.data));
  }

  step("record: one guardian guards many students");
  {
    const list = await api("GET", "/students", { token: ctx.guardianToken });
    expect(
      "guardian lists all guarded students (managed + self-account)",
      list.status === 200 && list.data.count >= 2 && list.data.data.some((s) => s.studentId === managedId) && list.data.data.some((s) => s.studentId === ctx.studentId),
      JSON.stringify(list.data),
    );
  }

  step("consent: minor can never grant/revoke consent (403)");
  {
    const grant = await api("POST", `/students/${ctx.studentId}/consent`, { token: ctx.studentToken, body: { consentVersion: "v2", status: "active", legalBasis: "self_consent" } });
    expect("minor cannot grant own consent", grant.status === 403, JSON.stringify(grant.data));

    const revoke = await api("POST", `/students/${ctx.studentId}/consent`, { token: ctx.studentToken, body: { consentVersion: "v2", status: "revoked" } });
    expect("minor cannot revoke own consent", revoke.status === 403, JSON.stringify(revoke.data));

    const byGuardian = await api("POST", `/students/${ctx.studentId}/consent`, { token: ctx.guardianToken, body: { consentVersion: "v2", status: "active", legalBasis: "guardian" } });
    expect("guardian still grants consent", byGuardian.status === 200 && byGuardian.data.status === "active", JSON.stringify(byGuardian.data));
  }

  step("guardianship: guardian cannot create the student account (403)");
  {
    const acc = await api("POST", `/students/${managedId}/student-account`, { token: ctx.guardianToken, body: { email: "rafael.nao@example.com", name: "Rafael Souza", password: "senha12345" } });
    expect("guardian cannot create student account", acc.status === 403, JSON.stringify(acc.data));
  }

  step("scope: guardian cannot access an un-guarded student (403)");
  {
    const other = await api("POST", "/students", { token: ctx.adminToken, body: { name: "Sem Vínculo", birthDate: "2016-01-15" } });
    expect("admin creates un-guarded student", other.status === 201 && !!other.data.studentId, JSON.stringify(other.data));

    const denied = await api("GET", `/students/${other.data.studentId}`, { token: ctx.guardianToken });
    expect("guardian blocked from un-assigned student", denied.status === 403, JSON.stringify(denied.data));
  }
};