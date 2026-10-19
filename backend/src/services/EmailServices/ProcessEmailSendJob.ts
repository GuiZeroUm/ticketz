import { randomBytes } from "crypto";
import { Op } from "sequelize";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import EmailAccount from "../../models/EmailAccount";
import EmailAttachment from "../../models/EmailAttachment";
import EmailMessage, { EmailSendStatus } from "../../models/EmailMessage";
import Message, { MessageErrorPayload } from "../../models/Message";
import { logger } from "../../utils/logger";
import {
  EmailAuthError,
  EmailSendAmbiguousError,
  EmailSendRejectedError,
  EmailTransientError,
  getAdapter
} from "./adapters";
import { storedAttachmentPath } from "./EmailAttachmentStorage";
import { emailEnabledForCompany } from "./EmailAccessService";
import { markAccountError } from "./EmailAccountStatusService";
import emailRedis from "./emailRedis";
import { OutgoingEmail } from "./types";

// Waiting time before retry n (1-based) of a transient failure. After the last
// one the email is marked failed.
export const SEND_RETRY_DELAYS_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000];

// Marker set right before the email is handed to the server. A run that finds
// it (a crashed worker's stalled job re-run by Bull, a duplicate job) cannot
// tell whether the email left, so it marks the send "unknown" instead of
// sending again. Removed only when the attempt surely sent nothing.
export const SEND_INFLIGHT_TTL_SECONDS = 24 * 60 * 60;
export const sendInflightKey = (emailMessageId: number): string =>
  `email:send-inflight:${emailMessageId}`;

// An account in "error" (sync failing, e.g. IMAP down) may still send over
// SMTP; reauth_required/disabled/connecting accounts cannot.
const SENDABLE_ACCOUNT_STATUSES = ["active", "error"];

export const ACCOUNT_UNAVAILABLE = "ERR_EMAIL_ACCOUNT_UNAVAILABLE";
export const CHANNEL_DISABLED = "ERR_EMAIL_CHANNEL_DISABLED";
export const PARTIAL_REJECTION = "ERR_EMAIL_PARTIAL_REJECTION";
export const SEND_AMBIGUOUS = "ERR_EMAIL_SEND_AMBIGUOUS";
export const TRANSIENT = "ERR_EMAIL_TRANSIENT";
const AUTH_FAILED = "ERR_EMAIL_AUTH_FAILED";
const REJECTED = "ERR_EMAIL_REJECTED";
const INVALID_MESSAGE = "ERR_EMAIL_INVALID_MESSAGE";
const SEND_FAILED = "ERR_EMAIL_SEND_FAILED";

// Only our own fixed codes are stored; anything else becomes `fallback`.
const FIXED_CODE_RE = /^ERR_EMAIL_[A-Z0-9_]+$/;
const fixedCode = (value: unknown, fallback: string): string =>
  typeof value === "string" && FIXED_CODE_RE.test(value) ? value : fallback;

export type SendOutcome = {
  sendStatus: Exclude<EmailSendStatus, "queued">;
  code?: string;
  providerMessageId?: string;
  providerThreadId?: string;
};

type SendRow = Pick<
  EmailMessage,
  "id" | "companyId" | "ticketId" | "messageId"
>;

// Besides the chat message, the payload carries the email's send status
// (additive fields: the email views also refetch the thread on any event).
const emitMessageUpdate = async (
  row: SendRow,
  outcome: SendOutcome
): Promise<void> => {
  try {
    const message = await Message.findOne({
      where: {
        id: row.messageId,
        ticketId: row.ticketId,
        companyId: row.companyId
      }
    });
    if (!message) return;
    getIO()
      .to(row.ticketId.toString())
      .emit(`company-${row.companyId}-appMessage`, {
        action: "update",
        message,
        emailMessageId: row.id,
        sendStatus: outcome.sendStatus,
        sendError: outcome.code ? { code: outcome.code } : null
      });
  } catch (err) {
    logger.warn(
      { emailMessageId: row.id, error: err?.name },
      "Could not emit email send status"
    );
  }
};

