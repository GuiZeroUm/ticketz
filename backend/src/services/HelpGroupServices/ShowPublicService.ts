import HelpGroup from "../../models/HelpGroup";
import Help from "../../models/Help";
import AppError from "../../errors/AppError";

interface Request {
  groupId: string | number;
  audience: string;
}

export interface PublicHelpGroupDetail {
  id: number;
  title: string;
  subtitle: string;
  icon: string;
  videos: Help[];
  articles: Help[];
}

/**
 * Conteudo de um card para o cliente ou para o parceiro.
 *
 * Um grupo de outro publico responde 404: e a fronteira que impede um cliente
 * de ler material de parceiro chutando o id na URL.
 */
const ShowPublicService = async ({
  groupId,
  audience
}: Request): Promise<PublicHelpGroupDetail> => {
  const group = await HelpGroup.findByPk(groupId);

  if (!group || !group.isActive || group.audience !== audience) {
    throw new AppError("ERR_NO_HELP_GROUP_FOUND", 404);
  }

  const contents = await Help.findAll({
    where: { groupId: group.id, isActive: true },
    order: [
      ["order", "ASC"],
      ["id", "ASC"]
    ]
  });

  return {
    id: group.id,
    title: group.title,
    subtitle: group.subtitle,
    icon: group.icon,
    videos: contents.filter(content => content.type !== "article"),
    articles: contents.filter(content => content.type === "article")
  };
};

export default ShowPublicService;
