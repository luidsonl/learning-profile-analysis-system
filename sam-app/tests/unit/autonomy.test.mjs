import { test } from "node:test";
import assert from "node:assert/strict";
import { autonomyAllows, AUTONOMY_LEVELS } from "../../src/lib/scope.mjs";

test("matriz: supervised nao tem acesso extra", () => {
  for (const resource of ["observations_read", "submissions_list", "predict_full", "reports_self", "profile_edit"]) {
    assert.equal(autonomyAllows(resource, "supervised"), false, `${resource} should be denied at supervised`);
  }
});

test("matriz: guided libera observacoes, submissions e predict completo", () => {
  assert.equal(autonomyAllows("observations_read", "guided"), true);
  assert.equal(autonomyAllows("submissions_list", "guided"), true);
  assert.equal(autonomyAllows("predict_full", "guided"), true);
  assert.equal(autonomyAllows("reports_self", "guided"), false);
  assert.equal(autonomyAllows("profile_edit", "guided"), false);
});

test("matriz: autonomous herda guided e libera reports e perfil", () => {
  for (const resource of ["observations_read", "submissions_list", "predict_full", "reports_self", "profile_edit"]) {
    assert.equal(autonomyAllows(resource, "autonomous"), true, `${resource} should be allowed at autonomous`);
  }
});

test("matriz: nivel desconhecido tratado como supervised (deny)", () => {
  assert.equal(autonomyAllows("reports_self", "desconhecido"), false);
  assert.equal(autonomyAllows("observations_read", null), false);
});

test("matriz: recurso desconhecido negado", () => {
  assert.equal(autonomyAllows("algo_futuro", "autonomous"), false);
});

test("niveis validos sao supervisionados, guiados e autonomos", () => {
  assert.deepEqual(AUTONOMY_LEVELS, ["supervised", "guided", "autonomous"]);
});
