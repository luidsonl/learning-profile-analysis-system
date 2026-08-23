import { api, expect, step } from "../helpers.mjs";
import { TEST_FIXTURES } from "../fixtures.mjs";

// Seeds ctx: guardianId, guardianToken, educatorId, educatorToken.
export default async (ctx) => {
  step("health");
  {
    const r = await api("GET", "/health");
    expect("health returns ok", r.status === 200 && r.data.status === "ok", JSON.stringify(r.data));
  }

  step("auth: register");
  {
    const g = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[0].email, name: TEST_FIXTURES[0].name, password: TEST_FIXTURES[0].password, role: TEST_FIXTURES[0].role } });
    expect("guardian registered", g.status === 201, JSON.stringify(g.data));
    ctx.guardianId = g.data.user.userId;

    const e = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[1].email, name: TEST_FIXTURES[1].name, password: TEST_FIXTURES[1].password, role: TEST_FIXTURES[1].role } });
    expect("educator registered", e.status === 201, JSON.stringify(e.data));
    ctx.educatorId = e.data.user.userId;

    const dup = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[0].email, name: "Outra", password: "senha12345", role: "guardian" } });
    expect("duplicate email rejected", dup.status === 409, JSON.stringify(dup.data));

    const badRole = await api("POST", "/auth/register", { body: { email: "estudante@example.com", name: "Aluno", password: "senha12345", role: "student" } });
    expect("student cannot self-register", badRole.status === 400, JSON.stringify(badRole.data));
  }

  step("auth: login");
  {
    const g = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[0].email, password: TEST_FIXTURES[0].password } });
    expect("guardian login", g.status === 200 && !!g.data.token, JSON.stringify(g.data));
    ctx.guardianToken = g.data.token;

    const e = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[1].email, password: TEST_FIXTURES[1].password } });
    expect("educator login", e.status === 200 && !!e.data.token, JSON.stringify(e.data));
    ctx.educatorToken = e.data.token;

    const wrong = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[0].email, password: "errada" } });
    expect("wrong password rejected", wrong.status === 401, JSON.stringify(wrong.data));

    const noAuth = await api("GET", "/auth/me");
    expect("me without token rejected", noAuth.status === 401, JSON.stringify(noAuth.data));

    const me = await api("GET", "/auth/me", { token: ctx.guardianToken });
    expect("me returns profile", me.status === 200 && me.data.user.role === "guardian", JSON.stringify(me.data));
  }
};
