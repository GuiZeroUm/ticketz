import fs from "fs";
import net from "net";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createTransport } from "nodemailer";
import AppError from "../../../errors/AppError";
import type EmailAccount from "../../../models/EmailAccount";
import { logger } from "../../../utils/logger";
import {
  INITIAL_IMPORT_HOURS,
  INITIAL_IMPORT_MAX,
  MAX_RAW_MESSAGE_BYTES,
  SYNC_BATCH_MAX,
  SYNC_ROUND_MAX_BYTES
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
  // Only used to tag secret-free log entries.
  accountId?: number;
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

const SMTP_AUTH_REJECT_CODES = [530, 534, 535, 538];

const PROGRAMMING_ERRORS = [
  "TypeError",
  "ReferenceError",
  "RangeError",
  "SyntaxError"
];

// Secret-free description of an unexpected error. Library errors (imapflow,
// nodemailer) can echo server text, so only name and code are kept; a stack is
// added just for programming errors, which are ours.
const logUnexpected = (accountId: number | undefined, error: unknown) => {
  const e = error as { name?: unknown; code?: unknown; stack?: unknown };
  const name = typeof e?.name === "string" ? e.name : typeof error;
  const entry: Record<string, unknown> = {
    accountId,
    name,
    code: typeof e?.code === "string" ? e.code : undefined
  };
  if (PROGRAMMING_ERRORS.includes(name) && typeof e?.stack === "string") {
    entry.stack = e.stack;
  }
  logger.warn(entry, "email adapter: unexpected error");
};

// SNI is only sent for DNS names, never for an IP literal.
const sniOptions = (servername: string) =>
  net.isIP(servername) ? {} : { servername };

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
    accountId: account.id,
    address: account.address,
    password,
    imap: { host: imapHost, port: imapPort, secure: Boolean(imapSecure) },
    smtp: { host: smtpHost, port: smtpPort, secure: Boolean(smtpSecure) }
  };
};

// ----------------------------------------------------------------------- IMAP

const mapImapError = (error: unknown, accountId?: number): Error | AppError => {
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
  logUnexpected(accountId, error);
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
    ...sniOptions(endpoint.servername),
    // Without implicit TLS, STARTTLS is mandatory (no cleartext fallback).
    ...(config.imap.secure ? {} : { doSTARTTLS: true }),
    tls: {
      ...sniOptions(endpoint.servername),
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    },
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
    throw mapImapError(error, config.accountId);
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

// What one sync round may still take, shared by every folder of the round.
type RoundBudget = { messages: number; bytes: number; taken: number };

type MessageMeta = { uid: number; size: number };

const sortedUnique = (uids: number[] | false | undefined): number[] =>
  Array.from(new Set(uids || [])).sort((a, b) => a - b);

// 1,2,3,7,9,10 -> "1:3,7,9:10": a compact UID set instead of one id per message.
const toRanges = (uids: number[]): string => {
  const parts: string[] = [];
  let from = uids[0];
  let to = uids[0];
  uids.slice(1).forEach(uid => {
    if (uid === to + 1) {
      to = uid;
      return;
    }
    parts.push(from === to ? `${from}` : `${from}:${to}`);
    from = uid;
    to = uid;
  });
  parts.push(from === to ? `${from}` : `${from}:${to}`);
  return parts.join(",");
};

const isOversize = (size: number) => size > MAX_RAW_MESSAGE_BYTES;

// Takes messages (ascending) while the round budget lasts. At least one message
// is always taken per round so a single large message cannot stall the sync.
const takeWithinBudget = (
  candidates: MessageMeta[],
  budget: RoundBudget
): { selected: MessageMeta[]; cut: boolean } => {
  const selected: MessageMeta[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const candidate of candidates) {
    // Oversize messages are fetched as headers only: they weigh nothing here.
    const weight = isOversize(candidate.size) ? 0 : candidate.size;
    const first = budget.taken === 0;
    if (budget.messages <= 0 || (!first && weight > budget.bytes)) {
      return { selected, cut: true };
    }
    selected.push(candidate);
    budget.messages -= 1;
    budget.bytes -= weight;
    budget.taken += 1;
  }
  return { selected, cut: false };
};

type FetchedMessage = {
  uid: number;
  flags?: Set<string>;
  internalDate?: Date | string;
  source?: Buffer;
  headers?: Buffer;
};

const withFallbackDate = (
  parsed: Awaited<ReturnType<typeof simpleParser>>,
  internalDate: Date | string | undefined
) => {
  const internal = new Date(internalDate as Date | string);
  if (
    !(parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())) &&
    !Number.isNaN(internal.getTime())
  ) {
    parsed.date = internal;
  }
};

