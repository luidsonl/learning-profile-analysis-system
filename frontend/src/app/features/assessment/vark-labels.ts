// Artifact → pt-BR presentation for the VARK pipeline. Letters follow the ML
// serving mapping pinned in AGENTS.md: {A→R, V→A, K→K}; R/A/K are the only
// labels the deterministic assessment and the model produce.
export const VARK_LABELS: Record<string, string> = {
  R: 'Leitura e escrita',
  A: 'Auditivo',
  K: 'Cinestésico',
  multimodal: 'Multimodal',
};

export const VARK_DESCRIPTIONS: Record<string, string> = {
  R: 'Aprende melhor lendo, escrevendo e organizando informações em texto.',
  A: 'Aprende melhor ouvindo, discutindo e usando o som para memorizar.',
  K: 'Aprende melhor com a prática, movimento e experiências concretas.',
  multimodal: 'Combina diferentes estilos de aprendizado.',
};

export function varkDescription(label: string): string {
  return VARK_DESCRIPTIONS[label] ?? '';
}