import { api, expect, step } from "../helpers.mjs";

export default async (ctx) => {
  step("reports");
  {
    const g = await api("POST", `/children/${ctx.childId}/reports/generate`, { token: ctx.guardianToken, body: { kind: "profile" } });
    expect("report queued", g.status === 201 && g.data.status === "queued", JSON.stringify(g.data));

    const list = await api("GET", `/children/${ctx.childId}/reports`, { token: ctx.guardianToken });
    expect("report listed", list.status === 200 && list.data.count >= 1, JSON.stringify(list.data));
  }

  step("audit trail");
  {
    const trail = await api("GET", `/audit/children/${ctx.childId}`, { token: ctx.guardianToken });
    expect("guardian reads child audit trail", trail.status === 200 && trail.data.count > 0, JSON.stringify(trail.data));

    const studentDenied = await api("GET", `/audit/children/${ctx.childId}`, { token: ctx.studentToken });
    expect("student cannot read audit trail", studentDenied.status === 403, JSON.stringify(studentDenied.data));
  }
};
