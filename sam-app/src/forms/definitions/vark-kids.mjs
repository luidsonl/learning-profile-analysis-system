const likert = (id, group, text) => ({ id, type: "likert", group, text, options: [1, 2, 3, 4, 5] });

export const varkKidsDefinition = {
  formId: "vark-kids",
  version: 1,
  name: "VARK Kids",
  audience: "student",
  description: "Questionário VARK adaptado para crianças — como você prefere aprender?",
  scale: "1–5 (concordo nada ... concordo totalmente)",
  sections: [
    {
      id: "reading",
      title: "Ler e escrever",
      group: "r",
      questions: [
        likert("q01", "r", "Eu gosto de ler para aprender coisas novas."),
        likert("q02", "r", "Eu aprendo melhor quando escrevo o que estudei."),
        likert("q03", "r", "Eu gosto quando a professora escreve a matéria no quadro."),
        likert("q04", "r", "Eu gosto de ler as explicações em vez de ouvir."),
        likert("q05", "r", "Eu lembro melhor de uma história quando a leio sozinho."),
      ],
    },
    {
      id: "aural",
      title: "Ouvir",
      group: "a",
      questions: [
        likert("q06", "a", "Eu gosto de aprender ouvindo a professora falar."),
        likert("q07", "a", "Eu lembro melhor quando contam uma história para mim."),
        likert("q08", "a", "Eu gosto de explicar as coisas falando."),
        likert("q09", "a", "Eu aprendo melhor quando alguém me explica em voz alta."),
        likert("q10", "a", "Eu gosto de estudar ouvindo música ou áudio."),
      ],
    },
    {
      id: "kinesthetic",
      title: "Mãos na massa",
      group: "k",
      questions: [
        likert("q11", "k", "Eu aprendo melhor quando faço com as mãos."),
        likert("q12", "k", "Eu gosto de aprender brincando e mexendo nas coisas."),
        likert("q13", "k", "Eu lembro melhor quando eu mesmo experimento."),
        likert("q14", "k", "Eu gosto de fazer atividades em que eu me movimento."),
        likert("q15", "k", "Eu aprendo melhor quando construo ou crio alguma coisa."),
      ],
    },
  ],
};
