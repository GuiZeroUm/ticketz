import fs from "fs";
import { UniqueConstraintError } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { checkCompanyCompliant } from "../../helpers/CheckCompanyCompliant";
import EmailAccount from "../../models/EmailAccount";
import EmailAttachment from "../../models/EmailAttachment";
import EmailMessage from "../../models/EmailMessage";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { enqueueEmailSend } from "../../queues/email";
import { logger } from "../../utils/logger";
import { websocketCreateMessage } from "../MessageServices/CreateMessageService";
import { _t } from "../TranslationServices/i18nService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";
import { normalizeEmailAddress, parseAddressList } from "./addresses";
import { assertEmailEnabled } from "./EmailAccessService";
import {
  OutboundAttachmentSource,
  removeStoredAttachments,
  saveOutboundAttachments,
  storedAttachmentPath
} from "./EmailAttachmentStorage";
import { MAX_OUTBOUND_ATTACHMENTS_BYTES, MAX_RECIPIENTS } from "./limits";
import { recordSendOutcome, TRANSIENT } from "./ProcessEmailSendJob";
import renderEmailHtml from "./renderEmailHtml";
import { buildReferences, replySubject } from "./threading";
import { EmailAddress } from "./types";

export type EmailSendMode = "reply" | "replyAll" | "forward";

export interface SendEmailRequest {
  ticket: Ticket;
  userId: number;
  mode: EmailSendMode;
  to?: string;
  cc?: string;
  subject?: string;
  body: string;
  files?: Express.Multer.File[];
  idempotencyKey: string;
}

const EMAIL_CHANNEL = "email";
const MODES: EmailSendMode[] = ["reply", "replyAll", "forward"];
const IDEMPOTENCY_INDEX = "email_messages_idempotency_unique";
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const SUBJECT_MAX = 998;
const LAST_MESSAGE_MAX = 255;
// Prefix of the digest IngestEmailService stores for over-long Message-IDs:
// not a real id, so it never goes into In-Reply-To/References.
const DIGEST_PREFIX = "sha256:";

const badRequest = (code: string) => new AppError(code, 400);
const accountUnavailable = () =>
  new AppError("ERR_EMAIL_ACCOUNT_UNAVAILABLE", 409);
const idempotencyConflict = () =>
  new AppError("ERR_EMAIL_IDEMPOTENCY_CONFLICT", 409);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const plainToHtml = (text: string): string =>
  text.trim()
    ? `<p>${escapeHtml(text.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>\n")}</p>`
    : "";

const isRealMessageId = (value?: string | null): value is string =>
  !!value && !value.startsWith(DIGEST_PREFIX);

const cleanName = (name?: string): string | undefined => {
  const cleaned = (name || "").replace(/[\r\n\t]+/g, " ").trim();
  return cleaned || undefined;
};

// A stored address (parsed from a received email) is reused only when it
// still validates; the name is kept for display.
const usable = (entry?: EmailAddress | null): EmailAddress | null => {
  const address = normalizeEmailAddress(entry?.address);
  if (!address) return null;
  const name = cleanName(entry?.name);
  return name ? { address, name } : { address };
};

const formatAddress = (entry?: EmailAddress | null): string => {
  if (!entry?.address) return "";
  return entry.name ? `${entry.name} <${entry.address}>` : entry.address;
};

// Recipients typed by the user. Absent/blank → null (use the defaults).
const parseTyped = (raw?: string): EmailAddress[] | null => {
  if (raw === undefined || !raw.trim()) return null;
  const { valid, invalid } = parseAddressList(raw);
  if (invalid.length || !valid.length) {
    throw badRequest("ERR_EMAIL_INVALID_RECIPIENT");
  }
  return valid.map(entry => usable(entry) as EmailAddress);
};

const withoutAddresses = (
  list: EmailAddress[],
  excluded: Set<string>
): EmailAddress[] => {
  const seen = new Set(excluded);
  return list.filter(entry => {
    if (seen.has(entry.address)) return false;
    seen.add(entry.address);
    return true;
  });
};

