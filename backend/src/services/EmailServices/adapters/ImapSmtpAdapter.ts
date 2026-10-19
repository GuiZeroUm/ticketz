import fs from "fs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createTransport } from "nodemailer";
import AppError from "../../../errors/AppError";
import type EmailAccount from "../../../models/EmailAccount";
import { logger } from "../../../utils/logger";
import {
  INITIAL_IMPORT_HOURS,
  INITIAL_IMPORT_MAX,
  MAX_HTML_BYTES,
  MAX_INBOUND_ATTACHMENTS_BYTES,
  SYNC_BATCH_MAX
} from "../limits";
import { resolveSafeMailEndpoint } from "../mailEndpoint";
import normalizeParsedMail from "../normalizeParsedMail";
import type { NormalizedEmail, OutgoingEmail } from "../types";
import type { EmailCursor, EmailProviderAdapter } from "./EmailProviderAdapter";
import {
  EmailAuthError,
  EmailSendAmbiguousError,
  EmailSendRejectedError,
  EmailTransientError
} from "./errors";

type Endpoint = { host: string; port: number; secure: boolean };

type MailboxConfig = {
  address: string;
  password: string;
  imap: Endpoint;
  smtp: Endpoint;
};

type FolderCursor = { uidValidity: string; lastUid: number };
type ImapCursor = { folders: Record<string, FolderCursor> };

type FolderToSync = { path: string; direction: "in" | "out" };

const CONNECTION_FAILED = "ERR_EMAIL_CONNECTION_FAILED";

const IMAP_TIMEOUTS = {
  connectionTimeout: 20_000,
  greetingTimeout: 15_000,
  socketTimeout: 90_000
};

const SMTP_TIMEOUTS = {
  connectionTimeout: 20_000,
  greetingTimeout: 15_000,
  // After DATA the server may take a while (scanning) to answer the final dot.
  socketTimeout: 120_000
};

// A message larger than this is cut when downloaded, so one huge message cannot
// exhaust memory. Attachments are bounded by MAX_INBOUND_ATTACHMENTS_BYTES.
const MAX_RAW_MESSAGE_BYTES = MAX_INBOUND_ATTACHMENTS_BYTES + MAX_HTML_BYTES;

const SMTP_AUTH_REJECT_CODES = [530, 534, 535, 538];

const reasonOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(code)
    ? code
    : undefined;
};

// ---------------------------------------------------------------- credentials

const loadMailboxConfig = (account: EmailAccount): MailboxConfig => {
  const password = account.getCredentials()?.password;
  if (!password) throw new EmailAuthError("ERR_EMAIL_CREDENTIALS_MISSING");

  const { imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure } =
    account;
  if (!imapHost || !imapPort || !smtpHost || !smtpPort) {
    throw new AppError(CONNECTION_FAILED, 400);
  }
  return {
    address: account.address,
    password,
    imap: { host: imapHost, port: imapPort, secure: Boolean(imapSecure) },
    smtp: { host: smtpHost, port: smtpPort, secure: Boolean(smtpSecure) }
  };
};

// ----------------------------------------------------------------------- IMAP

const mapImapError = (error: unknown): Error | AppError => {
  if (
    error instanceof AppError ||
    error instanceof EmailAuthError ||
    error instanceof EmailTransientError
  ) {
    return error;
  }
  const e = error as {
    authenticationFailed?: boolean;
    serverResponseCode?: string;
  };
  if (
    e?.authenticationFailed ||
    e?.serverResponseCode === "AUTHENTICATIONFAILED"
  ) {
    return new EmailAuthError();
  }
  return new EmailTransientError(undefined, reasonOf(error));
};

