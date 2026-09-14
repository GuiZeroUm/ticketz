export const isSharedOpenTicketView = (profile, status, groups = false) =>
  profile === "user" && status === "open" && !groups;

export const getTicketQueueId = ticket =>
  ticket?.queue?.id ?? ticket?.queueId ?? null;

export const isTicketQueueVisible = (
  ticket,
  selectedQueueIds,
  sharedOpenView
) => {
  const queueId = getTicketQueueId(ticket);
  return (
    sharedOpenView || queueId === null || selectedQueueIds.includes(queueId)
  );
};
