import { createHash } from "crypto";
import { Op, UniqueConstraintError } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { checkCompanyCompliant } from "../../helpers/CheckCompanyCompliant";
import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import ContactIdentity from "../../models/ContactIdentity";
import EmailAccount from "../../models/EmailAccount";
import EmailAttachment from "../../models/EmailAttachment";
import EmailMessage from "../../models/EmailMessage";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import { websocketCreateMessage } from "../MessageServices/CreateMessageService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";
import { normalizeEmailAddress } from "./addresses";
import {
  removeStoredAttachments,
  saveInboundAttachments
} from "./EmailAttachmentStorage";
import FindOrCreateEmailContactService from "./FindOrCreateEmailContactService";
import FindOrCreateEmailTicketService from "./FindOrCreateEmailTicketService";
import { MAX_REFERENCES, SUBJECT_FALLBACK_DAYS } from "./limits";
import { normalizeSubject } from "./threading";
import { NormalizedEmail } from "./types";

export type IngestStatus = "created" | "duplicate" | "reconciled" | "ignored";

export interface IngestResult {
  status: IngestStatus;
  ticketId?: number;
  messageId?: string;
}

const EMAIL_CHANNEL = "email";
const PROVIDER_UNIQUE_INDEX = "email_messages_provider_unique";
const ID_COLUMN_MAX = 255;
const SUBJECT_MAX = 998;
const LAST_MESSAGE_MAX = 255;
const FALLBACK_CANDIDATES = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

// Message-IDs have no practical length limit, but the columns (and
// Tickets.emailThreadKey) are STRING(255). Long values are replaced by a
// stable digest, and every lookup goes through the same function, so storing
// and matching stay consistent instead of failing the whole sync on insert.
const fitColumn = (value: string): string =>
  value.length <= ID_COLUMN_MAX
    ? value
    : `sha256:${createHash("sha256").update(value).digest("hex")}`;

const fitId = (value?: string | null): string | null =>
  value ? fitColumn(value) : null;

const isProviderDuplicate = (error: unknown): boolean => {
  if (!(error instanceof UniqueConstraintError)) return false;
  const constraint = (error.parent as { constraint?: string } | undefined)
    ?.constraint;
  return (
    constraint === PROVIDER_UNIQUE_INDEX ||
    Object.keys(error.fields || {}).includes("providerMessageId")
  );
};

// Logs carry ids only: never addresses, subjects or bodies (ruling R16).
const ignored = (account: EmailAccount, reason: string): IngestResult => {
  logger.info(
    { companyId: account.companyId, emailAccountId: account.id, reason },
    "Email not imported"
  );
  return { status: "ignored" };
};

const findByProviderId = (account: EmailAccount, providerMessageId: string) =>
  EmailMessage.findOne({
    where: {
      companyId: account.companyId,
      emailAccountId: account.id,
      providerMessageId
    }
  });

const findOutboundByInternetId = (
  account: EmailAccount,
  internetMessageId: string
) =>
  EmailMessage.findOne({
    where: {
      companyId: account.companyId,
      emailAccountId: account.id,
      direction: "out",
      internetMessageId: fitColumn(internetMessageId)
    },
    order: [["id", "DESC"]]
  });

const emitMessageUpdate = (message: Message | null): void => {
  if (!message) return;
  try {
    getIO()
      .to(message.ticketId.toString())
      .emit(`company-${message.companyId}-appMessage`, {
        action: "update",
        message
      });
  } catch (err) {
    logger.warn(
      { ticketId: message.ticketId, message: err?.message },
      "Could not emit email message update"
    );
  }
};

const duplicateOf = async (
  account: EmailAccount,
  providerMessageId: string
): Promise<IngestResult> => {
  const winner = await findByProviderId(account, providerMessageId);
  return winner
    ? {
        status: "duplicate",
        ticketId: winner.ticketId,
        messageId: winner.messageId
      }
    : { status: "duplicate" };
};

