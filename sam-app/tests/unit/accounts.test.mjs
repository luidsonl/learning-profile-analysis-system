import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectPendingAccounts,
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

test("pending accounts keeps students only, newest first, with consent gate", () => {
  const adult = { userId: "u-adult", name: "Adulto", email: "a@example.com", birthDate: "2000-01-01", createdAt: "2026-09-01T00:00:00Z", status: "pending" };
  const minor = { userId: "u-minor", name: "Menor", email: "m@example.com", birthDate: "2016-03-12", createdAt: "2026-09-02T00:00:00Z", status: "pending" };
  const active = { userId: "u-active", name: "Ativo", email: "x@example.com", birthDate: "1990-01-01", createdAt: "2026-09-03T00:00:00Z", status: "active" };
  const noId = { name: "Sem id", email: "n@example.com", birthDate: "2000-01-01", createdAt: "2026-09-04T00:00:00Z", status: "pending" };

  const data = selectPendingAccounts([active, minor, adult, noId], MIN_AGE);
  assert.deepEqual(
    data.map((d) => d.userId),
    ["u-minor", "u-adult"],
    "newest first, active/no-id excluded",
  );
  assert.equal(data[0].consentRequired, "guardian_institution");
  assert.equal(data[1].consentRequired, "self");
});

test("guardian search matches active guardians by email prefix, limited", () => {
  const maria = { userId: "g1", name: "Maria da Silva", email: "maria.responsavel@example.com", status: "active" };
  const mariana = { userId: "g2", name: "Mariana Sá", email: "mariana@example.com", status: "active" };
  const pendingMaria = { userId: "g3", name: "Maria P", email: "maria.pending@example.com", status: "pending" };
  const luiz = { userId: "g4", name: "Luiz T", email: "luiz@example.com", status: "active" };

  assert.equal(guardianEmailMatches(luiz, "MARIA."), false);
  assert.equal(guardianEmailMatches(maria, "MARIA."), true);

  const hits = selectGuardianHits([pendingMaria, luiz, mariana, maria], "maria");
  assert.deepEqual(hits.map((h) => h.userId), ["g1", "g2"]);
  assert.deepEqual(hits[0], { userId: "g1", name: "Maria da Silva", email: "maria.responsavel@example.com" });
});

test("guardian search caps results", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ userId: `g${i}`, name: `G ${i}`, email: `g-${i}@example.com`, status: "active" }));
  assert.equal(selectGuardianHits(many, "g-", 25).length, 25);
  assert.equal(selectGuardianHits(many, "g-").length, 25);
});