interface TicketScope {
  userId?: number | null;
  queueId?: number | null;
  status?: string;
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
  ticket: TicketScope,
  accessMode: "queue" | "owner" = "queue"
): boolean => {
  if (profile === "admin") return true;
  if (ticket.userId && Number(ticket.userId) === Number(userId)) return true;
  if (accessMode === "owner") return false;
  if (ticket.queueId === null || ticket.queueId === undefined) return true;
  return userQueueIds.map(Number).includes(Number(ticket.queueId));
};

export const canUserClaimTicket = (
  profile: string,
  userId: number,
  userQueueIds: number[],
  ticket: TicketScope,
  accessMode: "queue" | "owner" = "queue"
): boolean => {
  if (accessMode !== "owner") {
    return canUserSeeTicket(profile, userId, userQueueIds, ticket, accessMode);
  }
  if (profile === "admin") return true;
  if (ticket.status !== "pending" || ticket.userId) return false;
  if (ticket.queueId === null || ticket.queueId === undefined) return true;
  return userQueueIds.map(Number).includes(Number(ticket.queueId));
};
