const ticketQueueId = ticket => ticket?.queue?.id ?? ticket?.queueId ?? null;

const ticketUserId = ticket => ticket?.user?.id ?? ticket?.userId ?? null;

const ticketCompanySlug = (user, ticket) =>
  String(
    ticket?.company?.slug || ticket?.companySlug || user?.company?.slug || ""
  )
    .trim()
    .toLowerCase();

export const usesOwnerOnlyTicketAccess = (user, ticket) =>
  ticketCompanySlug(user, ticket) === "acnorte" ||
  user?.company?.settings?.ticketAccessMode === "owner";

export const canClaimTicket = (user, ticket) => {
  if (!user || ticket?.status !== "pending" || ticketUserId(ticket)) {
    return false;
  }
  if (user.profile === "admin") return true;

  const queueId = ticketQueueId(ticket);
  return (
    queueId === null ||
    (user.queues || []).some(queue => Number(queue.id) === Number(queueId))
  );
};

// Espelha canUserSeeTicket do backend. No modo padrao, a fila compartilha o
// ticket; no modo owner, somente o responsavel acessa o conteudo.
export const canSeeTicket = (user, ticket) => {
  if (!user) return false;
  if (user.profile === "admin") return true;
  if (
    ticketUserId(ticket) &&
    Number(ticketUserId(ticket)) === Number(user.id)
  ) {
    return true;
  }

  // Na AC Norte, o pool pendente e apenas uma fila de triagem. O conteudo do
  // atendimento passa a ser visivel somente depois do aceite atomico.
  if (usesOwnerOnlyTicketAccess(user, ticket)) return false;

  const queueId = ticketQueueId(ticket);
  if (queueId === null) return true;

  return (user.queues || []).some(queue => queue.id === queueId);
};

export const canListTicket = (user, ticket) =>
  canSeeTicket(user, ticket) ||
  (usesOwnerOnlyTicketAccess(user, ticket) && canClaimTicket(user, ticket));

export const isClaimOnlyTicket = (user, ticket) =>
  (user?.profile !== "admin" && !!ticket?.claimOnly) ||
  (usesOwnerOnlyTicketAccess(user, ticket) &&
    canClaimTicket(user, ticket) &&
    !canSeeTicket(user, ticket));

// Transferir, resolver e devolver a fila mexem no atendimento. O backend so
// deixa quem e dono (ou admin) mexer em ticket que ja foi aceito, entao a UI
// nao pode oferecer o botao para os demais - era assim que o atendente
// esbarrava em "Você não tem permissão para acessar este recurso".
export const canActOnTicket = (user, ticket) => {
  if (!user) return false;
  if (user.profile === "admin") return true;
  if (usesOwnerOnlyTicketAccess(user, ticket)) {
    return Number(ticketUserId(ticket)) === Number(user.id);
  }
  if (ticket?.status === "pending") return canSeeTicket(user, ticket);
  return Number(ticketUserId(ticket)) === Number(user.id);
};

export const canPreviewTicket = (user, ticket) => canSeeTicket(user, ticket);
