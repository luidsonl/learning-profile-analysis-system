import { test } from "node:test";
import assert from "node:assert/strict";
import { getDefinitions, getFormDefinition, getFormProcessor, getAssessmentProcessor } from "../../src/forms/engine.mjs";
import { validateFormDefinition } from "../../src/forms/schema.mjs";

test("todas as definicoes registradas sao validas", () => {
  const defs = getDefinitions();
  assert.ok(defs.length >= 4);
  for (const def of defs) {
    assert.deepEqual(validateFormDefinition(def), [], `form ${def.formId} invalida`);
  }
});

test("definicoes sao unicas por formId", () => {
  const ids = getDefinitions().map((d) => d.formId);
  assert.equal(new Set(ids).size, ids.length);
});

test("getFormDefinition encontra e retorna null para desconhecido", () => {
  assert.ok(getFormDefinition("vark-kids"));
  assert.equal(getFormDefinition("nao-existe"), null);
});

test("registro de processadores e agnostico", () => {
  const p = getFormProcessor("vark-kids");
  assert.ok(p);
  assert.equal(typeof p.score, "function");
  assert.equal(getFormProcessor("anamnesis"), null);
  assert.equal(getFormProcessor("qualquer-coisa"), null);
});

test("processador de assessment e descoberto sem conhecer o formId", () => {
  const p = getAssessmentProcessor();
  assert.ok(p);
  assert.equal(p.kind, "assessment");
  assert.ok(p.formId);
});
