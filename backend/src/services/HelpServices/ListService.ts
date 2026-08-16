import { Sequelize } from "sequelize";
import Help from "../../models/Help";
import HelpGroup from "../../models/HelpGroup";

interface Request {
  searchParam?: string;
  groupId?: string;
}

// Sem paginacao de proposito: a grade do super admin agrupa os conteudos por
// card e o arrasto reescreve a ordem da lista inteira — uma pagina parcial
// gravaria posicoes erradas nos conteudos que ficaram de fora.
const ListService = async ({
  searchParam = "",
  groupId
}: Request): Promise<Help[]> => {
  const whereCondition: Record<string, unknown> = {};

  if (searchParam) {
    whereCondition.title = Sequelize.where(
      Sequelize.fn("LOWER", Sequelize.col("Help.title")),
      "LIKE",
      `%${searchParam.toLowerCase().trim()}%`
    );
  }

  if (groupId) {
    whereCondition.groupId = groupId;
  }

  const records = await Help.findAll({
    where: whereCondition,
    include: [
      {
        model: HelpGroup,
        as: "group",
        attributes: ["id", "title", "icon", "audience", "order"]
      }
    ],
    order: [
      [{ model: HelpGroup, as: "group" }, "audience", "ASC"],
      [{ model: HelpGroup, as: "group" }, "order", "ASC"],
      ["order", "ASC"],
      ["id", "ASC"]
    ]
  });

  return records;
};

export default ListService;
