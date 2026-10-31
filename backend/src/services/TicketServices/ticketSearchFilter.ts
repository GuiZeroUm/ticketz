import { Op, WhereOptions, col, fn, literal, where } from "sequelize";
import sequelize from "../../database";
import Ticket from "../../models/Ticket";

/**
 * Faz `\`, `%` e `_` valerem como texto literal dentro de um padrão LIKE.
 */
export const escapeLikePattern = (term: string): string =>
  term.replace(/[\\%_]/g, "\\$&");

/**
 * Filtro de busca textual dos tickets: nome ou número do contato, ou texto de
 * alguma mensagem do ticket. O trecho de mensagens é uma subconsulta `IN`, que
 * não multiplica linhas e usa o índice de trigramas `messages_body_lower_trgm`.
 * O `where` depende do include de `contact` (`as: "contact"`).
 */
export const buildTicketSearchFilter = (
  term: string,
  companyId: number
): WhereOptions<Ticket> => {
  const pattern = `%${escapeLikePattern(term.trim().toLocaleLowerCase())}%`;
  const messageSubquery = literal(
    `(SELECT "ticketId" FROM "Messages" WHERE "companyId" = ${sequelize.escape(
      companyId
    )} AND LOWER("body") LIKE ${sequelize.escape(pattern)})`
  );

  return {
    [Op.or]: [
      where(fn("LOWER", col("contact.name")), Op.like, pattern),
      where(col("contact.number"), Op.like, pattern),
      { id: { [Op.in]: messageSubquery } }
    ]
  };
};