// Writes the result of a send on the EmailMessage (sendStatus/sendError) and
// on the chat Message (ack, error), then emits appMessage "update". Only rows
// still in one of `from` change: a bounce or the Sent-folder copy that got
// there first is never overwritten. Returns false when nothing changed.
export const recordSendOutcome = async (
  row: SendRow,
  outcome: SendOutcome,
  from: EmailSendStatus[] = ["queued"]
): Promise<boolean> => {
  const changes: Record<string, unknown> = {
    sendStatus: outcome.sendStatus,
    sendError: outcome.code ? { code: outcome.code } : null
  };
  if (outcome.providerMessageId) {
    changes.providerMessageId = outcome.providerMessageId;
  }
  if (outcome.providerThreadId) {
    changes.providerThreadId = outcome.providerThreadId;
  }

  let messageChanges: {
    ack: number;
    error: MessageErrorPayload | null;
  } | null = null;
  if (outcome.sendStatus === "sent") {
    messageChanges = { ack: 1, error: null };
  } else if (outcome.sendStatus === "failed") {
    messageChanges = {
      ack: -1,
      error: { code: outcome.code || SEND_FAILED } as MessageErrorPayload
    };
  }

  const applied = await sequelize.transaction(async transaction => {
    const [affected] = await EmailMessage.update(changes, {
      where: {
        id: row.id,
        companyId: row.companyId,
        sendStatus: from.length === 1 ? from[0] : { [Op.in]: from }
      },
      transaction
    });
    if (!affected) return false;
    if (messageChanges) {
      await Message.update(messageChanges, {
        where: {
          id: row.messageId,
          ticketId: row.ticketId,
          companyId: row.companyId
        },
        transaction
      });
    }
    return true;
  });

  if (applied) {
    logger.info(
      {
        companyId: row.companyId,
        emailMessageId: row.id,
        sendStatus: outcome.sendStatus,
        code: outcome.code
      },
      "Email send status changed"
    );
    await emitMessageUpdate(row, outcome);
  }
  return applied;
};

const buildOutgoing = async (
  row: EmailMessage,
  account: EmailAccount,
  text: string
): Promise<OutgoingEmail> => {
  const stored = await EmailAttachment.findAll({
    where: { companyId: row.companyId, emailMessageId: row.id },
    order: [["id", "ASC"]]
  });
  const attachments = stored
    .filter(attachment => !attachment.skippedReason)
    .map(attachment => {
      const filePath = attachment.storageKey
        ? storedAttachmentPath(row.companyId, attachment.storageKey)
        : null;
      if (!filePath) {
        throw new EmailSendRejectedError(INVALID_MESSAGE, "attachment_missing");
      }
      return {
        filename: attachment.filename,
        contentType: attachment.contentType || "application/octet-stream",
        path: filePath
      };
    });

  return {
    from: row.fromAddress || { name: account.name, address: account.address },
    to: row.toAddresses || [],
    cc: row.ccAddresses || [],
    subject: row.subject || "",
    text,
    html: row.htmlSanitized || "",
    messageId: row.internetMessageId,
    ...(row.inReplyTo ? { inReplyTo: row.inReplyTo } : {}),
    references: row.references || [],
    attachments,
    ...(row.providerThreadId ? { providerThreadId: row.providerThreadId } : {})
  };
};

// true while a send attempt holds (or a finished/crashed one left) the marker
export const isSendInFlight = async (
  emailMessageId: number
): Promise<boolean> =>
  (await emailRedis().exists(sendInflightKey(emailMessageId))) > 0;

// true when this run now owns the send; false when another run already did.
const claimSend = async (emailMessageId: number): Promise<boolean> => {
  const taken = await emailRedis().set(
    sendInflightKey(emailMessageId),
    randomBytes(8).toString("hex"),
    "EX",
    SEND_INFLIGHT_TTL_SECONDS,
    "NX"
  );
  return taken === "OK";
};

