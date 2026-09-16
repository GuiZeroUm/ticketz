import Whatsapp from "../../models/Whatsapp";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketServiceMeta from "../TicketServices/FindOrCreateTicketServiceMeta";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";

interface MetaContact {
  profile?: { name?: string };
  wa_id: string;
}

interface MetaTextMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

// Recebe uma mensagem entrante do payload do webhook Cloud API. Fase 1
// trata so texto - tipos de midia (image/audio/document/video) sao logados
// e ignorados por enquanto (ver Fase 2 do plano).
const HandleMetaInboundMessageService = async (
  whatsapp: Whatsapp,
  metaContact: MetaContact | undefined,
  message: MetaTextMessage
): Promise<void> => {
  if (message.type !== "text") {
    logger.info(
      { whatsappId: whatsapp.id, type: message.type },
      "Ignoring non-text Meta inbound message (media not supported yet)"
    );
    return;
  }

  const contact = await CreateOrUpdateContactService({
    name: metaContact?.profile?.name || message.from,
    number: message.from,
    companyId: whatsapp.companyId,
    channel: "whatsapp"
  });

  const ticket = await FindOrCreateTicketServiceMeta(
    contact,
    whatsapp.id,
    1,
    whatsapp.companyId,
    "whatsapp"
  );

  const body = message.text?.body || "";

  const messageData = {
    id: message.id,
    ticketId: ticket.id,
    contactId: contact.id,
    body,
    fromMe: false,
    read: false,
    ack: 2,
    dataJson: JSON.stringify({ wamid: message.id, source: "meta-cloud-api" })
  };

  await CreateMessageService({ messageData, companyId: whatsapp.companyId });

  await ticket.update({
    lastMessage: body.substring(0, 255).replace(/\n/g, " "),
    ...(ticket.status === "closed" ? { status: "pending" } : {})
  });
};

export default HandleMetaInboundMessageService;
