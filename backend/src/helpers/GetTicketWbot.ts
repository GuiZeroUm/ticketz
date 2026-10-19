import { getWbot, Session } from "../libs/wbot";
import GetDefaultWhatsApp from "./GetDefaultWhatsApp";
import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";

const GetTicketWbot = async (ticket: Ticket): Promise<Session> => {
  // An email ticket has no WhatsApp connection (whatsappId NULL) and must
  // never get the default one assigned by a WhatsApp-only path.
  if (ticket.channel === "email") {
    throw new AppError("ERR_INVALID_CHANNEL", 400);
  }

  if (!ticket.whatsappId) {
    const defaultWhatsapp = await GetDefaultWhatsApp(ticket.companyId);

    await ticket.$set("whatsapp", defaultWhatsapp);
  }

  const wbot = getWbot(ticket.whatsappId);

  return wbot;
};

export default GetTicketWbot;
