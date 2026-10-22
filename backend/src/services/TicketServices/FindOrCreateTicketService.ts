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
import User from "../../models/User";
import { isActiveTicketUniqueConflict } from "./ActiveTicketConflict";
import { incrementCounter } from "../CounterServices/IncrementCounter";

const createTicketMutex = new Mutex();

type FindOrCreateTicketOptions = {
  groupContact?: Contact;
  incrementUnread?: boolean;
  doNotReopen?: boolean;
  findOnly?: boolean;
  queue?: Queue;
};

export const getConnectionScope = (
  groupContact: Contact | undefined,
  whatsappId: number
): { whatsappId?: number } => (groupContact ? {} : { whatsappId });

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
  let shouldCreateTracking = false;
  const isGroupConversation =
    !!groupContact && groupContact.groupMode !== "ticket";
  const result = await sequelize.transaction(async transaction => {
    // Serialize every creation/reopen for a contact across runtime processes.
    await sequelize.query(
      "SELECT pg_advisory_xact_lock(:companyId, :contactId)",
      {
        replacements: { companyId, contactId: groupContact?.id || contact.id },
        transaction
      }
    );

    let ticket = await Ticket.findOne({
      where: {
        status: {
          [Op.or]: ["open", "pending"]
        },
        contactId: groupContact ? groupContact.id : contact.id,
        ...getConnectionScope(groupContact, whatsappId),
        channel: "whatsapp",
        companyId
      },
      order: [["id", "DESC"]],
      transaction
    });

    if (ticket && groupContact && ticket.whatsappId !== whatsappId) {
      // Reply through the connection that most recently received the group.
      await ticket.update({ whatsappId }, { transaction });
    }

    if (ticket && incrementUnread && !isGroupConversation) {
      await ticket.increment("unreadMessages", { transaction });
      ticket = await ticket.reload({ transaction });
    }

    if (!ticket && groupContact) {
      ticket = await Ticket.findOne({
        where: {
          contactId: groupContact.id,
          companyId
        },
        order: [["updatedAt", "DESC"]],
        transaction
      });

      if (ticket) {
        await ticket.update(
          {
            status: isGroupConversation ? "open" : "pending",
            userId: null,
            queueId: isGroupConversation ? null : ticket.queueId,
            unreadMessages: isGroupConversation
              ? 0
              : incrementUnread
                ? ticket.unreadMessages + 1
                : ticket.unreadMessages,
            whatsappId,
            companyId
          },
          { transaction }
        );
        if (!isGroupConversation) {
          shouldCreateTracking = true;
        }
      }
    }

    if (!doNotReopen && !ticket && !groupContact) {
      const configuredTimeout = parseInt(
        await GetCompanySetting(companyId, "autoReopenTimeout", "0"),
        10
      );
      const reopenTimeout = Math.max(
        1440,
        Number.isFinite(configuredTimeout) ? configuredTimeout : 1440
      );
      ticket = await Ticket.findOne({
        where: {
          status: "closed",
          channel: "whatsapp",
          isGroup: false,
          closedAt: { [Op.gte]: subMinutes(new Date(), reopenTimeout) },
          contactId: contact.id,
          whatsappId,
          companyId
        },
        order: [
          ["closedAt", "DESC"],
          ["id", "DESC"]
        ],
        transaction
      });

      if (ticket) {
        const previousUser = ticket.userId
          ? await User.findOne({
              where: { id: ticket.userId, companyId },
              include: [{ model: Queue, as: "queues", attributes: ["id"] }],
              transaction
            })
          : null;
        const keepPreviousUser =
          !!previousUser &&
          !!ticket.queueId &&
          previousUser.queues?.some(item => item.id === ticket.queueId);
        await ticket.update(
          {
            status: keepPreviousUser ? "open" : "pending",
            userId: keepPreviousUser ? previousUser.id : null,
            chatbot: false,
            queueOptionId: null,
            unreadMessages: incrementUnread
              ? ticket.unreadMessages + 1
              : ticket.unreadMessages,
            companyId
          },
          { transaction }
        );
        shouldCreateTracking = true;
      }
    }

    let queueId = queue?.id || null;

    if (groupContact && !isGroupConversation) {
      const whatsapp = await Whatsapp.findByPk(whatsappId, {
        include: ["queues"],
        transaction
      });

      if (whatsapp?.queues.length === 1) {
        queueId = whatsapp.queues[0].id;
      }
    }

    if (findOnly && !ticket) {
      return { ticket: null, justCreated: false };
    }

    if (!ticket) {
      ticket = await Ticket.create(
        {
          contactId: groupContact ? groupContact.id : contact.id,
          status: isGroupConversation ? "open" : "pending",
          isGroup: !!groupContact,
          unreadMessages: isGroupConversation || !incrementUnread ? 0 : 1,
          whatsappId,
          queueId: isGroupConversation ? null : queueId,
          companyId
        },
        { transaction }
      );

      justCreated = true;

      if (!isGroupConversation) {
        shouldCreateTracking = true;
      }
    }

    return { ticket, justCreated };
  });

  if (shouldCreateTracking && result.ticket) {
    await FindOrCreateATicketTrakingService({
      ticketId: result.ticket.id,
      companyId,
      whatsappId: result.ticket.whatsappId,
      userId: result.ticket.userId
    });
  }

  if (result.ticket) {
    result.ticket = await ShowTicketService(result.ticket.id, companyId);
  }

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
    try {
      return await internalFindOrCreateTicketService(
        contact,
        whatsappId,
        companyId,
        options
      );
    } catch (error) {
      if (!isActiveTicketUniqueConflict(error)) throw error;
      // A writer that did not take the advisory lock may have won the race.
      // Read its committed ticket instead of exposing a database error.
      return internalFindOrCreateTicketService(
        contact,
        whatsappId,
        companyId,
        options
      );
    }
  } finally {
    release();
  }
};

export default FindOrCreateTicketService;
