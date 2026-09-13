const likert = (id, group, text) => ({ id, type: "likert", group, text, options: [1, 2, 3, 4, 5] });

export const behaviorChecklistDefinition = {
  formId: "behavior-checklist",
  version: 1,
  name: "Checklist de comportamento",
  audience: "educator",
  description: "Checklist comportamental observado em sala de aula.",
  scale: "1–5 (raramente ... quase sempre)",
  result: { hasInference: false, type: "none" },
  sections: [
    {
      id: "behavior",
      title: "Comportamentos observados",
      questions: [
        likert("b01", "be", "Faz perguntas além do conteúdo trabalhado."),
        likert("b02", "be", "Concentra-se por longos períodos em temas de interesse."),
        likert("b03", "be", "Demonstra curiosidade intensa por temas variados."),
        likert("b04", "be", "Apresenta facilidade para conectar ideias."),
        likert("b05", "be", "Necessita de apoio extra para organizar tarefas."),
        likert("b06", "be", "Sensível a estímulos sensoriais (luz, som, texturas)."),
        likert("b07", "be", "Adapta-se a mudanças na rotina com facilidade."),
      ],
    },
  ],
};
