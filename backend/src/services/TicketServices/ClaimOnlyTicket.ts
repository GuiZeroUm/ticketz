import Ticket from "../../models/Ticket";

// Pendentes sem responsavel fazem parte apenas do pool de aceite. Nao envie o
// contato nem campos derivados das mensagens antes de existir um responsavel.
export const serializeClaimOnlyTicket = (ticket: Ticket) => ({
  id: ticket.id,
  status: ticket.status,
  queueId: ticket.queueId,
  queue: ticket.queue
    ? {
        id: ticket.queue.id,
        name: ticket.queue.name,
        color: ticket.queue.color
      }
    : null,
  isGroup: ticket.isGroup,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
  claimOnly: true
});
