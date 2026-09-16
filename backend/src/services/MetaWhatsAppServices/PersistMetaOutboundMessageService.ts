import Ticket from "../../models/Ticket";
import CreateMessageService from "../MessageServices/CreateMessageService";

interface Request {
  wamid: string;
  body: string;
  ticket: Ticket;
  userId?: number;
  quotedMsgId?: string;
}

// Persiste uma mensagem enviada via Cloud API como Message, no mesmo
// contrato que o restante do sistema espera (ticket.lastMessage, socket.io,
// contagem de nao lidas etc.) - equivalente ao que verifyMessage faz para o
// fluxo Baileys, mas sem nenhum WAMessage/proto envolvido.
const PersistMetaOutboundMessageService = async ({
  wamid,
  body,
  ticket,
  userId,
  quotedMsgId
}: Request) => {
  await ticket.update({
    lastMessage: body.substring(0, 255).replace(/\n/g, " ")
  });

  const messageData = {
    id: wamid,
    ticketId: ticket.id,
    userId,
    contactId: undefined,
    body,
    fromMe: true,
    read: true,
    quotedMsgId,
    ack: 1,
    dataJson: JSON.stringify({ wamid, body, source: "meta-cloud-api" }),
    isEdited: false
  };

  return CreateMessageService({ messageData, companyId: ticket.companyId });
};

export default PersistMetaOutboundMessageService;
