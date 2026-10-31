import { Filterable, Includeable } from "sequelize";
import Ticket from "../../models/Ticket";

interface Request {
  where: Filterable["where"];
  include: Includeable[];
  filterInclude: Includeable[];
  limit?: number;
  offset?: number;
}

/**
 * Pagina por ticket, não por linha do JOIN: a primeira consulta devolve só os
 * ids da página (com os includes que o `where` precisa) e a segunda carrega
 * os tickets com todas as relações, sem limite.
 */
const loadTicketPage = async ({
  where,
  include,
  filterInclude,
  limit,
  offset
}: Request): Promise<Ticket[]> => {
  const idRows = await Ticket.findAll({
    attributes: ["id"],
    where,
    include: filterInclude,
    limit,
    offset,
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"]
    ],
    subQuery: false
  });

  // Um filterInclude que multiplica linhas (hasMany) repete o mesmo id.
  const ids = [...new Set(idRows.map(row => row.id))];

  if (ids.length === 0) {
    return [];
  }

  const tickets = await Ticket.findAll({
    where: { id: ids },
    include
  });

  const position = new Map(ids.map((id, index) => [id, index]));
  return [...tickets].sort(
    (a, b) => (position.get(a.id) as number) - (position.get(b.id) as number)
  );
};

export default loadTicketPage;
