export const isActiveTicketUniqueConflict = (error: unknown): boolean => {
  const databaseError = error as {
    parent?: { constraint?: string };
    original?: { constraint?: string };
  };
  return (
    databaseError?.parent?.constraint ===
      "tickets_one_active_individual_whatsapp" ||
    databaseError?.original?.constraint ===
      "tickets_one_active_individual_whatsapp"
  );
};