const releaseSend = async (emailMessageId: number): Promise<void> => {
  try {
    await emailRedis().del(sendInflightKey(emailMessageId));
  } catch {
    // It expires on its own; a retry within the TTL is then marked unknown.
    logger.warn({ emailMessageId }, "Could not release email send marker");
  }
};

// Pauses between the tries of the "sent" write (mutable for tests).
export const sendTimings = { sentWriteRetryDelaysMs: [1000, 5000] };

const wait = (ms: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });

// The server took the email: writing "sent" is retried a few times when the
// database fails, then "unknown" is written as a best effort (the UI says
// "not confirmed" instead of a clock forever). Never resends, never throws.
const recordAccepted = async (
  row: EmailMessage,
  outcome: SendOutcome
): Promise<void> => {
  const delays = sendTimings.sentWriteRetryDelaysMs;
  for (let tryNumber = 0; tryNumber <= delays.length; tryNumber += 1) {
    try {
      await recordSendOutcome(row, outcome, ["queued", "unknown"]);
      return;
    } catch (err) {
      logger.warn(
        { companyId: row.companyId, emailMessageId: row.id, error: err?.name },
        "Could not save sent email status"
      );
      if (tryNumber < delays.length) await wait(delays[tryNumber]);
    }
  }
  try {
    await recordSendOutcome(row, {
      sendStatus: "unknown",
      code: SEND_AMBIGUOUS
    });
  } catch (err) {
    logger.error(
      { companyId: row.companyId, emailMessageId: row.id, error: err?.name },
      "Email was sent but its status could not be saved"
    );
  }
};

export type SendJobOptions = {
  // 0 for the first try, n for the n-th retry of a transient failure
  attempt?: number;
  // queues the next try; without it a transient failure is final
  scheduleRetry?: (nextAttempt: number, delayMs: number) => Promise<void>;
};

const handleTransient = async (
  row: EmailMessage,
  attempt: number,
  scheduleRetry?: SendJobOptions["scheduleRetry"]
): Promise<void> => {
  if (scheduleRetry && attempt < SEND_RETRY_DELAYS_MS.length) {
    try {
      await scheduleRetry(attempt + 1, SEND_RETRY_DELAYS_MS[attempt]);
      logger.info(
        { companyId: row.companyId, emailMessageId: row.id, attempt },
        "Email send will be retried"
      );
      return;
    } catch {
      logger.warn(
        { companyId: row.companyId, emailMessageId: row.id },
        "Could not schedule email send retry"
      );
    }
  }
  await recordSendOutcome(row, { sendStatus: "failed", code: TRANSIENT });
};

const flagAccountForReauth = async (
  account: EmailAccount,
  err: EmailAuthError
): Promise<void> => {
  try {
    // A fresh read: the guarded write compares updatedAt, and the instance
    // used for sending may already be stale.
    const fresh = await EmailAccount.findByPk(account.id);
    if (fresh) await markAccountError(fresh, err);
  } catch {
    logger.warn(
      { companyId: account.companyId, emailAccountId: account.id },
      "Could not flag email account for re-authentication"
    );
  }
};