const syncFolder = async (
  client: ImapFlow,
  accountId: number,
  folder: FolderToSync,
  previous: FolderCursor | undefined,
  budget: RoundBudget
): Promise<FolderResult> => {
  // The round is already full: leave this folder for the next one.
  if (budget.messages <= 0 || (budget.taken > 0 && budget.bytes <= 0)) {
    return { emails: [], cursor: previous, hasMore: true };
  }

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

    let candidates: MessageMeta[];
    // UIDs the cursor moves past when the whole candidate list is consumed
    let candidatesEnd: number;
    let moreBeyondCandidates = false;

    if (!previous) {
      // IMAP SINCE only has day granularity: filter by the exact date. The
      // search criteria is the range, so no UID list goes over the wire.
      const since = new Date(
        Date.now() - INITIAL_IMPORT_HOURS * 60 * 60 * 1000
      );
      const meta = await client.fetchAll(
        { since },
        { uid: true, size: true, internalDate: true },
        { uid: true }
      );
      candidates = meta
        .filter(m => {
          const time = new Date(m.internalDate as Date | string).getTime();
          return Number.isFinite(time) && time >= since.getTime();
        })
        .map(m => ({ uid: m.uid, size: Number(m.size) || 0 }))
        .sort((a, b) => a.uid - b.uid)
        // Only the most recent messages of the window are imported.
        .slice(-INITIAL_IMPORT_MAX);
      // After the first import only newer mail is read, never the history.
      candidatesEnd = Math.max(
        lastKnownUid,
        candidates.length ? candidates[candidates.length - 1].uid : 0
      );
      if (!candidates.length) {
        return {
          emails: [],
          cursor: { uidValidity, lastUid: candidatesEnd },
          hasMore: false
        };
      }
    } else {
      // "N:*" always returns the highest UID even when it is below N.
      const found = sortedUnique(
        await client.search({ uid: `${previous.lastUid + 1}:*` }, { uid: true })
      ).filter(uid => uid > previous.lastUid);
      if (!found.length)
        return { emails: [], cursor: previous, hasMore: false };
      const window = found.slice(0, Math.max(1, budget.messages));
      moreBeyondCandidates = found.length > window.length;
      candidatesEnd = window[window.length - 1];
      const meta = await client.fetchAll(
        toRanges(window),
        { uid: true, size: true },
        { uid: true }
      );
      const sizes = new Map(meta.map(m => [m.uid, Number(m.size) || 0]));
      // A UID without metadata was expunged meanwhile: nothing to import.
      candidates = window
        .filter(uid => sizes.has(uid))
        .map(uid => ({ uid, size: sizes.get(uid) }));
    }

    const { selected, cut } = takeWithinBudget(candidates, budget);
    if (!selected.length) {
      // Only possible when the budget ran out before this folder started.
      return { emails: [], cursor: previous, hasMore: true };
    }

    const normal = selected.filter(m => !isOversize(m.size));
    const oversize = selected.filter(m => isOversize(m.size));
    const imported: { uid: number; email: NormalizedEmail }[] = [];

    const normalize = (
      message: FetchedMessage,
      raw: Buffer,
      flags: string[]
    ): Promise<NormalizedEmail> =>
      simpleParser(raw).then(parsed => {
        withFallbackDate(parsed, message.internalDate);
        return normalizeParsedMail(parsed, {
          accountId,
          direction: folder.direction,
          providerMessageId: `${folder.path}:${uidValidity}:${message.uid}`,
          flags
        });
      });

    // Each source is parsed as it arrives and dropped, so only one raw message
    // is held at a time.
    if (normal.length) {
      // eslint-disable-next-line no-restricted-syntax
      for await (const message of client.fetch(
        toRanges(normal.map(m => m.uid)),
        { uid: true, flags: true, internalDate: true, source: true },
        { uid: true }
      )) {
        if (message.source) {
          try {
            imported.push({
              uid: message.uid,
              email: await normalize(
                message,
                message.source,
                Array.from(message.flags || [])
              )
            });
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
    }

    // Too large to import whole: keep the envelope so the conversation shows
    // it, flagged "oversize", without body or attachments.
    if (oversize.length) {
      // eslint-disable-next-line no-restricted-syntax
      for await (const message of client.fetch(
        toRanges(oversize.map(m => m.uid)),
        { uid: true, flags: true, internalDate: true, headers: true },
        { uid: true }
      )) {
        if (message.headers) {
          try {
            const email = await normalize(message, message.headers, [
              ...Array.from(message.flags || []),
              "oversize"
            ]);
            imported.push({
              uid: message.uid,
              email: {
                ...email,
                text: "",
                htmlSanitized: undefined,
                attachments: []
              }
            });
          } catch {
            logger.warn(
              { accountId, folder: folder.path, uid: message.uid },
              "email imap: message headers could not be parsed, skipped"
            );
          }
        }
      }
    }

    imported.sort((a, b) => a.uid - b.uid);
    return {
      emails: imported.map(item => item.email),
      cursor: {
        uidValidity,
        // When the round stopped early the cursor stays right after the last
        // message taken; otherwise it moves past everything considered.
        lastUid: cut ? selected[selected.length - 1].uid : candidatesEnd
      },
      hasMore: cut || moreBeyondCandidates
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
  dataStarted: boolean,
  accountId?: number
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
      return new EmailSendRejectedError(
        "ERR_EMAIL_REJECTED",
        `${responseCode}`
      );
    }
    // 4xx: the server answered and did not take the message.
    return new EmailTransientError(undefined, `${responseCode}`);
  }

  if (authStage) return new EmailAuthError();
  // Local validation (invalid address, empty message): nothing was sent.
  if (code === "EENVELOPE" || code === "EMESSAGE") {
    return new EmailSendRejectedError("ERR_EMAIL_INVALID_MESSAGE", code);
  }
  if (dataStarted || command === "DATA") return new EmailSendAmbiguousError();
  // Network-level failures carry a known code (ECONNREFUSED, ETIMEDOUT...);
  // anything else is unexpected and worth a secret-free log entry.
  if (!reasonOf(error)) logUnexpected(accountId, error);
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
    tls: {
      ...sniOptions(endpoint.servername),
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    },
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
    throw new EmailSendRejectedError(
      "ERR_EMAIL_INVALID_MESSAGE",
      "attachment_missing"
    );
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
      const budget: RoundBudget = {
        messages: SYNC_BATCH_MAX,
        bytes: SYNC_ROUND_MAX_BYTES,
        taken: 0
      };
      let hasMore = false;

      // eslint-disable-next-line no-restricted-syntax
      for (const folder of folders) {
        const result = await syncFolder(
          client,
          account.id,
          folder,
          previous.folders[folder.path],
          budget
        );
        emails.push(...result.emails);
        if (result.cursor) nextFolders[folder.path] = result.cursor;
        hasMore = hasMore || result.hasMore;
      }

      return { emails, cursor: { folders: nextFolders }, hasMore };
    } catch (error) {
      throw mapImapError(error, config.accountId);
    } finally {
      await closeImap(client);
    }
  }

  async send(
    account: EmailAccount,
    mail: OutgoingEmail
  ): Promise<{
    providerMessageId?: string;
    providerThreadId?: string;
    rejectedCount?: number;
  }> {
    const config = loadMailboxConfig(account);
    await assertAttachmentsReadable(mail);

    const tracker = createSmtpTracker();
    const transport = await createSmtpTransport(config, tracker);
    try {
      const info = await transport.sendMail({
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
      const rejected = Array.isArray(info?.rejected) ? info.rejected.length : 0;
      return rejected > 0 ? { rejectedCount: rejected } : {};
    } catch (error) {
      throw classifySmtpError(error, tracker.state.dataStarted, account.id);
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
