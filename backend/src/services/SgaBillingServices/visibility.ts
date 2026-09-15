import Contact from "../../models/Contact";
import Message from "../../models/Message";
import OutOfTicketMessage from "../../models/OutOfTicketMessages";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import Whatsapp from "../../models/Whatsapp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";
import { digits } from "../SgaServices/normalize";

export type BillingDelivery = {
  id: string;
  companyId: number;
  contactId: number | null;
  whatsappId: number | null;
  messageId: string | null;
  body: string | null;
  stage: number;
  status: string;
};

const stageLabel = (stage: number): string => {
  if (stage < 0) {
    return `${Math.abs(stage)} ${Math.abs(stage) === 1 ? "dia" : "dias"} antes`;
  }
  if (stage === 0) return "no vencimento";
  return `${stage} ${stage === 1 ? "dia" : "dias"} depois`;
};

/** Stable, searchable labels used by the AC Norte billing filter. */
export const billingTagName = (stage: number): string =>
  `Cobrança · ${stageLabel(stage)}`;

const parsePayload = (raw: string | null, messageId: string, body: string) => {
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // A malformed out-of-ticket payload should not prevent visibility. The
      // text/document card below is still enough to identify the send.
    }
  }

  return {
    key: { id: messageId },
    message: { conversation: body }
  };
};

/**
 * Projects a successful SGA send into the normal Ticketz conversation model.
 * It never reuses a customer's active ticket: billing sends get their own
 * pending ticket and a stage-specific tag, so they are visible in Aguardando
 * and can be filtered without changing assignment or queue state.
 */
export const syncBillingDeliveryVisibility = async (
  delivery: BillingDelivery
): Promise<void> => {
  if (
    delivery.status !== "SENT" ||
    !delivery.messageId ||
    !delivery.contactId ||
    !delivery.whatsappId
  )
    return;

  const existingMessage = await Message.findOne({
    where: {
      id: delivery.messageId,
      companyId: delivery.companyId
    },
    attributes: ["id"]
  });
  if (existingMessage) return;

  const contact = await Contact.findOne({
    where: {
      id: delivery.contactId,
      companyId: delivery.companyId,
      isGroup: false
    }
  });
  const whatsapp = await Whatsapp.findOne({
    where: { id: delivery.whatsappId, companyId: delivery.companyId },
    attributes: ["id"]
  });
  if (!contact || !whatsapp) return;

  const [tag] = await Tag.findOrCreate({
    where: {
      companyId: delivery.companyId,
      name: billingTagName(delivery.stage)
    },
    defaults: {
      companyId: delivery.companyId,
      name: billingTagName(delivery.stage),
      color: "#f97316",
      kanban: 0
    }
  });

  let ticket = await Ticket.findOne({
    where: {
      companyId: delivery.companyId,
      contactId: contact.id,
      whatsappId: whatsapp.id,
      status: "pending"
    },
    include: [
      {
        model: Tag,
        as: "tags",
        where: { id: tag.id },
        required: true,
        attributes: ["id", "name", "color"]
      }
    ],
    order: [["id", "DESC"]]
  });

  if (!ticket) {
    ticket = await Ticket.create({
      companyId: delivery.companyId,
      contactId: contact.id,
      whatsappId: whatsapp.id,
      status: "pending",
      channel: "whatsapp",
      isGroup: false,
      userId: null,
      queueId: null,
      unreadMessages: 0,
      lastMessage:
        delivery.body?.replace(/\s+/g, " ").slice(0, 255) || "Cobrança enviada"
    });
    await TicketTag.create({ ticketId: ticket.id, tagId: tag.id });
    await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId: delivery.companyId,
      whatsappId: whatsapp.id
    });
  } else {
    await ticket.update({
      status: "pending",
      userId: null,
      queueId: null,
      unreadMessages: 0,
      lastMessage:
        delivery.body?.replace(/\s+/g, " ").slice(0, 255) || "Cobrança enviada"
    });
  }

  const outOfTicket = await OutOfTicketMessage.findByPk(delivery.messageId, {
    attributes: ["dataJson"]
  });
  const body = delivery.body || "Cobrança enviada";
  const dataJson = parsePayload(
    outOfTicket?.dataJson || null,
    delivery.messageId,
    body
  );
  const document =
    dataJson?.message?.documentMessage ||
    dataJson?.message?.documentWithCaptionMessage?.message?.documentMessage;
  const filename =
    document?.fileName || (delivery.stage <= 0 ? "boleto-ac-norte.pdf" : "");

  await ticket.update({
    lastMessage: filename
      ? `📎 ${filename}`
      : body.replace(/\s+/g, " ").slice(0, 255)
  });

  await CreateMessageService({
    messageData: {
      id: delivery.messageId,
      ticketId: ticket.id,
      contactId: contact.id,
      remoteJid: `${digits(contact.number)}@s.whatsapp.net`,
      body,
      fromMe: true,
      read: true,
      ack: 3,
      mediaType: filename ? "document" : null,
      dataJson: JSON.stringify(dataJson),
      channel: "whatsapp"
    },
    companyId: delivery.companyId
  });

  await ticket.reload({
    include: ["contact", "queue", "whatsapp", "user", "tags"]
  });
  websocketUpdateTicket(ticket);
};

export const syncSentBillingVisibility = async (
  deliveries: BillingDelivery[]
): Promise<void> => {
  await deliveries.reduce(async (previous, delivery) => {
    await previous;
    try {
      await syncBillingDeliveryVisibility(delivery);
    } catch (error) {
      // Projection is deliberately best-effort: the WhatsApp send is already
      // committed and the next reconciliation cycle will retry this row.
      console.error(
        "Unable to project SGA billing delivery",
        delivery.id,
        error
      );
    }
  }, Promise.resolve());
};
