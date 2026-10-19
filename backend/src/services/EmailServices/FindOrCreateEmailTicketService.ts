import { Op, Transaction } from "sequelize";
import sequelize from "../../database";
import Contact from "../../models/Contact";
import EmailAccount from "../../models/EmailAccount";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import { incrementCounter } from "../CounterServices/IncrementCounter";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";

interface Request {
  account: EmailAccount;
  // Needed only when a ticket may be created (createIfMissing).
  contact: Contact | null;
  threadKey: string;
  subject: string;
  // Inbound mail: a closed ticket of the thread goes back to "pending".
  reopen: boolean;
  // false: only find (an outbound copy never opens a ticket); the result then
  // has ticket null when the thread has no ticket at all. Default true.
  createIfMissing?: boolean;
  // Default: same as reopen (inbound mail counts as unread).
  incrementUnread?: boolean;
  // Run inside the caller's transaction (the ingestion's, so the ticket only
  // exists if the message is committed too).
  transaction?: Transaction;
}

interface Response {
  ticket: Ticket | null;
  justCreated: boolean;
  reopened: boolean;
}

const ACTIVE_STATUSES = ["open", "pending"];
const SUBJECT_MAX = 998;

// Email tickets are unique per thread, not per contact (same rule as the
// reopen guard of UpdateTicketService): for (companyId, emailAccountId,
// emailThreadKey) there is at most one open/pending ticket. WhatsApp's
// CheckContactOpenTickets / FindOrCreateTicketService are never used here,
// because they look at the contact and the WhatsApp connection, not the thread.
const FindOrCreateEmailTicketService = async ({
  account,
  contact,
  threadKey,
  subject,
  reopen,
  createIfMissing = true,
  incrementUnread = reopen,
  transaction: externalTransaction
}: Request): Promise<Response> => {
  const { companyId } = account;
  const emailAccountId = account.id;

  const run = async (transaction: Transaction): Promise<Response> => {
    // Serializes every writer of this thread until the transaction ends, across
    // processes. The single-bigint form does not share the key space with the
    // (companyId, contactId) locks of FindOrCreateTicketService.
    await sequelize.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(:lockKey, 0))",
      {
        replacements: {
          lockKey: `email-thread:${companyId}:${emailAccountId}:${threadKey}`
        },
        transaction
      }
    );

    const threadScope = {
      companyId,
      emailAccountId,
      emailThreadKey: threadKey
    };

    const active = await Ticket.findOne({
      where: { ...threadScope, status: { [Op.in]: ACTIVE_STATUSES } },
      order: [["id", "DESC"]],
      transaction
    });

    if (active) {
      if (incrementUnread) {
        await active.increment("unreadMessages", { transaction });
        await active.reload({ transaction });
      }
      return { ticket: active, justCreated: false, reopened: false };
    }

    // No active ticket: whatever exists for the thread is closed.
    const previous = await Ticket.findOne({
      where: threadScope,
      order: [["updatedAt", "DESC"]],
      transaction
    });

    if (previous) {
      if (!reopen) {
        return { ticket: previous, justCreated: false, reopened: false };
      }
      await previous.update(
        {
          status: "pending",
          userId: null,
          queueId: previous.queueId ?? account.queueId ?? null,
          chatbot: null,
          queueOptionId: null,
          unreadMessages: incrementUnread
            ? (previous.unreadMessages || 0) + 1
            : previous.unreadMessages
        },
        { transaction }
      );
      await FindOrCreateATicketTrakingService({
        ticketId: previous.id,
        companyId,
        whatsappId: null,
        transaction
      });
      return { ticket: previous, justCreated: false, reopened: true };
    }

    if (!createIfMissing) {
      return { ticket: null, justCreated: false, reopened: false };
    }

    if (!contact) {
      throw new Error("ERR_EMAIL_TICKET_WITHOUT_CONTACT");
    }

    const ticket = await Ticket.create(
      {
        companyId,
        contactId: contact.id,
        channel: "email",
        status: "pending",
        isGroup: false,
        whatsappId: null,
        emailAccountId,
        emailThreadKey: threadKey,
        subject: (subject || "").slice(0, SUBJECT_MAX),
        queueId: account.queueId ?? null,
        unreadMessages: incrementUnread ? 1 : 0
      },
      { transaction }
    );

    await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: null,
      transaction
    });

    // Counted only once the ticket really exists. A failing counter must not
    // turn a committed ingestion into an error.
    transaction.afterCommit(async () => {
      try {
        await incrementCounter(companyId, "ticket-create");
      } catch (err) {
        logger.warn(
          { companyId, ticketId: ticket.id, message: err?.message },
          "Could not count email ticket creation"
        );
      }
    });

    return { ticket, justCreated: true, reopened: false };
  };

  return externalTransaction
    ? run(externalTransaction)
    : sequelize.transaction(run);
};

export default FindOrCreateEmailTicketService;
