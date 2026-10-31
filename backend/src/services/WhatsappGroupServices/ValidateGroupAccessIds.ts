import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";

const validateGroupAccessIds = async (
  value: unknown,
  companyId: number
): Promise<number[] | null> => {
  if (value === null) return null;
  if (
    !Array.isArray(value) ||
    value.length > 10000 ||
    value.some(id => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw new AppError("ERR_INVALID_GROUP_ACCESS", 400);
  }
  const ids = [...new Set(value as number[])];
  if (!ids.length) return [];
  const count = await Contact.count({
    where: {
      id: { [Op.in]: ids },
      companyId,
      isGroup: true,
      groupMode: "conversation"
    }
  });
  if (count !== ids.length) throw new AppError("ERR_INVALID_GROUP_ACCESS", 400);
  return ids;
};

export default validateGroupAccessIds;