// A delivery failure report never becomes a ticket. When it points to one of
// our sends, that send is marked as bounced.
const applyBounce = async (
  account: EmailAccount,
  email: NormalizedEmail
): Promise<void> => {
  if (!email.bounceOf) return;
  const original = await findOutboundByInternetId(account, email.bounceOf);
  if (!original) return;

  const message = await sequelize.transaction(async transaction => {
    await original.update(
      {
        sendStatus: "failed",
        sendError: { code: "ERR_EMAIL_BOUNCED", at: new Date().toISOString() }
      },
      { transaction }
    );
    const chatMessage = await Message.findOne({
      where: {
        id: original.messageId,
        ticketId: original.ticketId,
        companyId: account.companyId
      },
      transaction
    });
    if (chatMessage) await chatMessage.update({ ack: -1 }, { transaction });
    return chatMessage;
  });

  emitMessageUpdate(message);
};

// The copy of a message we sent (Sent folder / Gmail SENT) confirms an
// ambiguous send; it never creates a second message.
const reconcileOutbound = async (
  account: EmailAccount,
  email: NormalizedEmail
): Promise<IngestResult | null> => {
  const sent = await findOutboundByInternetId(account, email.internetMessageId);
  if (!sent) return null;

  let message: Message | null;
  try {
    message = await sequelize.transaction(async transaction => {
      const changes: Record<string, unknown> = {};
      if (!sent.providerMessageId) {
        changes.providerMessageId = email.providerMessageId;
      }
      if (!sent.providerThreadId && email.providerThreadId) {
        changes.providerThreadId = email.providerThreadId;
      }
      const confirms =
        sent.sendStatus === "unknown" || sent.sendStatus === "queued";
      if (confirms) {
        changes.sendStatus = "sent";
        changes.sendError = null;
      }
      if (Object.keys(changes).length) {
        await sent.update(changes, { transaction });
      }
      if (!confirms) return null;

      const chatMessage = await Message.findOne({
        where: {
          id: sent.messageId,
          ticketId: sent.ticketId,
          companyId: account.companyId
        },
        transaction
      });
      if (!chatMessage || chatMessage.ack >= 1) return null;
      await chatMessage.update({ ack: 1 }, { transaction });
      return chatMessage;
    });
  } catch (err) {
    if (isProviderDuplicate(err)) {
      return duplicateOf(account, email.providerMessageId);
    }
    throw err;
  }

  emitMessageUpdate(message);
  return {
    status: "reconciled",
    ticketId: sent.ticketId,
    messageId: sent.messageId
  };
};

const threadKeyOfParent = async (
  account: EmailAccount,
  email: NormalizedEmail
): Promise<string | null> => {
  const ids = Array.from(
    new Set(
      [email.inReplyTo, ...(email.references || []).slice(-MAX_REFERENCES)]
        .filter(Boolean)
        .map(fitColumn)
    )
  );
  if (!ids.length) return null;

  const parent = await EmailMessage.findOne({
    where: {
      companyId: account.companyId,
      emailAccountId: account.id,
      internetMessageId: { [Op.in]: ids }
    },
    order: [["id", "DESC"]]
  });
  if (!parent) return null;

  const ticket = await Ticket.findOne({
    where: { id: parent.ticketId, companyId: account.companyId },
    attributes: ["id", "emailThreadKey"]
  });
  return ticket?.emailThreadKey || null;
};

// Conservative fallback for clients that drop In-Reply-To/References: an open
// or pending ticket of this account, same counterpart, same normalized
// subject, active within SUBJECT_FALLBACK_DAYS.
const threadKeyBySubject = async (
  account: EmailAccount,
  email: NormalizedEmail,
  contactId: number | null
): Promise<string | null> => {
  const wanted = normalizeSubject(email.subject);
  if (!contactId || !wanted) return null;

  const candidates = await Ticket.findAll({
    where: {
      companyId: account.companyId,
      emailAccountId: account.id,
      channel: EMAIL_CHANNEL,
      contactId,
      status: { [Op.in]: ["open", "pending"] },
      updatedAt: {
        [Op.gte]: new Date(Date.now() - SUBJECT_FALLBACK_DAYS * DAY_MS)
      }
    },
    attributes: ["id", "subject", "emailThreadKey"],
    order: [["updatedAt", "DESC"]],
    limit: FALLBACK_CANDIDATES
  });

  const match = candidates.find(
    ticket =>
      ticket.emailThreadKey && normalizeSubject(ticket.subject) === wanted
  );
  return match?.emailThreadKey || null;
};

