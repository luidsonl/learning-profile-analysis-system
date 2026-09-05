import { api, expect, step } from "../helpers.mjs";

export default async (ctx) => {
  step("reports");
  {
    const g = await api("POST", `/students/${ctx.studentId}/reports/generate`, { token: ctx.guardianToken, body: { kind: "profile" } });
    expect("report queued", g.status === 201 && g.data.status === "queued", JSON.stringify(g.data));

    const list = await api("GET", `/students/${ctx.studentId}/reports`, { token: ctx.guardianToken });
    expect("report listed", list.status === 200 && list.data.count >= 1, JSON.stringify(list.data));
  }

  step("audit trail");
  {
    const trail = await api("GET", `/audit/students/${ctx.studentId}`, { token: ctx.guardianToken });
    expect("guardian reads student audit trail", trail.status === 200 && trail.data.count > 0, JSON.stringify(trail.data));

    const studentDenied = await api("GET", `/audit/students/${ctx.studentId}`, { token: ctx.studentToken });
    expect("student cannot read audit trail", studentDenied.status === 403, JSON.stringify(studentDenied.data));

    const byActor = await api("GET", `/audit?actor=${ctx.guardianId}`, { token: ctx.adminToken });
    expect("admin reads actor audit trail", byActor.status === 200 && byActor.data.count > 0, JSON.stringify(byActor.data));

    const nonAdmin = await api("GET", `/audit?actor=${ctx.guardianId}`, { token: ctx.guardianToken });
    expect("guardian cannot read actor audit trail", nonAdmin.status === 403, JSON.stringify(nonAdmin.data));
  }
};
