import { fn, col, Op } from "sequelize";
import HelpGroup from "../../models/HelpGroup";
import Help from "../../models/Help";

export interface PublicHelpGroup {
  id: number;
  title: string;
  subtitle: string;
  icon: string;
  order: number;
  articleCount: number;
  videoCount: number;
}

/**
 * Grade de cards vista pelo cliente (/helps) e pelo parceiro.
 *
 * Traz so os grupos ativos do publico pedido, com a contagem de conteudos
 * ativos que alimenta o "8 artigos - 3 videos" do card.
 */
const FindPublicService = async (
  audience: string
): Promise<PublicHelpGroup[]> => {
  const groups = await HelpGroup.findAll({
    where: { audience, isActive: true },
    order: [
      ["order", "ASC"],
      ["id", "ASC"]
    ]
  });

  if (!groups.length) {
    return [];
  }

  const counts = (await Help.findAll({
    attributes: ["groupId", "type", [fn("COUNT", col("id")), "total"]],
    where: {
      isActive: true,
      groupId: { [Op.in]: groups.map(group => group.id) }
    },
    group: ["groupId", "type"],
    raw: true
  })) as unknown as { groupId: number; type: string; total: string }[];

  const totals = new Map<number, { article: number; video: number }>();

  counts.forEach(row => {
    const entry = totals.get(row.groupId) || { article: 0, video: 0 };

    if (row.type === "article") {
      entry.article = Number(row.total);
    } else {
      entry.video = Number(row.total);
    }

    totals.set(row.groupId, entry);
  });

  return groups.map(group => {
    const entry = totals.get(group.id) || { article: 0, video: 0 };

    return {
      id: group.id,
      title: group.title,
      subtitle: group.subtitle,
      icon: group.icon,
      order: group.order,
      articleCount: entry.article,
      videoCount: entry.video
    };
  });
};

export default FindPublicService;
