import * as Yup from "yup";
import AppError from "../../errors/AppError";
import HelpGroup from "../../models/HelpGroup";

interface Data {
  id: number;
  title?: string;
  subtitle?: string;
  icon?: string;
  audience?: string;
  isActive?: boolean;
}

const UpdateService = async (data: Data): Promise<HelpGroup> => {
  const { id } = data;

  const record = await HelpGroup.findByPk(id);

  if (!record) {
    throw new AppError("ERR_NO_HELP_GROUP_FOUND", 404);
  }

  const schema = Yup.object().shape({
    title: Yup.string().min(3, "ERR_HELP_GROUP_INVALID_TITLE"),
    audience: Yup.string().oneOf(
      ["company", "partner"],
      "ERR_HELP_GROUP_INVALID_AUDIENCE"
    )
  });

  try {
    await schema.validate({ title: data.title, audience: data.audience });
  } catch (err) {
    throw new AppError(err.message);
  }

  // Mudar de publico move o card para o fim da lista do publico de destino,
  // senao ele herdaria uma posicao ja ocupada la.
  const movedAudience =
    data.audience && data.audience !== record.audience ? data.audience : null;

  if (movedAudience) {
    const maxOrder = (await HelpGroup.max("order", {
      where: { audience: movedAudience }
    })) as number | null;

    await record.update({
      ...data,
      order: Number.isInteger(maxOrder) ? maxOrder + 1 : 0
    });

    return record;
  }

  await record.update(data);

  return record;
};

export default UpdateService;
