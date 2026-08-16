import { Op } from "sequelize";
import sequelize from "../../database";
import Help from "../../models/Help";
import AppError from "../../errors/AppError";

interface ReorderItem {
  id: number;
  order: number;
}

interface Request {
  items: ReorderItem[];
}

/**
 * Define a ordem dos conteudos dentro de um card. Mesma mecanica do reorder de
 * filas: todos os ids precisam ser irmaos (mesmo groupId).
 */
const ReorderService = async ({ items }: Request): Promise<Help[]> => {
  if (!Array.isArray(items) || !items.length) {
    throw new AppError("ERR_HELP_REORDER_EMPTY", 400);
  }

  const ids = items.map(item => Number(item.id)).filter(Number.isInteger);

  if (ids.length !== items.length) {
    throw new AppError("ERR_HELP_REORDER_INVALID", 400);
  }

  const contents = await Help.findAll({
    where: { id: { [Op.in]: ids } }
  });

  if (contents.length !== ids.length) {
    throw new AppError("ERR_NO_HELP_FOUND", 404);
  }

  const groupIds = new Set(contents.map(content => content.groupId));

  if (groupIds.size > 1) {
    throw new AppError("ERR_HELP_REORDER_INVALID", 400);
  }

  const orderById = new Map(items.map(item => [Number(item.id), item.order]));

  await sequelize.transaction(async transaction => {
    // eslint-disable-next-line no-restricted-syntax
    for (const [index, content] of contents
      .slice()
      .sort((a, b) => orderById.get(a.id) - orderById.get(b.id))
      .entries()) {
      if (content.order !== index) {
        await content.update({ order: index }, { transaction });
      }
    }
  });

  return Help.findAll({
    where: { groupId: [...groupIds][0] },
    order: [
      ["order", "ASC"],
      ["id", "ASC"]
    ]
  });
};

export default ReorderService;