// Sends one queued outgoing email (job "EmailSend"). Never throws for a send
// failure: every outcome is written on the EmailMessage instead.
//  - success → sent (+ ERR_EMAIL_PARTIAL_REJECTION when some recipients were
//    refused), Message.ack 1
//  - EmailSendRejectedError → failed with its fixed code, ack -1
//  - EmailSendAmbiguousError / unexpected error → unknown, never retried
//  - EmailTransientError → retried (30 s, 2 min, 10 min), then failed
//  - EmailAuthError → failed, account reauth_required
// Logs carry ids and codes only, never addresses, subjects or bodies.
const ProcessEmailSendJob = async (
  emailMessageId: number,
  options: SendJobOptions = {}
): Promise<void> => {
  const attempt = options.attempt || 0;
  const row = await EmailMessage.findByPk(emailMessageId);
  if (!row || row.direction !== "out" || row.sendStatus !== "queued") return;
  const { companyId } = row;

  if (!(await emailEnabledForCompany(companyId))) {
    await recordSendOutcome(row, {
      sendStatus: "failed",
      code: CHANNEL_DISABLED
    });
    return;
  }

  const account = row.emailAccountId
    ? await EmailAccount.scope("withSecrets").findOne({
        where: { id: row.emailAccountId, companyId }
      })
    : null;
  if (!account || !SENDABLE_ACCOUNT_STATUSES.includes(account.status)) {
    await recordSendOutcome(row, {
      sendStatus: "failed",
      code: ACCOUNT_UNAVAILABLE
    });
    return;
  }

  const message = await Message.findOne({
    where: { id: row.messageId, ticketId: row.ticketId, companyId }
  });
  if (!message) {
    // the audit row's text is gone: never send something else in its place
    await recordSendOutcome(row, {
      sendStatus: "failed",
      code: INVALID_MESSAGE
    });
    return;
  }

  let outgoing: OutgoingEmail;
  try {
    outgoing = await buildOutgoing(row, account, message.body || "");
  } catch (err) {
    const code =
      err instanceof EmailSendRejectedError
        ? fixedCode(err.code, INVALID_MESSAGE)
        : INVALID_MESSAGE;
    await recordSendOutcome(row, { sendStatus: "failed", code });
    return;
  }

  let claimed: boolean;
  try {
    claimed = await claimSend(row.id);
  } catch {
    // Redis unreachable: nothing was sent, same as a transient failure.
    await handleTransient(row, attempt, options.scheduleRetry);
    return;
  }
  if (!claimed) {
    logger.warn(
      { companyId, emailMessageId: row.id },
      "Email send already attempted by another run"
    );
    await recordSendOutcome(row, {
      sendStatus: "unknown",
      code: SEND_AMBIGUOUS
    });
    return;
  }

  let result: Awaited<ReturnType<ReturnType<typeof getAdapter>["send"]>>;
  try {
    result = await getAdapter(account.provider).send(account, outgoing);
  } catch (err) {
    if (err instanceof EmailSendAmbiguousError) {
      await recordSendOutcome(row, {
        sendStatus: "unknown",
        code: SEND_AMBIGUOUS
      });
      return;
    }
    if (err instanceof EmailTransientError) {
      await releaseSend(row.id);
      await handleTransient(row, attempt, options.scheduleRetry);
      return;
    }
    if (err instanceof EmailSendRejectedError) {
      await releaseSend(row.id);
      await recordSendOutcome(row, {
        sendStatus: "failed",
        code: fixedCode(err.code, REJECTED)
      });
      return;
    }
    if (err instanceof EmailAuthError) {
      await releaseSend(row.id);
      await recordSendOutcome(row, {
        sendStatus: "failed",
        code: fixedCode(err.message, AUTH_FAILED)
      });
      await flagAccountForReauth(account, err);
      return;
    }
    if (err instanceof AppError && FIXED_CODE_RE.test(err.message)) {
      // configuration refused before connecting (host not allowed...)
      await releaseSend(row.id);
      await recordSendOutcome(row, { sendStatus: "failed", code: err.message });
      return;
    }
    // Unknown failure inside the adapter: the email may have left.
    logger.warn(
      { companyId, emailMessageId: row.id, error: err?.name },
      "Unexpected email send failure"
    );
    await recordSendOutcome(row, {
      sendStatus: "unknown",
      code: SEND_AMBIGUOUS
    });
    return;
  }

  // The marker stays until it expires: the email is gone, a re-run must not
  // send it again. A confirmed acceptance also replaces an "unknown" written
  // by a duplicate run in the meantime.
  await recordAccepted(row, {
    sendStatus: "sent",
    code: result?.rejectedCount > 0 ? PARTIAL_REJECTION : undefined,
    providerMessageId: result?.providerMessageId,
    providerThreadId: result?.providerThreadId
  });
};

export default ProcessEmailSendJob;