// Always connects to the IP validated by resolveSafeMailEndpoint and uses the
// hostname only as TLS servername, so DNS cannot be re-resolved afterwards.
const connectImap = async (config: MailboxConfig): Promise<ImapFlow> => {
  const endpoint = await resolveSafeMailEndpoint({
    host: config.imap.host,
    port: config.imap.port,
    kind: "imap"
  });

  const client = new ImapFlow({
    host: endpoint.address,
    port: endpoint.port,
    secure: config.imap.secure,
    servername: endpoint.servername,
    // Without implicit TLS, STARTTLS is mandatory (no cleartext fallback).
    ...(config.imap.secure ? {} : { doSTARTTLS: true }),
    tls: { servername: endpoint.servername, minVersion: "TLSv1.2" },
    auth: { user: config.address, pass: config.password },
    logger: false,
    disableAutoIdle: true,
    ...IMAP_TIMEOUTS
  });
  // Socket errors after connect are emitted as events; unhandled they would
  // crash the process. The failing command already rejects with the error.
  client.on("error", () => undefined);

  try {
    await client.connect();
  } catch (error) {
    client.close();
    throw mapImapError(error);
  }
  return client;
};

const closeImap = async (client: ImapFlow): Promise<void> => {
  try {
    await client.logout();
  } catch {
    client.close();
  }
};

const parseCursor = (raw: unknown): ImapCursor => {
  const folders: Record<string, FolderCursor> = {};
  const source = (raw as { folders?: unknown } | null)?.folders;
  if (source && typeof source === "object") {
    Object.entries(source as Record<string, unknown>).forEach(([p, value]) => {
      const entry = value as Partial<FolderCursor> | null;
      if (
        entry &&
        typeof entry.uidValidity === "string" &&
        Number.isInteger(entry.lastUid) &&
        entry.lastUid >= 0
      ) {
        folders[p] = { uidValidity: entry.uidValidity, lastUid: entry.lastUid };
      }
    });
  }
  return { folders };
};

const foldersToSync = async (client: ImapFlow): Promise<FolderToSync[]> => {
  const result: FolderToSync[] = [{ path: "INBOX", direction: "in" }];
  const mailboxes = await client.list();
  const sent = mailboxes.find(mailbox => mailbox.specialUse === "\\Sent");
  if (sent && sent.path !== "INBOX") {
    result.push({ path: sent.path, direction: "out" });
  }
  return result;
};

type FolderResult = {
  emails: NormalizedEmail[];
  // undefined: the folder has not been synced yet (no budget left this round)
  cursor: FolderCursor | undefined;
  hasMore: boolean;
};

const sortedUnique = (uids: number[] | false | undefined): number[] =>
  Array.from(new Set(uids || [])).sort((a, b) => a - b);

