export const unassignedTicketRoom = (
  companyId: number,
  status: string
): string => `company-${companyId}-unassigned-${status}`;
