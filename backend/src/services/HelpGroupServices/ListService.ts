import HelpGroup from "../../models/HelpGroup";

/**
 * Grade do super admin: devolve todos os publicos.
 *
 * A listagem antiga de conteudos filtrava audience = "company", o que fazia um
 * tutorial de parceiro sumir da tela logo apos ser criado.
 */
const ListService = async (): Promise<HelpGroup[]> => {
  const records: HelpGroup[] = await HelpGroup.findAll({
    order: [
      ["audience", "ASC"],
      ["order", "ASC"],
      ["id", "ASC"]
    ]
  });

  return records;
};

export default ListService;