const syncFolder = async (
  client: ImapFlow,
  accountId: number,
  folder: FolderToSync,
  previous: FolderCursor | undefined,
  budget: number
): Promise<FolderResult> => {
  // The batch is already full: leave this folder for the next round.
  if (budget <= 0) return { emails: [], cursor: previous, hasMore: true };

  const lock = await client.getMailboxLock(folder.path, { readOnly: true });
  try {
    const mailbox = client.mailbox as {
      uidValidity: bigint | number | string;
      uidNext: number;
    };
    const uidValidity = String(mailbox.uidValidity);
    const lastKnownUid = Math.max(0, Number(mailbox.uidNext) - 1);

    // The folder was recreated: UIDs of the old cursor mean nothing. Do not
    // import the whole history again, continue from what exists now.
    if (previous && previous.uidValidity !== uidValidity) {
      logger.warn(
        { accountId, folder: folder.path },
        "email imap: UIDVALIDITY changed, cursor reset"
      );
      return {
        emails: [],
        cursor: { uidValidity, lastUid: lastKnownUid },
        hasMore: false
      };
    }

    let uids: number[];
    let hasMore = false;

    if (!previous) {
      // IMAP SINCE only has day granularity: filter by the exact date.
      const since = new Date(
        Date.now() - INITIAL_IMPORT_HOURS * 60 * 60 * 1000
      );
      const candidates = sortedUnique(
        await client.search({ since }, { uid: true })
      );
      let inWindow: number[] = [];
      if (candidates.length) {
        const meta = await client.fetchAll(
          candidates.join(","),
          { uid: true, internalDate: true },
          { uid: true }
        );
        inWindow = meta
          .filter(m => {
            const time = new Date(m.internalDate as Date | string).getTime();
            return Number.isFinite(time) && time >= since.getTime();
          })
          .map(m => m.uid)
          .sort((a, b) => a - b);
      }
      // Only the most recent messages of the window are imported.
      uids = inWindow.slice(-Math.min(INITIAL_IMPORT_MAX, budget));
      if (!uids.length) {
        return {
          emails: [],
          cursor: { uidValidity, lastUid: lastKnownUid },
          hasMore: false
        };
      }
    } else {
      // "N:*" always returns the highest UID even when it is below N.
      const found = sortedUnique(
        await client.search({ uid: `${previous.lastUid + 1}:*` }, { uid: true })
      ).filter(uid => uid > previous.lastUid);
      uids = found.slice(0, budget);
      hasMore = found.length > uids.length;
      if (!uids.length) {
        return { emails: [], cursor: previous, hasMore };
      }
    }

    const fetched: {
      uid: number;
      source?: Buffer;
      flags?: Set<string>;
      internalDate?: Date | string;
    }[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const message of client.fetch(
      uids.join(","),
      {
        uid: true,
        flags: true,
        internalDate: true,
        source: { maxLength: MAX_RAW_MESSAGE_BYTES }
      },
      { uid: true }
    )) {
      fetched.push(message);
    }
    fetched.sort((a, b) => a.uid - b.uid);

    const emails: NormalizedEmail[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const message of fetched) {
      if (message.source) {
        try {
          const parsed = await simpleParser(message.source);
          const internal = new Date(message.internalDate as Date | string);
          if (
            !(
              parsed.date instanceof Date &&
              !Number.isNaN(parsed.date.getTime())
            ) &&
            !Number.isNaN(internal.getTime())
          ) {
            parsed.date = internal;
          }
          emails.push(
            normalizeParsedMail(parsed, {
              accountId,
              direction: folder.direction,
              providerMessageId: `${folder.path}:${uidValidity}:${message.uid}`,
              flags: Array.from(message.flags || [])
            })
          );
        } catch {
          // A message that cannot be parsed would otherwise block the folder
          // forever; skip it (the cursor moves past its UID).
          logger.warn(
            { accountId, folder: folder.path, uid: message.uid },
            "email imap: message could not be parsed, skipped"
          );
        }
      }
    }

    return {
      emails,
      cursor: { uidValidity, lastUid: uids[uids.length - 1] },
      hasMore
    };
  } finally {
    lock.release();
  }
};

// ----------------------------------------------------------------------- SMTP

// nodemailer cannot tell whether a dropped connection or timeout happened
// before or after the message body started (both are ETIMEDOUT/ECONNECTION on
// "CONN"). Its transaction log does: record whether the DATA command went out.
// The logger discards every entry, so credentials in the log are never kept.
export const createSmtpTracker = () => {
  const state = { dataStarted: false };
  const noop = () => undefined;
  const logger = {
    level: noop,
    trace: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    debug: (entry: { tnx?: string } | undefined, message?: unknown) => {
      if (
        entry?.tnx === "client" &&
        typeof message === "string" &&
        message.trim().toUpperCase() === "DATA"
      ) {
        state.dataStarted = true;
      }
    }
  };
  return { state, logger };
};

type SmtpError = {
  code?: string;
  command?: string;
  responseCode?: number;
};

export const classifySmtpError = (
  error: unknown,
  dataStarted: boolean
): Error | AppError => {
  if (error instanceof AppError) return error;
  const { code, command, responseCode } = (error || {}) as SmtpError;
  const hasReply = typeof responseCode === "number";
  const authStage =
    code === "EAUTH" || String(command || "").startsWith("AUTH");

  if (hasReply) {
    if (responseCode >= 500) {
      if (authStage || SMTP_AUTH_REJECT_CODES.includes(responseCode)) {
        return new EmailAuthError();
      }
      return new EmailSendRejectedError(`ERR_EMAIL_REJECTED_${responseCode}`);
    }
    // 4xx: the server answered and did not take the message.
    return new EmailTransientError(undefined, reasonOf(error));
  }

  if (authStage) return new EmailAuthError();
  // Local validation (invalid address, empty message): nothing was sent.
  if (code === "EENVELOPE" || code === "EMESSAGE") {
    return new EmailSendRejectedError(`ERR_EMAIL_REJECTED_${code}`);
  }
  if (dataStarted || command === "DATA") return new EmailSendAmbiguousError();
  return new EmailTransientError(undefined, reasonOf(error));
};

