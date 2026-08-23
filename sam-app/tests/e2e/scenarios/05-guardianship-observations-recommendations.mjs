import { api, expect, step } from "../helpers.mjs";

// Seeds ctx: recoId.
export default async (ctx) => {
  step("guardianship: follow + lists");
  {
    const f = await api("POST", `/students/${ctx.studentId}/follow`, { token: ctx.educatorToken });
    expect("educator follows student", f.status === 201, JSON.stringify(f.data));

    const guardians = await api("GET", `/students/${ctx.studentId}/guardians`, { token: ctx.guardianToken });
    expect("guardians listed", guardians.status === 200 && guardians.data.data.length === 1 && guardians.data.data[0].userId === ctx.guardianId, JSON.stringify(guardians.data));

    const educators = await api("GET", `/students/${ctx.studentId}/educators`, { token: ctx.guardianToken });
    expect("educators listed", educators.status === 200 && educators.data.data.length === 1 && educators.data.data[0].userId === ctx.educatorId, JSON.stringify(educators.data));

    const educatorsList = await api("GET", "/students", { token: ctx.educatorToken });
    expect("educator lists followed student", educatorsList.status === 200 && educatorsList.data.count === 1, JSON.stringify(educatorsList.data));
  }

  step("observations");
  {
    const o = await api("POST", `/students/${ctx.studentId}/observations`, { token: ctx.educatorToken, body: { category: "academic", text: "Demonstra grande curiosidade por ciências.", rating: 4 } });
    expect("observation added", o.status === 201, JSON.stringify(o.data));

    const studentDenied = await api("GET", `/students/${ctx.studentId}/observations`, { token: ctx.studentToken });
    expect("student cannot view observations", studentDenied.status === 403, JSON.stringify(studentDenied.data));

    const list = await api("GET", `/students/${ctx.studentId}/observations`, { token: ctx.educatorToken });
    expect("educator lists observations", list.status === 200 && list.data.count === 1, JSON.stringify(list.data));
  }

  step("recommendations: propose + approve (educator)");
  {
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
