import Contact from "../../models/Contact";
import Message from "../../models/Message";
import OutOfTicketMessage from "../../models/OutOfTicketMessages";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import Whatsapp from "../../models/Whatsapp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";
import { digits } from "../SgaServices/normalize";
import sequelize from "../../database";
import { Op } from "sequelize";

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

/** Projects a successful SGA send into the customer's active conversation. */
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

  const { ticket, createdMessage } = await sequelize.transaction(
    async transaction => {
      await sequelize.query(
        "SELECT pg_advisory_xact_lock(:companyId, :contactId)",
        {
          replacements: {
            companyId: delivery.companyId,
            contactId: contact.id
          },
          transaction
        }
      );
      const priorMessage = await Message.findOne({
        where: { id: delivery.messageId, companyId: delivery.companyId },
        attributes: ["id", "ticketId"],
        transaction
      });
      if (priorMessage) {
        const priorTicket = await Ticket.findOne({
          where: {
            id: priorMessage.ticketId,
            companyId: delivery.companyId,
            contactId: contact.id,
            whatsappId: whatsapp.id
          },
          transaction
        });
        if (!priorTicket) {
          throw new Error(
            `Billing message ${delivery.messageId} has a different ticket`
          );
        }
        await TicketTag.findOrCreate({
          where: { ticketId: priorTicket.id, tagId: tag.id },
          defaults: { ticketId: priorTicket.id, tagId: tag.id },
          transaction
        });
        return { ticket: priorTicket, createdMessage: false };
      }

      let selected = await Ticket.findOne({
        where: {
          companyId: delivery.companyId,
          contactId: contact.id,
          whatsappId: whatsapp.id,
          channel: "whatsapp",
          isGroup: false,
          status: { [Op.in]: ["open", "pending"] }
        },
        order: [["id", "DESC"]],
        transaction
      });

      if (!selected) {
        const billingQueue = await Queue.findOne({
          where: { companyId: delivery.companyId, name: "BOLETOS" },
          attributes: ["id"],
          transaction
        });
        if (!billingQueue) {
          throw new Error(
            `BOLETOS queue missing for company ${delivery.companyId}`
          );
        }
        selected = await Ticket.create(
          {
            companyId: delivery.companyId,
            contactId: contact.id,
            whatsappId: whatsapp.id,
            status: "pending",
            channel: "whatsapp",
            isGroup: false,
            userId: null,
            queueId: billingQueue.id,
            chatbot: false,
            queueOptionId: null,
            unreadMessages: 0,
            lastMessage:
              delivery.body?.replace(/\s+/g, " ").slice(0, 255) ||
              "Cobrança enviada"
          },
          { transaction }
        );
        await FindOrCreateATicketTrakingService({
          ticketId: selected.id,
          companyId: delivery.companyId,
          whatsappId: whatsapp.id,
          transaction
        });
      }

      await TicketTag.findOrCreate({
        where: { ticketId: selected.id, tagId: tag.id },
        defaults: { ticketId: selected.id, tagId: tag.id },
        transaction
      });
      const [message, created] = await Message.findOrCreate({
        where: { id: delivery.messageId, companyId: delivery.companyId },
        defaults: {
          id: delivery.messageId,
          ticketId: selected.id,
          contactId: contact.id,
          remoteJid: `${digits(contact.number)}@s.whatsapp.net`,
          body,
          fromMe: true,
          read: true,
          ack: 3,
          mediaType: filename ? "document" : null,
          dataJson: JSON.stringify(dataJson),
          channel: "whatsapp",
          companyId: delivery.companyId
        },
        transaction
      });
      if (message.ticketId !== selected.id) {
        throw new Error(
          `Billing message ${delivery.messageId} changed ticket during projection`
        );
      }
      return { ticket: selected, createdMessage: created };
    }
  );

  if (!createdMessage) return;

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
  await websocketUpdateTicket(ticket);
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
