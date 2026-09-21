const ticketQueueId = ticket => ticket?.queue?.id ?? ticket?.queueId ?? null;

const ticketUserId = ticket => ticket?.user?.id ?? ticket?.userId ?? null;

// Espelha canUserSeeTicket do backend. Ticket sem fila e o pool de triagem e
// fica aberto para qualquer atendente ate o contato ser roteado para um setor.
export const canSeeTicket = (user, ticket) => {
  if (!user) return false;
  if (user.profile === "admin") return true;
  if (ticketUserId(ticket) && ticketUserId(ticket) === user.id) return true;

  const queueId = ticketQueueId(ticket);
  if (queueId === null) return true;

  return (user.queues || []).some(queue => queue.id === queueId);
};

// Transferir, resolver e devolver a fila mexem no atendimento. O backend so
// deixa quem e dono (ou admin) mexer em ticket que ja foi aceito, entao a UI
// nao pode oferecer o botao para os demais - era assim que o atendente
// esbarrava em "Você não tem permissão para acessar este recurso".
export const canActOnTicket = (user, ticket) => {
  if (!user) return false;
  if (user.profile === "admin") return true;
  if (ticket?.status === "pending") return canSeeTicket(user, ticket);
  return ticketUserId(ticket) === user.id;
};
