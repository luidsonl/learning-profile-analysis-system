const GROUP_LABELS = { r: "R", a: "A", k: "K" };
const DIMENSIONS = ["R", "A", "K"];

export const scoreVark = (definition, answers) => {
  const raw = { R: 0, A: 0, K: 0 };
  const counts = { R: 0, A: 0, K: 0 };

  for (const section of definition.sections || []) {
    for (const q of section.questions || []) {
      const v = answers?.[q.id];
      if (v === undefined || v === null) continue;
      const label = GROUP_LABELS[String(q.group || "").toLowerCase()];
      if (!label) continue;
      raw[label] += Number(v);
      counts[label] += 1;
    }
  }

  const scores = {};
  for (const d of DIMENSIONS) scores[d] = counts[d] ? Math.round((raw[d] / counts[d]) * 10) / 10 : 0;

  const answered = DIMENSIONS.some((d) => counts[d] > 0);
  if (!answered) {
    return { scores, label: null, method: "flemming", multimodal: false };
  }

  const entries = DIMENSIONS.map((d) => [d, scores[d]]).sort((a, b) => b[1] - a[1]);
  const [top, second] = entries;
  const multimodal = top[1] > 0 && top[1] - second[1] <= 2;

  return { scores, label: multimodal ? "multimodal" : top[0], method: "flemming", multimodal };
};

export const varkProcessor = {
  formId: "vark-kids",
  name: "vark",
  kind: "assessment",
  score: scoreVark,
};