// Defaults mirror the composer (frontend defaultRecipients): reply goes to the
// sender of the last inbound email (Reply-To is not stored); reply all adds
// its To/Cc, without the account's own address and without repetitions.
const defaultRecipients = (
  mode: EmailSendMode,
  last: EmailMessage | null,
  ownAddress: string | null
): { to: EmailAddress[]; cc: EmailAddress[] } => {
  if (mode === "forward" || !last) return { to: [], cc: [] };
  const sender = usable(last.fromAddress);
  const to = sender && sender.address !== ownAddress ? [sender] : [];
  if (mode !== "replyAll") return { to, cc: [] };
  const excluded = new Set(to.map(entry => entry.address));
  if (ownAddress) excluded.add(ownAddress);
  const others = [...(last.toAddresses || []), ...(last.ccAddresses || [])]
    .map(usable)
    .filter(Boolean);
  return { to, cc: withoutAddresses(others, excluded) };
};

const resolveRecipients = (
  mode: EmailSendMode,
  rawTo: string | undefined,
  rawCc: string | undefined,
  last: EmailMessage | null,
  ownAddress: string | null
): { to: EmailAddress[]; cc: EmailAddress[] } => {
  const typedTo = parseTyped(rawTo);
  const typedCc = parseTyped(rawCc);
  if (!typedTo && mode === "forward") {
    throw badRequest("ERR_EMAIL_RECIPIENT_REQUIRED");
  }
  const defaults = typedTo
    ? { to: [], cc: [] }
    : defaultRecipients(mode, last, ownAddress);
  const to = typedTo || defaults.to;
  if (!to.length) throw badRequest("ERR_EMAIL_RECIPIENT_REQUIRED");
  const cc = withoutAddresses(
    typedCc || defaults.cc,
    new Set(to.map(entry => entry.address))
  );
  if (to.length + cc.length > MAX_RECIPIENTS) {
    throw badRequest("ERR_EMAIL_TOO_MANY_RECIPIENTS");
  }
  return { to, cc };
};

const findLastInbound = (ticket: Ticket) =>
  EmailMessage.findOne({
    where: {
      companyId: ticket.companyId,
      ticketId: ticket.id,
      direction: "in"
    },
    order: [
      ["receivedAt", "DESC NULLS LAST"],
      ["id", "DESC"]
    ]
  });

// Header and quoted original appended to a forward, labels in the ticket's
// language (AGENTS.md: text sent to a channel is translated on the backend).
const forwardedPart = async (
  ticket: Ticket,
  original: EmailMessage
): Promise<{ text: string; html: string }> => {
  const originalMessage = await Message.findOne({
    where: {
      id: original.messageId,
      ticketId: ticket.id,
      companyId: ticket.companyId
    },
    attributes: ["id", "body"]
  });
  const originalText = originalMessage?.body || "";
  const date =
    original.receivedAt instanceof Date &&
    !Number.isNaN(original.receivedAt.getTime())
      ? original.receivedAt.toUTCString()
      : "";
  const join = (list?: EmailAddress[] | null) =>
    (list || []).map(formatAddress).filter(Boolean).join(", ");
  const cc = join(original.ccAddresses);
  const header = [
    `---------- ${_t("Forwarded message", ticket)} ---------`,
    `${_t("Forwarded message From", ticket)} ${formatAddress(original.fromAddress)}`,
    date ? `${_t("Forwarded message Date", ticket)} ${date}` : null,
    `${_t("Forwarded message Subject", ticket)} ${original.subject || ""}`,
    `${_t("Forwarded message To", ticket)} ${join(original.toAddresses)}`,
    cc ? `${_t("Forwarded message Cc", ticket)} ${cc}` : null
  ].filter(line => line !== null);

  return {
    text: `${header.join("\n")}\n\n${originalText}`,
    html: `<div>${header.map(escapeHtml).join("<br>\n")}</div><br>\n${
      original.htmlSanitized || plainToHtml(originalText)
    }`
  };
};

const forwardedAttachments = async (
  ticket: Ticket,
  original: EmailMessage
): Promise<(OutboundAttachmentSource & { size: number })[]> => {
  const stored = await EmailAttachment.findAll({
    where: { companyId: ticket.companyId, emailMessageId: original.id },
    order: [["id", "ASC"]]
  });
  const sources = await Promise.all(
    stored
      .filter(attachment => attachment.storageKey && !attachment.skippedReason)
      .map(async attachment => {
        const sourcePath = storedAttachmentPath(
          ticket.companyId,
          attachment.storageKey
        );
        const readable =
          !!sourcePath &&
          (await fs.promises.access(sourcePath, fs.constants.R_OK).then(
            () => true,
            () => false
          ));
        if (!readable) {
          logger.warn(
            { companyId: ticket.companyId, emailAttachmentId: attachment.id },
            "Forwarded attachment file is missing; skipped"
          );
          return null;
        }
        return {
          filename: attachment.filename,
          contentType: attachment.contentType,
          sourcePath,
          size: attachment.size || 0
        };
      })
  );
  return sources.filter(Boolean);
};

