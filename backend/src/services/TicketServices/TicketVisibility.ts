interface TicketScope {
  userId?: number | null;
  queueId?: number | null;
}

// Regra unica de quem enxerga um atendimento. Vale tanto para a listagem
// quanto para abrir, aceitar e transferir - antes o bloqueio existia so no
// frontend e o backend aceitava qualquer ticket da empresa.
//
// Ticket sem fila e o pool de triagem: enquanto o contato nao foi roteado para
// um setor, qualquer atendente precisa poder pegar.
export const canUserSeeTicket = (
  profile: string,
  userId: number,
  userQueueIds: number[],
  ticket: TicketScope
): boolean => {
  if (profile === "admin") return true;
  if (ticket.userId && Number(ticket.userId) === Number(userId)) return true;
  if (ticket.queueId === null || ticket.queueId === undefined) return true;
  return userQueueIds.map(Number).includes(Number(ticket.queueId));
};
