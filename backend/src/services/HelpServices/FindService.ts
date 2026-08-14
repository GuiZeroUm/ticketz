import Help from "../../models/Help";

// Consumido pela tela de ajuda do tenant: tutoriais de parceiro nao aparecem
// aqui. A listagem do super admin (ListService) continua mostrando tudo.
const FindService = async (): Promise<Help[]> => {
  const notes: Help[] = await Help.findAll({
    where: { audience: "company" },
    order: [["title", "ASC"]]
  });

  return notes;
};

export default FindService;