// Uploads land in the public folder (multer); they are copied to private
// storage and must not stay there, whatever the outcome.
const removeUploads = async (files: Express.Multer.File[]): Promise<void> => {
  await Promise.all(
    files.map(file =>
      file?.path
        ? fs.promises.rm(file.path, { force: true }).catch(() => undefined)
        : undefined
    )
  );
};

const isIdempotencyDuplicate = (error: unknown): boolean => {
  if (!(error instanceof UniqueConstraintError)) return false;
  const constraint = (error.parent as { constraint?: string } | undefined)
    ?.constraint;
  return (
    constraint === IDEMPOTENCY_INDEX ||
    Object.keys(error.fields || {}).includes("idempotencyKey")
  );
};

// The message already created for this key, on this ticket only.
const replayOf = async (
  ticket: Ticket,
  idempotencyKey: string
): Promise<Message | null> => {
  const existing = await EmailMessage.findOne({
    where: { companyId: ticket.companyId, idempotencyKey }
  });
  if (!existing) return null;
  if (existing.ticketId !== ticket.id) throw idempotencyConflict();
  const message = await Message.findOne({
    where: {
      id: existing.messageId,
      ticketId: ticket.id,
      companyId: ticket.companyId
    }
  });
  if (!message) throw idempotencyConflict();
  return message;
};

const loadMessage = (companyId: number, ticketId: number, messageId: string) =>
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

// Same events as a new message and a ticket update (as IngestEmailService).
const emitCreated = async (message: Message | null): Promise<void> => {
  if (!message?.ticket) return;
  try {
    if (!(await checkCompanyCompliant(message.companyId))) return;
    await websocketCreateMessage(message);
    websocketUpdateTicket(message.ticket);
  } catch (err) {
    logger.warn(
      { ticketId: message.ticketId, error: err?.name },
      "Could not emit outgoing email"
    );
  }
};

