const likert = (id, group, text) => ({ id, type: "likert", group, text, options: [1, 2, 3, 4, 5] });

export const varkDefinition = {
  formId: "vark",
  version: 1,
  name: "VARK",
  audience: "student",
  description: "Questionário VARK — como você prefere aprender?",
  scale: "1–5 (discordo totalmente ... concordo totalmente)",
  sections: [
    {
      id: "reading",
      title: "Leitura e escrita",
      group: "r",
      questions: [
        likert("q01", "r", "Eu aprendo melhor quando leio o que o professor escreve no quadro."),
        likert("q02", "r", "Quando eu leio as instruções, eu me lembro delas melhor."),
        likert("q03", "r", "Eu compreendo melhor as coisas quando leio as instruções por conta própria."),
        likert("q04", "r", "Eu aprendo melhor lendo do que ouvindo alguém explicar."),
        likert("q05", "r", "Eu aprendo mais lendo o material do que ouvindo aulas expositivas."),
      ],
    },
    {
      id: "aural",
      title: "Auditivo",
      group: "a",
      questions: [
        likert("q06", "a", "Quando o professor me diz as instruções em voz alta, eu entendo melhor."),
        likert("q07", "a", "Quando alguém me explica como fazer algo, eu aprendo melhor."),
        likert("q08", "a", "Eu lembro melhor do que ouvi na aula do que do que li."),
        likert("q09", "a", "Eu aprendo melhor nas aulas em que o professor explica oralmente."),
        likert("q10", "a", "Eu aprendo melhor quando escuto alguém explicando o conteúdo."),
      ],
    },
    {
      id: "kinesthetic",
      title: "Cinestésico",
      group: "k",
      questions: [
        likert("q11", "k", "Eu prefiro aprender fazendo atividades práticas."),
        likert("q12", "k", "Quando eu faço as coisas na prática, eu aprendo melhor."),
        likert("q13", "k", "Eu gosto de aprender por meio de experimentos."),
        likert("q14", "k", "Eu compreendo melhor quando participo de simulações ou dramatizações."),
        likert("q15", "k", "Eu aprendo melhor vivenciando situações práticas, como jogos e dinâmicas."),
      ],
    },
  ],
};
