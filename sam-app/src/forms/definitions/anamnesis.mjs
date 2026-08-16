export const anamnesisDefinition = {
  formId: "anamnesis",
  name: "Anamnese",
  audience: "guardian",
  description: "Entrevista inicial de anamnese preenchida pelo responsável.",
  sections: [
    {
      id: "development",
      title: "Desenvolvimento e saúde",
      questions: [
        { id: "a01", type: "date", text: "Data de nascimento da criança." },
        { id: "a02", type: "single", text: "Como foi o desenvolvimento da fala?", options: ["dentro do esperado", "atrasado", "avançado", "não sei"] },
        { id: "a03", type: "single", text: "A criança tem acompanhamento médico ou terapêutico?", options: ["sim", "não"] },
        { id: "a04", type: "text", text: "Se sim, descreva quais acompanhamentos." },
        { id: "a05", type: "single", text: "Existe diagnóstico relacionado a altas habilidades ou necessidades específicas?", options: ["sim", "em avaliação", "não"] },
        { id: "a06", type: "text", text: "Se sim ou em avaliação, descreva." },
      ],
    },
    {
      id: "school",
      title: "Histórico escolar",
      questions: [
        { id: "a07", type: "text", text: "Como foi a adaptação à escola?" },
        { id: "a08", type: "multiple", text: "Quais áreas chamam mais atenção da criança?", options: ["leitura", "matemática", "artes", "música", "esportes", "ciências", "outras"] },
        { id: "a09", type: "text", text: "A criança demonstra algum interesse ou habilidade especial? Descreva." },
        { id: "a10", type: "text", text: "Há alguma dificuldade que você tenha observado? Descreva." },
      ],
    },
  ],
};
