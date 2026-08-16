import { FORM_DEFINITIONS } from "./definitions/index.mjs";
import { PROCESSOR_REGISTRY } from "./processors/index.mjs";
import { validateFormDefinition } from "./schema.mjs";

const definitions = new Map(FORM_DEFINITIONS.map((d) => [d.formId, d]));
const processors = new Map(PROCESSOR_REGISTRY.map((p) => [p.formId, p]));

export const getDefinitions = () => [...definitions.values()];

export const getFormDefinition = (formId) => definitions.get(formId) || null;

export const getFormProcessor = (formId) => processors.get(formId) || null;

export const getAssessmentProcessor = () =>
  [...processors.values()].find((p) => p.kind === "assessment") || null;

export { validateFormDefinition };
