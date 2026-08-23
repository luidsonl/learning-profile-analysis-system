import { api, expect, step } from "../helpers.mjs";
import { TEST_FIXTURES } from "../fixtures.mjs";

// Seeds ctx: studentId, studentId, studentToken, noConsentChildId.
export default async (ctx) => {
  step("children: create + permissions");
  {
    const c = await api("POST", "/students", { token: ctx.guardianToken, body: { name: "Ana Clara", birthDate: "2016-03-12", gender: "F", grade: "3º ano", school: "Escola Municipal Flores" } });
    expect("child created", c.status === 201 && !!c.data.studentId, JSON.stringify(c.data));
    ctx.studentId = c.data.studentId;

    const denied = await api("POST", "/students", { token: ctx.studentToken, body: { name: "X", birthDate: "2016-01-01" } });
    expect("student cannot create child (no token yet -> 401)", denied.status === 401, JSON.stringify(denied.data));

    const list = await api("GET", "/students", { token: ctx.guardianToken });
    expect("guardian lists own child", list.status === 200 && list.data.count === 1, JSON.stringify(list.data));

    const get = await api("GET", `/students/${ctx.studentId}`, { token: ctx.guardianToken });
    expect("get child", get.status === 200 && get.data.child.name === "Ana Clara", JSON.stringify(get.data));
  }

  step("consent");
  {
    const before = await api("GET", `/students/${ctx.studentId}/consent`, { token: ctx.guardianToken });
    expect("consent initially not granted", before.data?.current?.status === "not_granted", JSON.stringify(before.data));

    const grant = await api("POST", `/students/${ctx.studentId}/consent`, { token: ctx.guardianToken, body: { consentVersion: "v1", status: "active" } });
    expect("consent granted", grant.status === 200 && grant.data.status === "active", JSON.stringify(grant.data));

    const after = await api("GET", `/students/${ctx.studentId}/consent`, { token: ctx.guardianToken });
    expect("consent persisted", after.data.current.status === "active" && after.data.history.length === 1, JSON.stringify(after.data));
  }

  step("guardianship: student account");
  {
    const noConsentChild = await api("POST", "/students", { token: ctx.guardianToken, body: { name: "Sem Consentimento", birthDate: "2017-05-01" } });
    ctx.noConsentChildId = noConsentChild.data.studentId;
    const sFail = await api("POST", `/students/${ctx.noConsentChildId}/student-account`, { token: ctx.guardianToken, body: { email: "sem.consentimento@example.com", name: "Sem Consentimento", password: "senha12345" } });
    expect("student account blocked without consent", sFail.status === 409, JSON.stringify(sFail.data));

    const s = await api("POST", `/students/${ctx.studentId}/student-account`, { token: ctx.guardianToken, body: { email: TEST_FIXTURES[2].email, name: TEST_FIXTURES[2].name, password: TEST_FIXTURES[2].password } });
    expect("student account created", s.status === 201 && !!s.data.userId, JSON.stringify(s.data));
    ctx.studentId = s.data.userId;

    const s2 = await api("POST", `/students/${ctx.studentId}/student-account`, { token: ctx.guardianToken, body: { email: "ana2@example.com", name: "Ana 2", password: "senha12345" } });
    expect("duplicate student account rejected", s2.status === 409, JSON.stringify(s2.data));
  }

  step("auth: student login");
  {
    const s = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[2].email, password: TEST_FIXTURES[2].password } });
    expect("student login", s.status === 200 && !!s.data.token, JSON.stringify(s.data));
    ctx.studentToken = s.data.token;

    const noList = await api("GET", "/students", { token: ctx.studentToken });
    expect("student cannot list children", noList.status === 403, JSON.stringify(noList.data));
  }
};
