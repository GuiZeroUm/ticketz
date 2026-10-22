import { GetCompanySetting } from "../../helpers/CheckSettings";

interface TicketScope {
  userId?: number | null;
  queueId?: number | null;
}

export const getHistoryAccessMode = async (
  companyId: number
): Promise<"queue" | "owner"> =>
  (await GetCompanySetting(companyId, "ticketAccessMode", "queue")) === "owner"
    ? "owner"
    : "queue";

export const canReadTicket = (
  profile: string,
  userId: number,
  queueIds: number[],
  ticket: TicketScope,
  mode: "queue" | "owner"
): boolean => {
  if (profile === "admin") return true;
  if (ticket.userId && Number(ticket.userId) === userId) return true;
  if (mode === "owner") return false;
  if (ticket.queueId == null) return true;
  return queueIds.includes(Number(ticket.queueId));
};