const resolveThreadKey = async (
  account: EmailAccount,
  email: NormalizedEmail,
  contactId: number | null
): Promise<string> => {
  if (email.providerThreadId) {
    return fitColumn(`g:${email.providerThreadId}`);
  }
  return (
    (await threadKeyOfParent(account, email)) ||
    (await threadKeyBySubject(account, email, contactId)) ||
    fitColumn(`m:${email.internetMessageId || email.providerMessageId}`)
  );
};

const loadMessageForEmit = (
  companyId: number,
  ticketId: number,
  messageId: string
) =>
  Message.findOne({
    where: { id: messageId, ticketId, companyId },
    include: [
      "contact",
      {
        association: "ticket",
        include: [
          { association: "contact", include: ["tags", "extraInfo"] },
          "queue",
          "tags",
          "user",
          { association: "whatsapp", attributes: ["id", "name", "apiMode"] }
        ]
      }
    ]
  });

// Same events as a new WhatsApp message (CreateMessageService) and a ticket
// update (UpdateTicketService), so the inbox and the email thread view
// refresh. Runs after the commit; a failure here is logged only, because the
// data is already stored and a retry would just be a duplicate.
const emitIngested = async (
  companyId: number,
  ticketId: number,
  messageId: string,
  reopened: boolean
): Promise<void> => {
  try {
    const message = await loadMessageForEmit(companyId, ticketId, messageId);
    if (!message?.ticket) return;
    if (await checkCompanyCompliant(companyId)) {
      await websocketCreateMessage(message);
    }
    websocketUpdateTicket(
      message.ticket,
      reopened
        ? [
            `company-${companyId}-closed`,
            `queue-${message.ticket.queueId}-closed`
          ]
        : undefined
    );
  } catch (err) {
    logger.warn(
      { companyId, ticketId, message: err?.message },
      "Could not emit ingested email"
    );
  }
};