// Queues a reply/reply-all/forward from the attendance box. The rows written
// here (Message ack 0 + EmailMessage "queued" with userId and recipients) are
// the audit trail; the "EmailSend" job sends it. A repeated idempotencyKey
// returns the message created the first time, without a new job.
const SendEmailService = async ({
  ticket,
  userId,
  mode: rawMode,
  to,
  cc,
  subject,
  body: rawBody,
  files: rawFiles,
  idempotencyKey: rawKey
}: SendEmailRequest): Promise<Message> => {
  const files = Array.isArray(rawFiles) ? rawFiles : [];
  try {
    const { companyId } = ticket;
    await assertEmailEnabled(companyId);
    if (ticket.channel !== EMAIL_CHANNEL) {
      throw badRequest("ERR_EMAIL_INVALID_TICKET");
    }
    if (!ticket.emailAccountId) throw accountUnavailable();

    // API clients without a key get one: no replay protection, still valid
    const idempotencyKey = asString(rawKey) || uuidv4();
    if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      throw badRequest("ERR_EMAIL_INVALID_IDEMPOTENCY_KEY");
    }
    const replay = await replayOf(ticket, idempotencyKey);
    if (replay) return replay;

    const account = await EmailAccount.findOne({
      where: { id: ticket.emailAccountId, companyId }
    });
    if (!account || account.status !== "active") throw accountUnavailable();

    const mode = (asString(rawMode) || "reply") as EmailSendMode;
    if (!MODES.includes(mode)) throw badRequest("ERR_EMAIL_INVALID_MODE");

    const body = asString(rawBody) || "";
    if (!body.trim() && !files.length && mode !== "forward") {
      throw badRequest("ERR_EMAIL_EMPTY_MESSAGE");
    }

    const ownAddress = normalizeEmailAddress(account.address);
    const last = await findLastInbound(ticket);
    const recipients = resolveRecipients(
      mode,
      asString(to),
      asString(cc),
      last,
      ownAddress
    );

    const typedSubject = (asString(subject) || "")
      .replace(/[\r\n]+/g, " ")
      .trim();
    const finalSubject = (
      typedSubject || replySubject(ticket.subject || "", mode)
    ).slice(0, SUBJECT_MAX);

    const forwarded =
      mode === "forward" && last
        ? {
            part: await forwardedPart(ticket, last),
            attachments: await forwardedAttachments(ticket, last)
          }
        : null;

    const sources: (OutboundAttachmentSource & { size: number })[] = [
      ...files.map(file => ({
        filename: file.originalname,
        contentType: file.mimetype,
        sourcePath: file.path,
        size: Number(file.size) || 0
      })),
      ...(forwarded?.attachments || [])
    ];
    const totalBytes = sources.reduce((sum, source) => sum + source.size, 0);
    if (totalBytes > MAX_OUTBOUND_ATTACHMENTS_BYTES) {
      throw badRequest("ERR_EMAIL_ATTACHMENTS_TOO_LARGE");
    }

    const text = forwarded
      ? [body.trim() ? body : null, forwarded.part.text]
          .filter(Boolean)
          .join("\n\n")
      : body;
    const html = forwarded
      ? `${renderEmailHtml(body)}${forwarded.part.html}`
      : renderEmailHtml(body);

    const threaded = mode !== "forward" && last;
    const inReplyTo =
      threaded && isRealMessageId(last.internetMessageId)
        ? last.internetMessageId
        : null;
    const references = threaded
      ? buildReferences(
          (last.references || []).filter(isRealMessageId),
          inReplyTo || undefined
        )
      : [];

    const domain = account.address.slice(account.address.lastIndexOf("@") + 1);
    const internetMessageId = `<${uuidv4()}@${domain}>`;
    const messageId = uuidv4();
    const lastMessage = (body.trim() || finalSubject)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LAST_MESSAGE_MAX);

    let saved: EmailAttachment[] = [];
    let emailMessage: EmailMessage;
    try {
      emailMessage = await sequelize.transaction(async transaction => {
        // First, so a concurrent request with the same key fails here, on the
        // unique index, before any file is copied.
        const row = await EmailMessage.create(
          {
            companyId,
            emailAccountId: account.id,
            ticketId: ticket.id,
            messageId,
            direction: "out",
            providerMessageId: null,
            internetMessageId,
            inReplyTo,
            references,
            subject: finalSubject,
            fromAddress: { name: account.name, address: account.address },
            toAddresses: recipients.to,
            ccAddresses: recipients.cc,
            htmlSanitized: html,
            receivedAt: new Date(),
            flags: [],
            sendStatus: "queued",
            sendError: null,
            userId: userId || null,
            idempotencyKey
          },
          { transaction }
        );

        saved = await saveOutboundAttachments(companyId, row.id, sources, {
          transaction
        });

        await Message.create(
          {
            id: messageId,
            ticketId: ticket.id,
            companyId,
            channel: EMAIL_CHANNEL,
            body: text,
            fromMe: true,
            read: true,
            ack: 0,
            queueId: ticket.queueId ?? null,
            // valid JSON: the frontend MessagesList runs JSON.parse on it
            dataJson: JSON.stringify({
              source: EMAIL_CHANNEL,
              emailMessageId: row.id,
              flags: []
            })
          },
          { transaction }
        );

        await Ticket.update(
          { lastMessage },
          { where: { id: ticket.id, companyId }, transaction }
        );
        return row;
      });
    } catch (err) {
      await removeStoredAttachments(saved.map(a => a.storageKey));
      if (isIdempotencyDuplicate(err)) {
        const winner = await replayOf(ticket, idempotencyKey);
        if (winner) return winner;
      }
      throw err;
    }

    logger.info(
      {
        companyId,
        ticketId: ticket.id,
        emailMessageId: emailMessage.id,
        userId: userId || null,
        mode,
        recipients: recipients.to.length + recipients.cc.length,
        attachments: saved.length
      },
      "Email queued for sending"
    );

    await emitCreated(await loadMessage(companyId, ticket.id, messageId));

    try {
      await enqueueEmailSend(emailMessage.id);
    } catch {
      logger.warn(
        { companyId, emailMessageId: emailMessage.id },
        "Could not queue email send"
      );
      await recordSendOutcome(emailMessage, {
        sendStatus: "failed",
        code: TRANSIENT
      });
    }

    return Message.findOne({
      where: { id: messageId, ticketId: ticket.id, companyId }
    });
  } finally {
    await removeUploads(files);
  }
};

export default SendEmailService;
