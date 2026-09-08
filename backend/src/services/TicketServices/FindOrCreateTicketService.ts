import { subMinutes } from "date-fns";
import { Op } from "sequelize";
import { Mutex } from "async-mutex";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import sequelize from "../../database";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import { incrementCounter } from "../CounterServices/IncrementCounter";

const createTicketMutex = new Mutex();

type FindOrCreateTicketOptions = {
  groupContact?: Contact;
  incrementUnread?: boolean;
  doNotReopen?: boolean;
  findOnly?: boolean;
  queue?: Queue;
};

const internalFindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  companyId: number,
  {
    groupContact,
    incrementUnread,
    doNotReopen,
    findOnly,
    queue
  }: FindOrCreateTicketOptions = {}
): Promise<{ ticket: Ticket; justCreated: boolean }> => {
  let justCreated = false;
  const isGroupConversation =
    !!groupContact && groupContact.groupMode !== "ticket";
  const result = await sequelize.transaction(async () => {
    let ticket = await Ticket.findOne({
      where: {
        status: {
          [Op.or]: ["open", "pending"]
        },
        contactId: groupContact ? groupContact.id : contact.id,
        whatsappId,
        companyId
      },
      order: [["id", "DESC"]]
    });

    if (ticket && incrementUnread && !isGroupConversation) {
      await ticket.increment("unreadMessages");
      ticket = await ticket.reload();
    }

    if (!ticket && groupContact) {
      ticket = await Ticket.findOne({
        where: {
          contactId: groupContact.id,
          whatsappId,
          companyId
        },
        order: [["updatedAt", "DESC"]]
      });

      if (ticket) {
        await ticket.update({
          status: isGroupConversation ? "open" : "pending",
          userId: null,
          queueId: isGroupConversation ? null : ticket.queueId,
          unreadMessages: isGroupConversation
            ? 0
            : incrementUnread
              ? ticket.unreadMessages + 1
              : ticket.unreadMessages,
          companyId
        });
        if (!isGroupConversation) {
          await FindOrCreateATicketTrakingService({
            ticketId: ticket.id,
            companyId,
            whatsappId: ticket.whatsappId,
            userId: ticket.userId
          });
        }
      }
    }

    if (!doNotReopen && !ticket && !groupContact) {
      const reopenTimeout = parseInt(
        await GetCompanySetting(companyId, "autoReopenTimeout", "0"),
        10
      );
      ticket =
        reopenTimeout &&
        (await Ticket.findOne({
          where: {
            updatedAt: {
              [Op.between]: [
                +subMinutes(new Date(), reopenTimeout),
                +new Date()
              ]
            },
            contactId: contact.id,
            whatsappId,
            companyId
          },
          order: [["updatedAt", "DESC"]]
        }));

      if (ticket) {
        await ticket.update({
          status: "pending",
          userId: null,
          unreadMessages: incrementUnread
            ? ticket.unreadMessages + 1
            : ticket.unreadMessages,
          companyId
        });
        await FindOrCreateATicketTrakingService({
          ticketId: ticket.id,
          companyId,
          whatsappId: ticket.whatsappId,
          userId: ticket.userId
        });
      }
    }

    let queueId = queue?.id || null;

    if (groupContact && !isGroupConversation) {
      const whatsapp = await Whatsapp.findByPk(whatsappId, {
        include: ["queues"]
      });

      if (whatsapp?.queues.length === 1) {
        queueId = whatsapp.queues[0].id;
      }
    }

    if (findOnly && !ticket) {
      return { ticket: null, justCreated: false };
    }

    if (!ticket) {
      ticket = await Ticket.create({
        contactId: groupContact ? groupContact.id : contact.id,
        status: isGroupConversation ? "open" : "pending",
        isGroup: !!groupContact,
        unreadMessages: isGroupConversation || !incrementUnread ? 0 : 1,
        whatsappId,
        queueId: isGroupConversation ? null : queueId,
        companyId
      });

      justCreated = true;

      if (!isGroupConversation) {
        await FindOrCreateATicketTrakingService({
          ticketId: ticket.id,
          companyId,
          whatsappId,
          userId: ticket.userId
        });
      }
    }

    ticket = await ShowTicketService(ticket.id, companyId);

    return { ticket, justCreated };
  });

  if (result.justCreated && !isGroupConversation) {
    await incrementCounter(companyId, "ticket-create");
  }

  return result;
};

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  companyId: number,
  options: FindOrCreateTicketOptions = {}
): Promise<{ ticket: Ticket; justCreated: boolean }> => {
  const release = await createTicketMutex.acquire();

  try {
    return await internalFindOrCreateTicketService(
      contact,
      whatsappId,
      companyId,
      options
    );
  } finally {
    release();
  }
};

export default FindOrCreateTicketService;
