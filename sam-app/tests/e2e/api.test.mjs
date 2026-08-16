import { cleanupChild, cleanupUser, findChildrenByCreator, findUserByEmail, purgeOrphanSessions } from "./aws-cleanup.mjs";

const BASE = process.env.API_BASE;
if (!BASE) {
  console.error("API_BASE is required — deployed API endpoint, e.g. https://xxxx.execute-api.us-east-1.amazonaws.com/prod");
  process.exit(2);
}

const TABLE = process.env.TABLE_NAME || "learning-profile";

// Solely the fixture identities this test itself creates. Cleanup deletes ONLY
// data added by the test (users/children keyed to these test-only emails) and
// never touches anything else in the table.
const TEST_FIXTURES = [
  { email: "maria.responsavel@example.com", name: "Maria da Silva", password: "senha12345", role: "guardian" },
  { email: "prof.joao@example.com", name: "João Pereira", password: "senha12345", role: "educator" },
  { email: "ana.clara@example.com", name: "Ana Clara", password: "senha12345", role: "student" },
  { email: "pedro.aluno@example.com", name: "Pedro Silva", password: "senha12345", role: "student" },
];

let passed = 0;
let failed = 0;
const failures = [];

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
};

const expect = (name, cond, extra = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`FAIL  ${name} ${extra}`);
  }
};

const step = (name) => console.log(`\n== ${name}`);

// Decisively reading/writing-dominant answers: R=5.0, A=1.0, K=2.0 (R-K=3 > 2,
// so the Flemming rule labels it R, unambiguous regardless of small tweaks).
const answers = {
  q01: 5, q02: 5, q03: 5, q04: 5, q05: 5,
  q06: 1, q07: 1, q08: 1, q09: 1, q10: 1,
  q11: 2, q12: 2, q13: 2, q14: 2, q15: 2,
};

let guardianToken, educatorToken, studentToken, childId, noConsentChildId, noGuardianChildId, guardianId, educatorId, studentId, recoId;

// Purge only the fixture identities this test creates (incl. leftovers of a
// previous crashed run of THIS test). Children are only removed when their
// creator is a fixture user, i.e. they were produced by this test.
const purgeFixtures = async () => {
  for (const { email } of TEST_FIXTURES) {
    const userId = await findUserByEmail(email);
    if (!userId) continue;
    for (const childId of await findChildrenByCreator(userId)) {
      await cleanupChild(childId);
    }
    await cleanupUser(userId, email);
  }
};

const logoutAll = async () => {
  for (const token of [guardianToken, educatorToken, studentToken]) {
    if (!token) continue;
    try {
      await api("POST", "/auth/logout", { token });
    } catch {
      /* best effort */
    }
  }
};

const cleanupErrors = [];

