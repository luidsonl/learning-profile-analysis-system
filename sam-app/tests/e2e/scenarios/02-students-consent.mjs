import { api, expect, step } from "../helpers.mjs";
import { TEST_FIXTURES } from "../fixtures.mjs";

// An educator creates the student entity (and auto-follows), grants consent, and
// assigns the responsable via grantGuardian. The student SELF-REGISTERS their
// account (pending) and the educator LINKS it to the entity, approving it —
// see specs/auth.md (student self-registration + educator link) + backend.md.
//
// Ana Clara is a MINOR (< 18), so her link requires guardian/institution consent
// already granted on the entity. A minor without consent cannot be linked.
//
// Seeds ctx: studentId, studentToken, noConsentChildId, studentAccountUserId,
// plus the guardian-to-student edge (ctx.guardianId already set by s01).
export default async (ctx) => {
  step("students: educator creates + list/read");
  {
    const c = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Ana Clara", birthDate: "2016-03-12", gender: "F", grade: "3º ano", school: "Escola Municipal Flores" } });
    expect("educator creates student", c.status === 201 && !!c.data.studentId, JSON.stringify(c.data));
    ctx.studentId = c.data.studentId;

    const denied = await api("POST", "/students", { token: ctx.guardianToken, body: { name: "X", birthDate: "2016-01-01" } });
    expect("guardian cannot create student", denied.status === 403, JSON.stringify(denied.data));

    const list = await api("GET", "/students", { token: ctx.educatorToken });
    expect("educator lists created student", list.status === 200 && list.data.count === 1, JSON.stringify(list.data));

    const get = await api("GET", `/students/${ctx.studentId}`, { token: ctx.educatorToken });
    expect("get student", get.status === 200 && get.data.student.name === "Ana Clara", JSON.stringify(get.data));
  }

  step("consent: educator grants (institution)");
  {
    const before = await api("GET", `/students/${ctx.studentId}/consent`, { token: ctx.educatorToken });
    expect("consent initially not granted", before.data?.current?.status === "not_granted", JSON.stringify(before.data));

    const grant = await api("POST", `/students/${ctx.studentId}/consent`, { token: ctx.educatorToken, body: { consentVersion: "v1", status: "active", legalBasis: "institution_authorization" } });
    expect("educator grants consent", grant.status === 200 && grant.data.status === "active", JSON.stringify(grant.data));

    const after = await api("GET", `/students/${ctx.studentId}/consent`, { token: ctx.educatorToken });
    expect("consent persisted", after.data.current.status === "active" && after.data.history.length === 1, JSON.stringify(after.data));
  }

  step("guardianship: educator assigns responsable");
  {
    const link = await api("POST", `/students/${ctx.studentId}/guardians`, { token: ctx.educatorToken, body: { userId: ctx.guardianId } });
    expect("educator assigns guardian to student", link.status === 201, JSON.stringify(link.data));

    const guardians = await api("GET", `/students/${ctx.studentId}/guardians`, { token: ctx.guardianToken });
    expect("assigned guardian lists as guardian", guardians.status === 200 && guardians.data.data[0]?.userId === ctx.guardianId, JSON.stringify(guardians.data));
  }

  step("student account: self-register (pending) + educator link approves");
  {
    // Student self-registers (role: student + birthDate), starting `pending`.
    const reg = await api("POST", "/auth/register", {
      body: {
        email: TEST_FIXTURES[3].email,
        name: TEST_FIXTURES[3].name,
        password: TEST_FIXTURES[3].password,
        role: "student",
        birthDate: TEST_FIXTURES[3].birthDate,
      },
    });
    expect("student self-registers pending", reg.status === 201 && reg.data.user.role === "student" && reg.data.user.status === "pending", JSON.stringify(reg.data));
    ctx.studentAccountUserId = reg.data.user.userId;

    // A minor cannot be linked without consent already granted on the entity.
    const noConsentChild = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Sem Consentimento", birthDate: "2017-05-01" } });
    ctx.noConsentChildId = noConsentChild.data.studentId;
    const noConsentReg = await api("POST", "/auth/register", {
      body: { email: "sem.consentimento@example.com", name: "Sem Consentimento", password: "senha12345", role: "student", birthDate: "2017-05-01" },
    });
    expect("student registers for no-consent student", noConsentReg.status === 201, JSON.stringify(noConsentReg.data));
    const sFail = await api("POST", `/students/${ctx.noConsentChildId}/accounts/${noConsentReg.data.user.userId}/link`, { token: ctx.educatorToken, body: {} });
    expect("link blocked without consent (minor)", sFail.status === 409 && sFail.data.error.code === "consent_required", JSON.stringify(sFail.data));

    // Educator links Ana Clara's self-account, approving it (pending -> active).
    const acc = await api("POST", `/students/${ctx.studentId}/accounts/${ctx.studentAccountUserId}/link`, { token: ctx.educatorToken, body: {} });
    expect("educator links + approves student account", acc.status === 200 && acc.data.studentId === ctx.studentId, JSON.stringify(acc.data));

    // At-most-one: linking a second account (or re-linking) must conflict.
    const dupReg = await api("POST", "/auth/register", {
      body: { email: "ana2@example.com", name: "Ana 2", password: "senha12345", role: "student", birthDate: "2016-03-12" },
    });
    const s2 = await api("POST", `/students/${ctx.studentId}/accounts/${dupReg.data.user.userId}/link`, { token: ctx.educatorToken, body: {} });
    expect("at-most-one account per entity enforced", s2.status === 409, JSON.stringify(s2.data));
  }

  step("auth: linked student self login");
  {
    const s = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[3].email, password: TEST_FIXTURES[3].password } });
    expect("linked student self login (active)", s.status === 200 && !!s.data.token && s.data.user.status === "active", JSON.stringify(s.data));
    ctx.studentToken = s.data.token;

    const noList = await api("GET", "/students", { token: ctx.studentToken });
    expect("student cannot list students", noList.status === 403, JSON.stringify(noList.data));

    const studentCreate = await api("POST", "/students", { token: ctx.studentToken, body: { name: "X", birthDate: "2016-01-01" } });
    expect("student cannot create student", studentCreate.status === 403, JSON.stringify(studentCreate.data));
  }
};
