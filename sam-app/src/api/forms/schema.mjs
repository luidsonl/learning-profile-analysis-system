export const QUESTION_TYPES = ["likert", "single", "multiple", "text", "date", "number"];
export const AUDIENCES = ["guardian", "educator", "student"];
export const RESULT_TYPES = ["none", "label", "percentage"];

export const validateFormDefinition = (def) => {
  const errors = [];
  if (!def || typeof def !== "object") return ["definition must be an object"];
  if (typeof def.formId !== "string" || !/^[a-z0-9-]+$/.test(def.formId)) {
    errors.push("formId must be a lowercase slug (a-z, 0-9, hyphens)");
  }
  if (typeof def.name !== "string" || !def.name.trim()) errors.push("name is required");
  if (!AUDIENCES.includes(def.audience)) errors.push(`audience must be one of ${AUDIENCES.join(", ")}`);
  if (!def.result || typeof def.result !== "object") {
    errors.push("result is required: { hasInference: boolean, type: one of RESULT_TYPES }");
  } else {
    if (typeof def.result.hasInference !== "boolean") errors.push("result.hasInference must be a boolean");
    if (!RESULT_TYPES.includes(def.result.type)) {
      errors.push(`result.type must be one of ${RESULT_TYPES.join(", ")}`);
    }
  }
  if (!Array.isArray(def.sections) || def.sections.length === 0) errors.push("at least one section is required");

  const seen = new Set();
  for (const section of def.sections || []) {
    if (!section || typeof section !== "object") {
      errors.push("section must be an object");
      continue;
    }
    if (!section.title) errors.push("section title is required");
    if (!Array.isArray(section.questions) || section.questions.length === 0) {
      errors.push(`section ${section.title || "?"} must have at least one question`);
    }
    for (const q of section.questions || []) {
      if (!q || typeof q !== "object") {
        errors.push("question must be an object");
        continue;
      }
      if (typeof q.id !== "string" || !q.id.trim()) errors.push("question id is required");
      if (seen.has(q.id)) errors.push(`duplicate question id: ${q.id}`);
      seen.add(q.id);
      if (!QUESTION_TYPES.includes(q.type)) errors.push(`question ${q.id || "?"}: invalid type "${q.type}"`);
      if (!q.text || !String(q.text).trim()) errors.push(`question ${q.id || "?"}: text is required`);
      if (["single", "multiple"].includes(q.type) && (!Array.isArray(q.options) || q.options.length === 0)) {
        errors.push(`question ${q.id}: options are required for type ${q.type}`);
      }
      if (q.type === "likert" && (!Array.isArray(q.options) || q.options.length === 0)) {
        errors.push(`question ${q.id}: options are required for type likert`);
      }
    }
  }
  return errors;
};
