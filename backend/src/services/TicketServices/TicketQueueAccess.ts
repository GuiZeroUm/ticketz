import { Op, literal, WhereOptions } from "sequelize";
import Ticket from "../../models/Ticket";

export const shouldApplyQueueFilter = (
  profile: string,
  queueIds: number[]
): boolean => profile !== "admin" || queueIds.length > 0;

// EXISTS correlacionado em vez de subquery materializada: a tabela de mensagens
// e a maior do banco e so interessa saber se ha pelo menos uma recebida.
export const hasInboundMessage = literal(
  `EXISTS (SELECT 1 FROM "Messages" AS "inboundMessage" WHERE "inboundMessage"."ticketId" = "Ticket"."id" AND "inboundMessage"."fromMe" = false)`
);

// Recorte de fila da listagem.
//
// Admin ve as filas escolhidas no filtro mais os atendimentos sem fila.
//
// Atendente ve as filas dele mais o pool de triagem - ticket sem fila, que na
// AC Norte e por onde todo contato novo entra, porque a conexao oficial nao tem
// fila vinculada. O pool exige uma mensagem recebida: a regua de cobranca cria
// um pendente sem fila por destinatario, e os que ninguem respondeu enchiam a
// fila de espera de todo atendente com conversas que o cliente nunca comecou.
export const ticketQueueScope = (
  profile: string,
  queueIds: number[]
): WhereOptions<Ticket> =>
  profile === "admin"
    ? { queueId: { [Op.or]: [queueIds, null] } }
    : {
        [Op.or]: [
          { queueId: { [Op.in]: queueIds } },
          { [Op.and]: [{ queueId: null }, hasInboundMessage] }
        ]
      };