const createSmtpTransport = async (
  config: MailboxConfig,
  tracker?: ReturnType<typeof createSmtpTracker>
) => {
  const endpoint = await resolveSafeMailEndpoint({
    host: config.smtp.host,
    port: config.smtp.port,
    kind: "smtp"
  });

  return createTransport({
    host: endpoint.address,
    port: endpoint.port,
    secure: config.smtp.secure,
    // STARTTLS is mandatory when the connection is not implicit TLS.
    ...(config.smtp.secure ? {} : { requireTLS: true }),
    tls: { servername: endpoint.servername, minVersion: "TLSv1.2" },
    auth: { user: config.address, pass: config.password },
    disableUrlAccess: true,
    ...(tracker ? { logger: tracker.logger, transactionLog: true } : {}),
    ...SMTP_TIMEOUTS
  });
};

const assertAttachmentsReadable = async (mail: OutgoingEmail) => {
  const results = await Promise.all(
    mail.attachments.map(attachment =>
      fs.promises.access(attachment.path, fs.constants.R_OK).then(
        () => true,
        () => false
      )
    )
  );
  if (results.some(readable => !readable)) {
    throw new EmailSendRejectedError("ERR_EMAIL_ATTACHMENT_MISSING");
  }
};

// ---------------------------------------------------------------- the adapter

export class ImapSmtpAdapter implements EmailProviderAdapter {
  async fetchChanges(account: EmailAccount): Promise<{
    emails: NormalizedEmail[];
    cursor: EmailCursor;
    hasMore: boolean;
  }> {
    const config = loadMailboxConfig(account);
    const previous = parseCursor(account.getDataValue("syncCursor"));
    const client = await connectImap(config);

    try {
      const folders = await foldersToSync(client);
      const nextFolders: Record<string, FolderCursor> = {
        ...previous.folders
      };
      const emails: NormalizedEmail[] = [];
      let hasMore = false;

      // eslint-disable-next-line no-restricted-syntax
      for (const folder of folders) {
        const result = await syncFolder(
          client,
          account.id,
          folder,
          previous.folders[folder.path],
          Math.max(0, SYNC_BATCH_MAX - emails.length)
        );
        emails.push(...result.emails);
        if (result.cursor) nextFolders[folder.path] = result.cursor;
        hasMore = hasMore || result.hasMore;
      }

      return { emails, cursor: { folders: nextFolders }, hasMore };
    } catch (error) {
      throw mapImapError(error);
    } finally {
      await closeImap(client);
    }
  }

  async send(
    account: EmailAccount,
    mail: OutgoingEmail
  ): Promise<{ providerMessageId?: string; providerThreadId?: string }> {
    const config = loadMailboxConfig(account);
    await assertAttachmentsReadable(mail);

    const tracker = createSmtpTracker();
    const transport = await createSmtpTransport(config, tracker);
    try {
      await transport.sendMail({
        from: { name: mail.from.name || "", address: mail.from.address },
        to: mail.to.map(a => ({ name: a.name || "", address: a.address })),
        cc: mail.cc.map(a => ({ name: a.name || "", address: a.address })),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: mail.messageId,
        ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo } : {}),
        references: mail.references,
        attachments: mail.attachments.map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          path: a.path
        }))
      });
      // SMTP gives no provider id nor thread id; the Message-ID is ours.
      return {};
    } catch (error) {
      throw classifySmtpError(error, tracker.state.dataStarted);
    } finally {
      transport.close();
    }
  }
}

// Validates a mailbox configuration before saving it: IMAP login and SMTP
// login (no message is sent).
export const testImapSmtp = async (config: MailboxConfig): Promise<void> => {
  const connectionFailed = () => new AppError(CONNECTION_FAILED, 400);

  let client: ImapFlow;
  try {
    client = await connectImap(config);
  } catch (error) {
    if (error instanceof EmailTransientError) throw connectionFailed();
    throw error;
  }
  await closeImap(client);

  const transport = await createSmtpTransport(config);
  try {
    await transport.verify();
  } catch (error) {
    const mapped = classifySmtpError(error, false);
    if (mapped instanceof EmailAuthError || mapped instanceof AppError) {
      throw mapped;
    }
    throw connectionFailed();
  } finally {
    transport.close();
  }
};

export default ImapSmtpAdapter;
