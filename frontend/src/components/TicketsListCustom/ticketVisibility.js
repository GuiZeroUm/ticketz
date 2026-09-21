export const getTicketQueueId = ticket =>
  ticket?.queue?.id ?? ticket?.queueId ?? null;

// Ticket sem fila e o pool de triagem: fica visivel para todo mundo ate o
// contato ser roteado para um setor. O resto so aparece para quem esta na
// fila. Mesma regra que o backend aplica em canUserSeeTicket.
export const isTicketQueueVisible = (ticket, selectedQueueIds) => {
  const queueId = getTicketQueueId(ticket);
  return queueId === null || selectedQueueIds.includes(queueId);
};

// A regua de cobranca dispara um ticket pendente sem fila por destinatario.
// Enquanto o cliente nao responde, nao ha ninguem esperando atendimento: esses
// tickets so entram na fila de espera quando chega uma mensagem recebida.
// Espelha o EXISTS que o ListTicketsService aplica no backend.
export const isUnansweredPoolTicket = (ticket, listedTicketIds) =>
  ticket?.status === "pending" &&
  getTicketQueueId(ticket) === null &&
  !listedTicketIds.includes(ticket?.id);
