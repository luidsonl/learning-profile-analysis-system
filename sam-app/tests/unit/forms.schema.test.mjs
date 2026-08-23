import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFormDefinition } from "../../src/api/forms/schema.mjs";

const valid = {
  formId: "minha-form",
  name: "Minha Form",
  audience: "student",
  sections: [
    { id: "s1", title: "Seção 1", questions: [{ id: "x1", type: "likert", text: "Pergunta?", options: [1, 2, 3] }] },
  ],
};

test("definicao valida passa", () => {
  assert.deepEqual(validateFormDefinition(valid), []);
});

test("rejeita formId invalido", () => {
  assert.ok(validateFormDefinition({ ...valid, formId: "Form Errada!" }).length > 0);
});

test("rejeita audience desconhecida", () => {
  assert.ok(validateFormDefinition({ ...valid, audience: "pai" }).length > 0);
});

test("rejeita sem secoes", () => {
  assert.ok(validateFormDefinition({ ...valid, sections: [] }).length > 0);
});

test("rejeita tipo de pergunta desconhecido", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions[0].type = "emoji";
  assert.ok(validateFormDefinition(d).length > 0);
});

test("rejeita pergunta sem texto", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions[0].text = "";
  assert.ok(validateFormDefinition(d).length > 0);
});

test("rejeita ids duplicados", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions.push({ id: "x1", type: "likert", text: "Outra?", options: [1, 2] });
  const errors = validateFormDefinition(d);
  assert.ok(errors.some((e) => e.includes("duplicate question id: x1")));
});

test("rejeita single/multiple sem options", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions[0] = { id: "x2", type: "single", text: "Qual?" };
  assert.ok(validateFormDefinition(d).length > 0);
});

test("likert exige options", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions[0] = { id: "x3", type: "likert", text: "Quanto?" };
  assert.ok(validateFormDefinition(d).length > 0);
});

test("aceita text/date/number sem options", () => {
  const d = JSON.parse(JSON.stringify(valid));
  d.sections[0].questions = [
    { id: "t1", type: "text", text: "Texto" },
    { id: "d1", type: "date", text: "Data" },
    { id: "n1", type: "number", text: "Número" },
  ];
  assert.deepEqual(validateFormDefinition(d), []);
});
