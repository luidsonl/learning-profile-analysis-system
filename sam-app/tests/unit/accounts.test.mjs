import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectStudentAccounts,
  selectGuardianHits,
  consentRequired,
  guardianEmailMatches,
} from "../../src/api/lib/accounts.mjs";

const MIN_AGE = 18;

test("consent gate flags an adult as self, a minor as guardian_institution", () => {
  assert.equal(consentRequired({ age: 19 }, MIN_AGE), "self");
  assert.equal(consentRequired({ birthDate: "2016-03-12" }, MIN_AGE), "guardian_institution");
  assert.equal(consentRequired({ age: 18 }, MIN_AGE), "self");
  assert.equal(consentRequired({ age: 17 }, MIN_AGE), "guardian_institution");
});

test("student accounts catalog: pending available, linked active marked unavailable", () => {
  const adult = { userId: "u-adult", name: "Adulto", email: "a@example.com", birthDate: "2000-01-01", createdAt: "2026-09-01T00:00:00Z", status: "pending" };
  const minor = { userId: "u-minor", name: "Menor", email: "m@example.com", birthDate: "2016-03-12", createdAt: "2026-09-02T00:00:00Z", status: "pending" };
  const linked = { userId: "u-linked", name: "Vinculado", email: "l@example.com", birthDate: "1990-01-01", createdAt: "2026-09-03T00:00:00Z", status: "active", linkedStudentId: "st-1" };
  const denied = { userId: "u-denied", name: "Negado", email: "d@example.com", birthDate: "2000-01-01", createdAt: "2026-09-04T00:00:00Z", status: "denied" };
  const noId = { name: "Sem id", email: "n@example.com", birthDate: "2000-01-01", createdAt: "2026-09-05T00:00:00Z", status: "pending" };

  const data = selectStudentAccounts([linked, minor, adult, denied, noId], MIN_AGE);
  assert.deepEqual(
    data.map((d) => d.userId),
    ["u-linked", "u-minor", "u-adult"],
    "newest first, denied/no-id excluded",
  );
  assert.equal(data[0].available, false, "linked account is unavailable");
  assert.equal(data[0].linkedStudentId, "st-1");
  assert.equal(data[0].status, "active");
  assert.equal(data[1].available, true, "pending account is available");
  assert.equal(data[1].consentRequired, "guardian_institution");
  assert.equal(data[1].linkedStudentId, null);
  assert.equal(data[2].available, true);
  assert.equal(data[2].consentRequired, "self");
});

test("guardian list matches active guardians by email prefix; empty prefix lists all", () => {
  const maria = { userId: "g1", name: "Maria da Silva", email: "maria.responsavel@example.com", status: "active" };
  const mariana = { userId: "g2", name: "Mariana Sá", email: "mariana@example.com", status: "active" };
  const pendingMaria = { userId: "g3", name: "Maria P", email: "maria.pending@example.com", status: "pending" };
  const luiz = { userId: "g4", name: "Luiz T", email: "luiz@example.com", status: "active" };

  assert.equal(guardianEmailMatches(luiz, "MARIA."), false);
  assert.equal(guardianEmailMatches(maria, "MARIA."), true);

  const hits = selectGuardianHits([pendingMaria, luiz, mariana, maria], "maria");
  assert.deepEqual(hits.map((h) => h.userId), ["g1", "g2"]);
  assert.deepEqual(hits[0], { userId: "g1", name: "Maria da Silva", email: "maria.responsavel@example.com" });

  const all = selectGuardianHits([pendingMaria, luiz, mariana, maria], "");
  assert.deepEqual(all.map((h) => h.userId), ["g4", "g1", "g2"], "no filter lists all active guardians");
});

test("guardian list caps results at the default/overridden limit", () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ userId: `g${i}`, name: `G ${i}`, email: `g-${i}@example.com`, status: "active" }));
  assert.equal(selectGuardianHits(many, "g-", 25).length, 25);
  assert.equal(selectGuardianHits(many, "g-").length, 100, "default limit");
});