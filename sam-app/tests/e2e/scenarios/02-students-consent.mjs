import { api, expect, step } from "../helpers.mjs";
import { TEST_FIXTURES } from "../fixtures.mjs";

// An educator creates the student (and auto-follows), grants consent, assigns
// the responsable via grantGuardian, and creates the student self-account.
//
// Seeds ctx: studentId, guardianLink (assigns guardian), studentToken,
// noConsentChildId, studentAccountUserId.
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
    // Guardian (no consent child) blocked from creating a student account.
    const noConsentChild = await api("POST", "/students", { token: ctx.educatorToken, body: { name: "Sem Consentimento", birthDate: "2017-05-01" } });
    ctx.noConsentChildId = noConsentChild.data.studentId;
    const sFail = await api("POST", `/students/${ctx.noConsentChildId}/student-account`, { token: ctx.educatorToken, body: { email: "sem.consentimento@example.com", name: "Sem Consentimento", password: "senha12345" } });
    expect("student account blocked without consent", sFail.status === 409, JSON.stringify(sFail.data));

    const link = await api("POST", `/students/${ctx.studentId}/guardians`, { token: ctx.educatorToken, body: { userId: ctx.guardianId } });
    expect("educator assigns guardian to student", link.status === 201, JSON.stringify(link.data));

    const guardians = await api("GET", `/students/${ctx.studentId}/guardians`, { token: ctx.guardianToken });
    expect("assigned guardian lists as guardian", guardians.status === 200 && guardians.data.data[0]?.userId === ctx.guardianId, JSON.stringify(guardians.data));
  }

  step("guardianship: create student self-account");
  {
    const s = await api("POST", `/students/${ctx.studentId}/student-account`, { token: ctx.educatorToken, body: { email: TEST_FIXTURES[3].email, name: TEST_FIXTURES[3].name, password: TEST_FIXTURES[3].password } });
    expect("educator creates student account", s.status === 201 && !!s.data.userId, JSON.stringify(s.data));
    ctx.studentAccountUserId = s.data.userId;

    const s2 = await api("POST", `/students/${ctx.studentId}/student-account`, { token: ctx.educatorToken, body: { email: "ana2@example.com", name: "Ana 2", password: "senha12345" } });
    expect("duplicate student account rejected", s2.status === 409, JSON.stringify(s2.data));
  }

  step("auth: student self login");
  {
    const s = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[3].email, password: TEST_FIXTURES[3].password } });
    expect("student self login", s.status === 200 && !!s.data.token, JSON.stringify(s.data));
    ctx.studentToken = s.data.token;

    const noList = await api("GET", "/students", { token: ctx.studentToken });
    expect("student cannot list students", noList.status === 403, JSON.stringify(noList.data));

    const studentCreate = await api("POST", "/students", { token: ctx.studentToken, body: { name: "X", birthDate: "2016-01-01" } });
    expect("student cannot create student", studentCreate.status === 403, JSON.stringify(studentCreate.data));
  }
};