const IngestEmailService = async (
  account: EmailAccount,
  email: NormalizedEmail
): Promise<IngestResult> => {
  if (email.accountId !== account.id) {
    throw new Error("ERR_EMAIL_ACCOUNT_MISMATCH");
  }
  const { companyId } = account;
  const emailAccountId = account.id;

  if (!email.providerMessageId) {
    return ignored(account, "missing_provider_message_id");
  }

  // 1. idempotency (the unique index below covers concurrent processes)
  const existing = await findByProviderId(account, email.providerMessageId);
  if (existing) {
    return {
      status: "duplicate",
      ticketId: existing.ticketId,
      messageId: existing.messageId
    };
  }

  // 1b. delivery failure reports
  if ((email.flags || []).includes("bounce")) {
    await applyBounce(account, email);
    return ignored(account, "bounce");
  }

  // 2. copy of one of our own sends
  if (email.direction === "out" && email.internetMessageId) {
    const reconciled = await reconcileOutbound(account, email);
    if (reconciled) return reconciled;
  }

  // 4. counterpart: sender of inbound mail, first recipient of outbound mail
  const isInbound = email.direction === "in";
  const counterpart = normalizeEmailAddress(
    isInbound ? email.from?.address : email.to?.[0]?.address
  );
  if (!counterpart) {
    return ignored(account, "no_counterpart");
  }

  let contact: Contact | null = null;
  let contactId: number | null = null;
  if (isInbound) {
    try {
      contact = await FindOrCreateEmailContactService({
        companyId,
        address: counterpart,
        name: email.from?.name,
        emailAccountId
      });
    } catch (err) {
      if (
        err instanceof AppError &&
        err.message === "ERR_EMAIL_INVALID_ADDRESS"
      ) {
        return ignored(account, "invalid_counterpart");
      }
      throw err;
    }
    contactId = contact.id;
  } else {
    // An outbound copy never creates a contact; it only joins existing threads.
    const identity = await ContactIdentity.findOne({
      where: { companyId, channel: EMAIL_CHANNEL, externalId: counterpart },
      attributes: ["contactId"]
    });
    contactId = identity?.contactId ?? null;
  }

  // 3. thread
  const threadKey = await resolveThreadKey(account, email, contactId);

  // 5-7. ticket, EmailMessage, attachments and Message in one transaction
  const messageId = uuidv4();
  const fromMe = !isInbound;
  let saved: EmailAttachment[] = [];
  let outcome: { ticketId: number; reopened: boolean } | null;

  try {
    outcome = await sequelize.transaction(async transaction => {
      const { ticket, reopened } = await FindOrCreateEmailTicketService({
        account,
        contact,
        threadKey,
        subject: email.subject,
        reopen: isInbound,
        createIfMissing: isInbound,
        incrementUnread: isInbound,
        transaction
      });
      if (!ticket) return null;

      // Inserted first: a concurrent import of the same message fails here,
      // on the unique index, before any file is written.
      const emailMessage = await EmailMessage.create(
        {
          companyId,
          emailAccountId,
          ticketId: ticket.id,
          messageId,
          direction: email.direction,
          providerMessageId: email.providerMessageId,
          providerThreadId: email.providerThreadId || null,
          internetMessageId: fitId(email.internetMessageId),
          inReplyTo: fitId(email.inReplyTo),
          references: (email.references || [])
            .slice(-MAX_REFERENCES)
            .map(fitColumn),
          subject: (email.subject || "").slice(0, SUBJECT_MAX),
          fromAddress: email.from,
          toAddresses: email.to || [],
          ccAddresses: email.cc || [],
          htmlSanitized: email.htmlSanitized || null,
          receivedAt: email.receivedAt,
          flags: email.flags || [],
          sendStatus: fromMe ? "sent" : null
        },
        { transaction }
      );

      saved = await saveInboundAttachments(
        companyId,
        emailMessage.id,
        email.attachments || [],
        { transaction }
      );

      const receivedAt =
        email.receivedAt instanceof Date &&
        !Number.isNaN(email.receivedAt.getTime())
          ? email.receivedAt
          : undefined;

      await Message.create(
        {
          id: messageId,
          ticketId: ticket.id,
          companyId,
          contactId: isInbound ? contactId : undefined,
          channel: EMAIL_CHANNEL,
          body: email.text || "",
          fromMe,
          read: fromMe,
          ack: fromMe ? 1 : 0,
          queueId: ticket.queueId ?? null,
          // valid JSON: the frontend MessagesList runs JSON.parse on it
          dataJson: JSON.stringify({
            source: EMAIL_CHANNEL,
            emailMessageId: emailMessage.id
          }),
          ...(receivedAt ? { createdAt: receivedAt } : {})
        },
        { transaction }
      );

      ticket.set({
        lastMessage: (email.subject || email.text || "").slice(
          0,
          LAST_MESSAGE_MAX
        )
      });
      // bump updatedAt even when lastMessage is unchanged (same subject)
      ticket.changed("updatedAt", true);
      await ticket.save({ transaction });

      return { ticketId: ticket.id, reopened };
    });
  } catch (err) {
    // The rows are rolled back; the files are not part of the transaction.
    await removeStoredAttachments(saved.map(a => a.storageKey));
    if (isProviderDuplicate(err)) {
      logger.info(
        { companyId, emailAccountId },
        "Email already imported by a concurrent process"
      );
      return duplicateOf(account, email.providerMessageId);
    }
    throw err;
  }

  if (!outcome) {
    return ignored(account, "outbound_without_thread");
  }

  await emitIngested(companyId, outcome.ticketId, messageId, outcome.reopened);

  return { status: "created", ticketId: outcome.ticketId, messageId };
};

export default IngestEmailService;
