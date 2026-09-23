import { GetCompanySetting } from "../../helpers/CheckSettings";

export type TicketAccessMode = "queue" | "owner";

export const getTicketAccessMode = async (
  companyId: number
): Promise<TicketAccessMode> => {
  const value = await GetCompanySetting(companyId, "ticketAccessMode", "queue");
  return value === "owner" ? "owner" : "queue";
};

export const usesOwnerTicketAccess = async (
  companyId: number
): Promise<boolean> => (await getTicketAccessMode(companyId)) === "owner";
