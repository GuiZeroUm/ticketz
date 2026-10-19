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
import { EmailAddress, NormalizedEmail } from "./types";

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

const SAME_MESSAGE_CANDIDATES = 5;

// The same inbound message already imported under another provider id: an
// IMAP folder read again after a UIDVALIDITY change gives every message a new
// UID, and a message can be delivered twice. Matched by Message-ID AND sender
// within the same account, never by Message-ID alone, so a forged Message-ID
// cannot hide another sender's mail. Mail without a Message-ID cannot be
// recognised and may be imported twice (accepted).
const findSameInbound = async (
  account: EmailAccount,
  email: NormalizedEmail
): Promise<EmailMessage | null> => {
  const sender = normalizeEmailAddress(email.from?.address);
  if (!email.internetMessageId || !sender) return null;
  const candidates = await EmailMessage.findAll({
    where: {
      companyId: account.companyId,
      emailAccountId: account.id,
      direction: "in",
      internetMessageId: fitColumn(email.internetMessageId)
    },
    order: [["id", "ASC"]],
    limit: SAME_MESSAGE_CANDIDATES
  });
  return (
    candidates.find(
      row => normalizeEmailAddress(row.fromAddress?.address) === sender
    ) || null
  );
};

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

  // Already reconciled under another provider id (e.g. the Sent folder read
  // again after a UIDVALIDITY change) and nothing left to confirm.
  if (
    sent.providerMessageId &&
    sent.sendStatus !== "unknown" &&
    sent.sendStatus !== "queued" &&
    (sent.providerThreadId || !email.providerThreadId)
  ) {
    return {
      status: "duplicate",
      ticketId: sent.ticketId,
      messageId: sent.messageId
    };
  }

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

const PARENT_CANDIDATES = 20;

const addressesOf = (
  ...lists: (EmailAddress | EmailAddress[] | null | undefined)[]
): Set<string> =>
  new Set(
    lists
      .flatMap(list => (Array.isArray(list) ? list : list ? [list] : []))
      .map(entry => normalizeEmailAddress(entry?.address))
      .filter(Boolean)
  );

// A known Message-ID is not a credential: anyone who saw it (a forwarded
// mail, a leaked header) could reply with it. The parent's thread is joined
// only when the counterpart already takes part in it: it is the parent
// ticket's contact (identity or e-mail), or it appears in the parent
// message's from/to/cc. Otherwise the mail goes on to the subject fallback
// (which also requires the same contact) or to a new thread.
const isThreadParticipant = async (
  account: EmailAccount,
  parent: EmailMessage,
  ticket: Ticket,
  counterpart: string,
  contactId: number | null
): Promise<boolean> => {
  if (contactId && ticket.contactId === contactId) return true;
  // The mailbox's own address is on every message of the thread; a mail
  // claiming to come from it proves nothing.
  if (counterpart === normalizeEmailAddress(account.address)) return false;
  if (
    addressesOf(parent.fromAddress, parent.toAddresses, parent.ccAddresses).has(
      counterpart
    )
  ) {
    return true;
  }
  const contact = await Contact.findOne({
    where: { id: ticket.contactId, companyId: account.companyId },
    attributes: ["id", "email"]
  });
  return (
    !!contact?.email && normalizeEmailAddress(contact.email) === counterpart
  );
};

const threadKeyOfParent = async (
  account: EmailAccount,
  email: NormalizedEmail,
  counterpart: string,
  contactId: number | null
): Promise<string | null> => {
  const ids = Array.from(
    new Set(
      [email.inReplyTo, ...(email.references || []).slice(-MAX_REFERENCES)]
        .filter(Boolean)
        .map(fitColumn)
    )
  );
  if (!ids.length) return null;

  const parents = await EmailMessage.findAll({
    where: {
      companyId: account.companyId,
      emailAccountId: account.id,
      internetMessageId: { [Op.in]: ids }
    },
    order: [["id", "DESC"]],
    limit: PARENT_CANDIDATES
  });

  // eslint-disable-next-line no-restricted-syntax
  for (const parent of parents) {
    const ticket = await Ticket.findOne({
      where: { id: parent.ticketId, companyId: account.companyId },
      attributes: ["id", "contactId", "emailThreadKey"]
    });
    if (
      ticket?.emailThreadKey &&
      (await isThreadParticipant(
        account,
        parent,
        ticket,
        counterpart,
        contactId
      ))
    ) {
      return ticket.emailThreadKey;
    }
  }
  return null;
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
  counterpart: string,
  contactId: number | null
): Promise<string> => {
  if (email.providerThreadId) {
    return fitColumn(`g:${email.providerThreadId}`);
  }
  return (
    (await threadKeyOfParent(account, email, counterpart, contactId)) ||
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
// Like CreateMessageService, a non-compliant company gets no websocket events
// at all for a new message (neither the message nor the ticket update); the
// data is stored and shows up once the company is compliant again.
const emitIngested = async (
  companyId: number,
  ticketId: number,
  messageId: string,
  reopenedFromQueueId: number | null | undefined
): Promise<void> => {
  try {
    if (!(await checkCompanyCompliant(companyId))) return;
    const message = await loadMessageForEmit(companyId, ticketId, messageId);
    if (!message?.ticket) return;
    await websocketCreateMessage(message);
    websocketUpdateTicket(
      message.ticket,
      reopenedFromQueueId !== undefined
        ? [`company-${companyId}-closed`, `queue-${reopenedFromQueueId}-closed`]
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

  // 1c. same inbound message under another provider id (see findSameInbound)
  if (email.direction === "in") {
    const same = await findSameInbound(account, email);
    if (same) {
      logger.info(
        { companyId, emailAccountId, emailMessageId: same.id },
        "Email already imported under another provider id"
      );
      return {
        status: "duplicate",
        ticketId: same.ticketId,
        messageId: same.messageId
      };
    }
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
  const threadKey = await resolveThreadKey(
    account,
    email,
    counterpart,
    contactId
  );

  // 5-7. ticket, EmailMessage, attachments and Message in one transaction
  const messageId = uuidv4();
  const fromMe = !isInbound;
  let saved: EmailAttachment[] = [];
  let outcome: {
    ticketId: number;
    // set only when a closed ticket was reopened (queue before reopening)
    reopenedFromQueueId?: number | null;
  } | null;

  try {
    outcome = await sequelize.transaction(async transaction => {
      const { ticket, reopened, previousQueueId } =
        await FindOrCreateEmailTicketService({
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
          replyToAddresses: email.replyTo || [],
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

      // e.g. "oversize": the provider message was too big to import whole;
      // the inbox renders a hint from dataJson
      const flags = email.flags || [];

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
            emailMessageId: emailMessage.id,
            flags,
            ...(flags.includes("oversize") ? { oversize: true } : {})
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

      return reopened
        ? { ticketId: ticket.id, reopenedFromQueueId: previousQueueId ?? null }
        : { ticketId: ticket.id };
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

  await emitIngested(
    companyId,
    outcome.ticketId,
    messageId,
    outcome.reopenedFromQueueId
  );

  return { status: "created", ticketId: outcome.ticketId, messageId };
};

export default IngestEmailService;
