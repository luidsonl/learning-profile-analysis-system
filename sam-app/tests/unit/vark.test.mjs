import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreVark } from "../../src/api/forms/processors/vark.mjs";

const def = {
  sections: [
    {
      questions: [
        { id: "q1", group: "r", type: "likert", text: "" },
        { id: "q2", group: "a", type: "likert", text: "" },
        { id: "q3", group: "k", type: "likert", text: "" },
      ],
    },
  ],
};

test("leitura dominante -> label R", () => {
  const r = scoreVark(def, { q1: 5, q2: 1, q3: 1 });
  assert.equal(r.label, "R");
  assert.equal(r.scores.R, 5);
  assert.equal(r.scores.A, 1);
  assert.equal(r.scores.K, 1);
  assert.equal(r.multimodal, false);
});

test("aural dominante -> label A", () => {
  const r = scoreVark(def, { q1: 1, q2: 5, q3: 1 });
  assert.equal(r.label, "A");
});

test("cinestesico dominante -> label K", () => {
  const r = scoreVark(def, { q1: 1, q2: 1, q3: 5 });
  assert.equal(r.label, "K");
});

test("empate total -> multimodal", () => {
  const r = scoreVark(def, { q1: 5, q2: 5, q3: 5 });
  assert.equal(r.label, "multimodal");
  assert.equal(r.multimodal, true);
});

test("diferenca pequena -> multimodal", () => {
  const r = scoreVark(def, { q1: 5, q2: 4, q3: 1 });
  assert.equal(r.label, "multimodal");
});

test("respostas vazias -> label null", () => {
  const r = scoreVark(def, {});
  assert.equal(r.label, null);
  assert.equal(r.multimodal, false);
  assert.deepEqual(r.scores, { R: 0, A: 0, K: 0 });
});

test("respostas parciais usam media por dimensao", () => {
  const def2 = {
    sections: [{ questions: [{ id: "q1", group: "r" }, { id: "q2", group: "r" }] }],
  };
  const r = scoreVark(def2, { q1: 5, q2: 3 });
  assert.equal(r.scores.R, 4);
});

test("grupo desconhecido ignorado", () => {
  const def2 = { sections: [{ questions: [{ id: "q1", group: "x" }] }] };
  const r = scoreVark(def2, { q1: 5 });
  assert.equal(r.scores.R, 0);
  assert.equal(r.label, null);
});
