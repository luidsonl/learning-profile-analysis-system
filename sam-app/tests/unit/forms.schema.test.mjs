import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFormDefinition } from "../../src/api/forms/schema.mjs";

const valid = {
  formId: "my-form",
  name: "My Form",
  audience: "student",
  result: { hasInference: false, type: "none" },
  sections: [
    { id: "s1", title: "Section 1", questions: [{ id: "x1", type: "likert", text: "Question?", options: [1, 2, 3] }] },
  ],
};

test("valid definition passes", () => {
  assert.deepEqual(validateFormDefinition(valid), []);
});

test("rejects invalid formId", () => {
  assert.ok(validateFormDefinition({ ...valid, formId: "Wrong Form!" }).length > 0);
});

test("rejects unknown audience", () => {
  assert.ok(validateFormDefinition({ ...valid, audience: "parent" }).length > 0);
});

test("rejects missing sections", () => {
  assert.ok(validateFormDefinition({ ...valid, sections: [] }).length > 0);
});

test("rejects unknown question type", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions[0].type = "emoji";
  assert.ok(validateFormDefinition(d).length > 0);
});

test("rejects question without text", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions[0].text = "";
  assert.ok(validateFormDefinition(d).length > 0);
});

test("rejects duplicate ids", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions.push({ id: "x1", type: "likert", text: "Other?", options: [1, 2] });
  const errors = validateFormDefinition(d);
  assert.ok(errors.some((e) => e.includes("duplicate question id: x1")));
});

test("rejects single/multiple without options", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions[0] = { id: "x2", type: "single", text: "Which?" };
  assert.ok(validateFormDefinition(d).length > 0);
});

test("likert requires options", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions[0] = { id: "x3", type: "likert", text: "How much?" };
  assert.ok(validateFormDefinition(d).length > 0);
});

test("accepts text/date/number without options", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions = [
    { id: "t1", type: "text", text: "Text" },
    { id: "d1", type: "date", text: "Date" },
    { id: "n1", type: "number", text: "Number" },
  ];
  assert.deepEqual(validateFormDefinition(d), []);
});

test("result is required", () => {
  const d = JSON.parse(JSON.stringify(valid));
  delete d.result;
  assert.ok(validateFormDefinition(d).some((e) => e.includes("result is required")));
});

test("result.hasInference must be a boolean", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.result = { hasInference: "yes", type: "none" };
  assert.ok(validateFormDefinition(d).some((e) => e.includes("result.hasInference")));
});

test("rejects unknown result type", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.result = { hasInference: true, type: "guessing" };
  assert.ok(validateFormDefinition(d).some((e) => e.includes("result.type")));
});

test("accepts inferred label and percentage results", () => {
  const label = JSON.parse(JSON.stringify(valid));
  label.result = { hasInference: true, type: "label" };
  assert.deepEqual(validateFormDefinition(label), []);
  const pct = JSON.parse(JSON.stringify(valid));
  pct.result = { hasInference: true, type: "percentage" };
  assert.deepEqual(validateFormDefinition(pct), []);
});
