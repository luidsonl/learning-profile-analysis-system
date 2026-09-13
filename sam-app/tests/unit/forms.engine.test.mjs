import { test } from "node:test";
import assert from "node:assert/strict";
import { getDefinitions, getFormDefinition, getFormProcessor, getAssessmentProcessor } from "../../src/api/forms/engine.mjs";
import { validateFormDefinition } from "../../src/api/forms/schema.mjs";

test("all registered definitions are valid", () => {
  const defs = getDefinitions();
  assert.ok(defs.length >= 4);
  for (const def of defs) {
    assert.deepEqual(validateFormDefinition(def), [], `form ${def.formId} invalid`);
    assert.ok(def.result, `form ${def.formId} must declare result metadata`);
    assert.equal(typeof def.result.hasInference, "boolean", `form ${def.formId} result.hasInference`);
  }
});

test("definitions are unique by formId", () => {
  const ids = getDefinitions().map((d) => d.formId);
  assert.equal(new Set(ids).size, ids.length);
});

test("getFormDefinition resolves a known form and returns null for unknown", () => {
  assert.ok(getFormDefinition("vark"));
  assert.equal(getFormDefinition("does-not-exist"), null);
});

test("processor registration is agnostic", () => {
  const p = getFormProcessor("vark");
  assert.ok(p);
  assert.equal(typeof p.score, "function");
  assert.equal(getFormProcessor("anamnesis"), null);
  assert.equal(getFormProcessor("anything"), null);
});

test("assessment processor is discovered without knowing the formId", () => {
  const p = getAssessmentProcessor();
  assert.ok(p);
  assert.equal(p.kind, "assessment");
  assert.ok(p.formId);
});