try {
  await purgeFixtures();

  step("health");
  {
    const r = await api("GET", "/health");
    expect("health returns ok", r.status === 200 && r.data.status === "ok", JSON.stringify(r.data));
  }

  step("auth: register");
  {
    const g = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[0].email, name: TEST_FIXTURES[0].name, password: TEST_FIXTURES[0].password, role: TEST_FIXTURES[0].role } });
    expect("guardian registered", g.status === 201, JSON.stringify(g.data));
    guardianId = g.data.user.userId;

    const e = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[1].email, name: TEST_FIXTURES[1].name, password: TEST_FIXTURES[1].password, role: TEST_FIXTURES[1].role } });
    expect("educator registered", e.status === 201, JSON.stringify(e.data));
    educatorId = e.data.user.userId;

    const dup = await api("POST", "/auth/register", { body: { email: TEST_FIXTURES[0].email, name: "Outra", password: "senha12345", role: "guardian" } });
    expect("duplicate email rejected", dup.status === 409, JSON.stringify(dup.data));

    const badRole = await api("POST", "/auth/register", { body: { email: "estudante@example.com", name: "Aluno", password: "senha12345", role: "student" } });
    expect("student cannot self-register", badRole.status === 400, JSON.stringify(badRole.data));
  }

  step("auth: login");
  {
    const g = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[0].email, password: TEST_FIXTURES[0].password } });
    expect("guardian login", g.status === 200 && !!g.data.token, JSON.stringify(g.data));
    guardianToken = g.data.token;

    const e = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[1].email, password: TEST_FIXTURES[1].password } });
    expect("educator login", e.status === 200 && !!e.data.token, JSON.stringify(e.data));
    educatorToken = e.data.token;

    const wrong = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[0].email, password: "errada" } });
    expect("wrong password rejected", wrong.status === 401, JSON.stringify(wrong.data));

    const noAuth = await api("GET", "/auth/me");
    expect("me without token rejected", noAuth.status === 401, JSON.stringify(noAuth.data));

    const me = await api("GET", "/auth/me", { token: guardianToken });
    expect("me returns profile", me.status === 200 && me.data.user.role === "guardian", JSON.stringify(me.data));
  }

  step("children: create + permissions");
  {
    const c = await api("POST", "/children", { token: guardianToken, body: { name: "Ana Clara", birthDate: "2016-03-12", gender: "F", grade: "3º ano", school: "Escola Municipal Flores" } });
    expect("child created", c.status === 201 && !!c.data.childId, JSON.stringify(c.data));
    childId = c.data.childId;

    const denied = await api("POST", "/children", { token: studentToken, body: { name: "X", birthDate: "2016-01-01" } });
    expect("student cannot create child (no token yet -> 401)", denied.status === 401, JSON.stringify(denied.data));

    const list = await api("GET", "/children", { token: guardianToken });
    expect("guardian lists own child", list.status === 200 && list.data.count === 1, JSON.stringify(list.data));

    const get = await api("GET", `/children/${childId}`, { token: guardianToken });
    expect("get child", get.status === 200 && get.data.child.name === "Ana Clara", JSON.stringify(get.data));
  }

  step("consent");
  {
    const before = await api("GET", `/children/${childId}/consent`, { token: guardianToken });
    expect("consent initially not granted", before.data?.current?.status === "not_granted", JSON.stringify(before.data));

    const grant = await api("POST", `/children/${childId}/consent`, { token: guardianToken, body: { consentVersion: "v1", status: "active" } });
    expect("consent granted", grant.status === 200 && grant.data.status === "active", JSON.stringify(grant.data));

    const after = await api("GET", `/children/${childId}/consent`, { token: guardianToken });
    expect("consent persisted", after.data.current.status === "active" && after.data.history.length === 1, JSON.stringify(after.data));
  }

  step("guardianship: student account");
  {
    const noConsentChild = await api("POST", "/children", { token: guardianToken, body: { name: "Sem Consentimento", birthDate: "2017-05-01" } });
    noConsentChildId = noConsentChild.data.childId;
    const sFail = await api("POST", `/children/${noConsentChildId}/student-account`, { token: guardianToken, body: { email: "sem.consentimento@example.com", name: "Sem Consentimento", password: "senha12345" } });
    expect("student account blocked without consent", sFail.status === 409, JSON.stringify(sFail.data));

    const s = await api("POST", `/children/${childId}/student-account`, { token: guardianToken, body: { email: TEST_FIXTURES[2].email, name: TEST_FIXTURES[2].name, password: TEST_FIXTURES[2].password } });
    expect("student account created", s.status === 201 && !!s.data.userId, JSON.stringify(s.data));
    studentId = s.data.userId;

    const s2 = await api("POST", `/children/${childId}/student-account`, { token: guardianToken, body: { email: "ana2@example.com", name: "Ana 2", password: "senha12345" } });
    expect("duplicate student account rejected", s2.status === 409, JSON.stringify(s2.data));
  }

  step("auth: student login");
  {
    const s = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[2].email, password: TEST_FIXTURES[2].password } });
    expect("student login", s.status === 200 && !!s.data.token, JSON.stringify(s.data));
    studentToken = s.data.token;

    const noList = await api("GET", "/children", { token: studentToken });
    expect("student cannot list children", noList.status === 403, JSON.stringify(noList.data));
  }

  step("forms: student sees only student forms");
  {
    const all = await api("GET", "/forms", { token: studentToken });
    expect("student lists forms", all.status === 200 && all.data.data.length === 1 && all.data.data[0].formId === "vark-kids", JSON.stringify(all.data));

    const guardianForms = await api("GET", "/forms", { token: guardianToken });
    expect("guardian sees all forms", guardianForms.status === 200 && guardianForms.data.count === 4, JSON.stringify(guardianForms.data));
  }

  step("forms: submit tests (decoupled from classification)");
  {
    const r = await api("POST", `/children/${childId}/forms/vark-kids/responses`, {
      token: studentToken,
      body: { answers, requestId: "test-run-1" },
    });
    expect("vark submission accepted", r.status === 201 && !!r.data.submissionId, JSON.stringify(r.data));

    const dup = await api("POST", `/children/${childId}/forms/vark-kids/responses`, {
      token: studentToken,
      body: { answers, requestId: "test-run-1" },
    });
    expect("duplicate submission idempotent", dup.status === 200 && dup.data.submittedBy === "already_exists", JSON.stringify(dup.data));

    const byGuardian = await api("POST", `/children/${childId}/forms/anamnesis/responses`, {
      token: guardianToken,
      body: { answers: { a01: "2016-03-12", a02: "dentro do esperado", a03: "não", a07: "Boa adaptação", a10: "Nenhuma" } },
    });
    expect("guardian anamnesis accepted", byGuardian.status === 201, JSON.stringify(byGuardian.data));

    const forbidden = await api("POST", `/children/${childId}/forms/vark-kids/responses`, { token: guardianToken, body: { answers } });
    expect("guardian cannot submit student form", forbidden.status === 403, JSON.stringify(forbidden.data));
  }

  step("submissions: fetch stored tests (no classification side-effect)");
  {
    const before = await api("GET", `/children/${childId}/submissions`, { token: guardianToken });
    expect("submissions listed without assessment yet", before.status === 200 && before.data.count === 2, JSON.stringify(before.data));

    const noAssessYet = await api("GET", `/children/${childId}/assessments`, { token: guardianToken });
    expect("no assessment persisted yet (decoupled)", noAssessYet.status === 200 && noAssessYet.data.count === 0, JSON.stringify(noAssessYet.data));

    const perForm = await api("GET", `/children/${childId}/forms/vark-kids/responses`, { token: guardianToken });
    expect("per-form responses listed", perForm.status === 200 && perForm.data.count === 1, JSON.stringify(perForm.data));
  }

  step("assessment: classify stored submissions");
  {
    const a = await api("POST", `/children/${childId}/assessments`, { token: guardianToken });
    expect("assessment labels reading/writing", a.status === 201 && a.data.kind === "assessment" && a.data.label === "R", JSON.stringify(a.data));

    const list = await api("GET", `/children/${childId}/assessments`, { token: guardianToken });
    expect("assessment listed", list.status === 200 && list.data.count >= 1, JSON.stringify(list.data));
  }

  step("predict: model inference, no bundled recommendations");
  {
    const p = await api("POST", `/children/${childId}/predict`, { token: guardianToken });
    expect("prediction created", p.status === 201 && p.data.prediction.label === "R" && !!p.data.prediction.model, JSON.stringify(p.data));

    const recs = await api("GET", `/children/${childId}/recommendations`, { token: guardianToken });
    expect("no recommendations bundled with prediction", recs.status === 200 && recs.data.count === 0, JSON.stringify(recs.data));
  }

  step("guardianship: follow + lists");
  {
    const f = await api("POST", `/children/${childId}/follow`, { token: educatorToken });
    expect("educator follows child", f.status === 201, JSON.stringify(f.data));

    const guardians = await api("GET", `/children/${childId}/guardians`, { token: guardianToken });
    expect("guardians listed", guardians.status === 200 && guardians.data.data.length === 1 && guardians.data.data[0].userId === guardianId, JSON.stringify(guardians.data));

    const educators = await api("GET", `/children/${childId}/educators`, { token: guardianToken });
    expect("educators listed", educators.status === 200 && educators.data.data.length === 1 && educators.data.data[0].userId === educatorId, JSON.stringify(educators.data));

    const educatorsList = await api("GET", "/children", { token: educatorToken });
    expect("educator lists followed child", educatorsList.status === 200 && educatorsList.data.count === 1, JSON.stringify(educatorsList.data));
  }

  step("observations");
  {
    const o = await api("POST", `/children/${childId}/observations`, { token: educatorToken, body: { category: "academic", text: "Demonstra grande curiosidade por ciências.", rating: 4 } });
    expect("observation added", o.status === 201, JSON.stringify(o.data));

    const studentDenied = await api("GET", `/children/${childId}/observations`, { token: studentToken });
    expect("student cannot view observations", studentDenied.status === 403, JSON.stringify(studentDenied.data));

    const list = await api("GET", `/children/${childId}/observations`, { token: educatorToken });
    expect("educator lists observations", list.status === 200 && list.data.count === 1, JSON.stringify(list.data));
  }

  step("recommendations: propose + approve (educator)");
  {
    const studentRecs = await api("GET", `/children/${childId}/recommendations`, { token: studentToken });
    expect("student sees 0 recs before approval", studentRecs.status === 200 && studentRecs.data.count === 0, JSON.stringify(studentRecs.data));

    const propose = await api("POST", `/children/${childId}/recommendations`, { token: educatorToken, body: { title: "Leitura e escrita", text: "Oferecer materiais escritos e incentivar a reescrita do conteúdo.", tags: ["leitura", "escrita"] } });
    expect("educator proposes recommendation", propose.status === 201 && !!propose.data.recoId, JSON.stringify(propose.data));
    recoId = propose.data.recoId;

    const studentRecs2 = await api("GET", `/children/${childId}/recommendations`, { token: studentToken });
    expect("student still sees 0 while proposed", studentRecs2.status === 200 && studentRecs2.data.count === 0, JSON.stringify(studentRecs2.data));

    const approve = await api("PATCH", `/children/${childId}/recommendations/${recoId}`, { token: educatorToken, body: { status: "approved", visibility: "published" } });
    expect("educator approves recommendation", approve.status === 200, JSON.stringify(approve.data));

    const studentRecs3 = await api("GET", `/children/${childId}/recommendations`, { token: studentToken });
    expect("student sees approved recommendation", studentRecs3.status === 200 && studentRecs3.data.count === 1, JSON.stringify(studentRecs3.data));
  }

  step("autonomy: supervised student predict is label-only");
  {
    const p = await api("POST", `/children/${childId}/predict`, { token: studentToken });
    expect("supervised predict is label-only", p.status === 201 && p.data.prediction.label === "R" && p.data.prediction.scores === undefined, JSON.stringify(p.data));

    const lst = await api("GET", `/children/${childId}/predictions`, { token: studentToken });
    expect("supervised prediction list label-only", lst.status === 200 && lst.data.data[0]?.scores === undefined, JSON.stringify(lst.data));
  }

  step("autonomy: student without guardian (educator-led)");
  {
    const c = await api("POST", "/children", { token: educatorToken, body: { name: "Pedro Silva", birthDate: "2012-09-01", accountability: { institution: "Escola Municipal Flores" } } });
    expect("educator creates child without guardian", c.status === 201, JSON.stringify(c.data));
    noGuardianChildId = c.data.childId;

    const consent = await api("POST", `/children/${noGuardianChildId}/consent`, { token: educatorToken, body: { consentVersion: "v1", status: "active", legalBasis: "institution_authorization" } });
    expect("educator grants institution consent", consent.status === 200 && consent.data.legalBasis === "institution_authorization", JSON.stringify(consent.data));

    const cGet = await api("GET", `/children/${noGuardianChildId}/consent`, { token: educatorToken });
    expect("consent basis persisted", cGet.data?.current?.legalBasis === "institution_authorization" && cGet.data?.current?.grantedByRole === "educator", JSON.stringify(cGet.data));

    const s = await api("POST", `/children/${noGuardianChildId}/student-account`, { token: educatorToken, body: { email: TEST_FIXTURES[3].email, name: TEST_FIXTURES[3].name, password: TEST_FIXTURES[3].password } });
    expect("educator creates student account", s.status === 201 && !!s.data.userId, JSON.stringify(s.data));

    const stu = await api("POST", "/auth/login", { body: { email: TEST_FIXTURES[3].email, password: TEST_FIXTURES[3].password } });
    expect("no-guardian student login", stu.status === 200 && !!stu.data.token, JSON.stringify(stu.data));
    const pedroToken = stu.data.token;

    const sub = await api("POST", `/children/${noGuardianChildId}/forms/vark-kids/responses`, { token: pedroToken, body: { answers } });
    expect("student without guardian submits own form", sub.status === 201, JSON.stringify(sub.data));

    const obsDenied = await api("GET", `/children/${noGuardianChildId}/observations`, { token: pedroToken });
    expect("supervised cannot read observations", obsDenied.status === 403, JSON.stringify(obsDenied.data));

    const subsDenied = await api("GET", `/children/${noGuardianChildId}/submissions`, { token: pedroToken });
    expect("supervised cannot list submissions", subsDenied.status === 403, JSON.stringify(subsDenied.data));

    await api("POST", `/children/${noGuardianChildId}/observations`, { token: educatorToken, body: { category: "academic", text: "Ótima concentração.", rating: 5 } });

    const up = await api("PATCH", `/children/${noGuardianChildId}/autonomy`, { token: educatorToken, body: { level: "guided", reason: "autonomia progressiva" } });
    expect("educator raises autonomy to guided", up.status === 200 && up.data.level === "guided", JSON.stringify(up.data));

    const obsOk = await api("GET", `/children/${noGuardianChildId}/observations`, { token: pedroToken });
    expect("guided reads own observations", obsOk.status === 200 && obsOk.data.count >= 1, JSON.stringify(obsOk.data));

    const subsOk = await api("GET", `/children/${noGuardianChildId}/submissions`, { token: pedroToken });
    expect("guided lists own submissions", subsOk.status === 200 && subsOk.data.count >= 1, JSON.stringify(subsOk.data));

    const pred = await api("POST", `/children/${noGuardianChildId}/predict`, { token: pedroToken });
    expect("guided predict includes scores", pred.status === 201 && pred.data.prediction.scores && pred.data.prediction.confidence !== undefined, JSON.stringify(pred.data));

    const hist = await api("GET", `/children/${noGuardianChildId}/autonomy`, { token: educatorToken });
    expect("autonomy history recorded", hist.status === 200 && hist.data.current.level === "guided" && hist.data.history.length >= 1, JSON.stringify(hist.data));

    const repDenied = await api("POST", `/children/${noGuardianChildId}/reports/generate`, { token: pedroToken, body: { kind: "profile" } });
    expect("guided cannot generate own reports", repDenied.status === 403, JSON.stringify(repDenied.data));

    await api("POST", "/auth/logout", { token: pedroToken });
  }

  step("reports");
  {
    const g = await api("POST", `/children/${childId}/reports/generate`, { token: guardianToken, body: { kind: "profile" } });
    expect("report queued", g.status === 201 && g.data.status === "queued", JSON.stringify(g.data));

    const list = await api("GET", `/children/${childId}/reports`, { token: guardianToken });
    expect("report listed", list.status === 200 && list.data.count >= 1, JSON.stringify(list.data));
  }

  step("models: RBAC");
  {
    const noAdmin = await api("GET", "/models", { token: guardianToken });
    expect("guardian cannot list models", noAdmin.status === 403, JSON.stringify(noAdmin.data));
  }

  step("audit trail");
  {
    const trail = await api("GET", `/audit/children/${childId}`, { token: guardianToken });
    expect("guardian reads child audit trail", trail.status === 200 && trail.data.count > 0, JSON.stringify(trail.data));

    const studentDenied = await api("GET", `/audit/children/${childId}`, { token: studentToken });
    expect("student cannot read audit trail", studentDenied.status === 403, JSON.stringify(studentDenied.data));
  }
} finally {
  // Delete ONLY what this test added: sessions (logout), then the fixture
  // users + their children. Anything else in the table is left untouched.
  await logoutAll();
  try {
    await purgeFixtures();
    const removedSessions = await purgeOrphanSessions();
    console.log(`\ncleanup: removed test data from ${TABLE} (${removedSessions} orphan sessions)`);
  } catch (err) {
    cleanupErrors.push(`cleanup failed: ${err.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (cleanupErrors.length) {
  console.log("CLEANUP:", cleanupErrors.join("; "));
}
if (failed > 0 || cleanupErrors.length > 0) {
  if (failures.length) console.log("Failures:", failures.join(", "));
  process.exit(1);
}
