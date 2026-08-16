import * as Yup from "yup";
import AppError from "../../errors/AppError";
import HelpGroup from "../../models/HelpGroup";

interface Data {
  title: string;
  subtitle?: string;
  icon?: string;
  audience?: string;
  isActive?: boolean;
}

const CreateService = async (data: Data): Promise<HelpGroup> => {
  const schema = Yup.object().shape({
    title: Yup.string()
      .min(3, "ERR_HELP_GROUP_INVALID_TITLE")
      .required("ERR_HELP_GROUP_INVALID_TITLE"),
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

  const audience = data.audience || "company";

  // Entra no fim da lista do proprio publico.
  const maxOrder = (await HelpGroup.max("order", {
    where: { audience }
  })) as number | null;

  const record = await HelpGroup.create({
    ...data,
    audience,
    order: Number.isInteger(maxOrder) ? maxOrder + 1 : 0
  } as HelpGroup);

  return record;
};

export default CreateService;
