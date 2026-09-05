import { api, expect, step } from "../helpers.mjs";
import { TEST_FIXTURES } from "../fixtures.mjs";

// The first educator to register becomes the initial admin (active); any later
// educator and any guardian register `pending` and cannot sign in until an
// admin/educator approves their account.
//
// Seeds ctx: adminId/adminToken, educatorId/educatorToken, guardianId/guardianToken.
export default async (ctx) => {
  step("health");
  {
    const r = await api("GET", "/health");
    expect("health returns ok", r.status === 200 && r.data.status === "ok", JSON.stringify(r.data));
  }

  step("auth: register + first-educator bootstrap");
  {
    const a = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[0].email, name: TEST_FIXTURES[0].name, password: TEST_FIXTURES[0].password, role: TEST_FIXTURES[0].role } });
    expect("first educator becomes admin (active)", a.status === 201 && a.data.user.role === "admin" && a.data.user.status === "active", JSON.stringify(a.data));
    ctx.adminId = a.data.user.userId;

    const e = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[1].email, name: TEST_FIXTURES[1].name, password: TEST_FIXTURES[1].password, role: TEST_FIXTURES[1].role } });
    expect("later educator registers pending", e.status === 201 && e.data.user.role === "educator" && e.data.user.status === "pending", JSON.stringify(e.data));
    ctx.educatorId = e.data.user.userId;

    const g = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[2].email, name: TEST_FIXTURES[2].name, password: TEST_FIXTURES[2].password, role: TEST_FIXTURES[2].role } });
    expect("guardian registers pending", g.status === 201 && g.data.user.role === "guardian" && g.data.user.status === "pending", JSON.stringify(g.data));
    ctx.guardianId = g.data.user.userId;

    const dup = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[0].email, name: "Outra", password: "senha12345", role: "educator" } });
    expect("duplicate email rejected", dup.status === 409, JSON.stringify(dup.data));
  }

  step("auth: pending accounts blocked until approved");
  {
    const loginEducator = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[1].email, password: TEST_FIXTURES[1].password } });
    expect("pending educator cannot login", loginEducator.status === 403 && loginEducator.data.error.code === "pending_approval", JSON.stringify(loginEducator.data));

    const loginGuardian = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[2].email, password: TEST_FIXTURES[2].password } });
    expect("pending guardian cannot login", loginGuardian.status === 403 && loginGuardian.data.error.code === "pending_approval", JSON.stringify(loginGuardian.data));

    const a = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[0].email, password: TEST_FIXTURES[0].password } });
    expect("first educator (admin) login", a.status === 200 && !!a.data.token && a.data.user.role === "admin", JSON.stringify(a.data));
    ctx.adminToken = a.data.token;
  }

  step("auth: admin approves educator, educator approves guardian");
  {
    // Pending educator accounts list (admin sees all roles).
    const pendingEducators = await api("GET", "/admin/users?role=educator&status=pending", { token: ctx.adminToken });
    expect("admin lists pending educators", pendingEducators.status === 200 && pendingEducators.data.count === 1, JSON.stringify(pendingEducators.data));
    expect("admin list includes the pending educator", pendingEducators.data?.data?.[0]?.userId === ctx.educatorId, JSON.stringify(pendingEducators.data?.data));

    const approveE = await api("PATCH", `/admin/users/${ctx.educatorId}`, { token: ctx.adminToken, body: { status: "active" } });
    expect("admin approves educator", approveE.status === 200 && approveE.data.user.status === "active", JSON.stringify(approveE.data));

    const loginEducator2 = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[1].email, password: TEST_FIXTURES[1].password } });
    expect("approved educator login", loginEducator2.status === 200 && !!loginEducator2.data.token, JSON.stringify(loginEducator2.data));
    ctx.educatorToken = loginEducator2.data.token;

    // Educator approves the pending guardian.
    const nonAdmin = await api("PATCH", `/admin/users/${ctx.guardianId}`, { token: ctx.educatorToken, body: { role: "admin" } });
    expect("educator cannot change roles", nonAdmin.status === 403, JSON.stringify(nonAdmin.data));

    const approveG = await api("PATCH", `/admin/users/${ctx.guardianId}`, { token: ctx.educatorToken, body: { status: "active" } });
    expect("educator approves guardian", approveG.status === 200 && approveG.data.user.status === "active", JSON.stringify(approveG.data));

    const loginGuardian2 = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[2].email, password: TEST_FIXTURES[2].password } });
    expect("approved guardian login", loginGuardian2.status === 200 && !!loginGuardian2.data.token, JSON.stringify(loginGuardian2.data));
    ctx.guardianToken = loginGuardian2.data.token;
  }

  step("auth: misc");
  {
    const wrong = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[0].email, password: "errada" } });
    expect("wrong password rejected", wrong.status === 401, JSON.stringify(wrong.data));

    const noAuth = await api("GET", "/auth/me");
    expect("me without token rejected", noAuth.status === 401, JSON.stringify(noAuth.data));

    const me = await api("GET", "/auth/me", { token: ctx.guardianToken });
    expect("me returns guardian profile", me.status === 200 && me.data.user.role === "guardian", JSON.stringify(me.data));

    const meAdmin = await api("GET", "/auth/me", { token: ctx.adminToken });
    expect("me returns admin profile", meAdmin.status === 200 && meAdmin.data.user.role === "admin", JSON.stringify(meAdmin.data));
  }
};
