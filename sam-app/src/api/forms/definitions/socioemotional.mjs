const likert = (id, group, text) => ({ id, type: "likert", group, text, options: [1, 2, 3, 4, 5] });

export const socioemotionalDefinition = {
  formId: "socioemotional",
  version: 1,
  name: "Socioemocional",
  audience: "educator",
  description: "Avaliação socioemocional observada pelo educador.",
  scale: "1–5 (raramente ... quase sempre)",
  result: { hasInference: false, type: "none" },
  sections: [
    {
      id: "socioemotional",
      title: "Observações socioemocionais",
      questions: [
        likert("s01", "se", "Interage bem com os colegas."),
        likert("s02", "se", "Expressa emoções de forma adequada."),
        likert("s03", "se", "Persiste em tarefas desafiadoras."),
        likert("s04", "se", "Pede ajuda quando precisa."),
        likert("s05", "se", "Participa das atividades em grupo."),
        likert("s06", "se", "Demonstra frustração diante de erros."),
      ],
    },
  ],
};
