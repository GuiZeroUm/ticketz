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
  MAX_HEADERS_FETCH_BYTES,
  MAX_RAW_MESSAGE_BYTES,
  SYNC_BATCH_MAX,
  SYNC_ROUND_MAX_BYTES,
  UIDVALIDITY_RESCAN_MAX_DAYS
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
import { assertAttachmentsReadable, toMailOptions } from "./outgoingMail";

type Endpoint = { host: string; port: number; secure: boolean };

type MailboxConfig = {
  // Only used to tag secret-free log entries.
  accountId?: number;
  address: string;
  password: string;
  imap: Endpoint;
  smtp: Endpoint;
};

type FolderCursor = {
  uidValidity: string;
  lastUid: number;
  // Date.now() (ms) of the last round that left the folder caught up: every
  // message present when the folder was opened was settled.
  syncedAt?: number;
  // Present while recent mail is read again after a UIDVALIDITY change: only
  // messages with an internal date from this instant (ms) on are imported.
  rescanSince?: number;
  // When the initial import of the folder ran (ms): a rescan never reaches
  // before it, so it cannot import mail the initial import left out.
  importedAt?: number;
  // Last UIDVALIDITY change (ms), kept for VALIDITY_STABLE_MS, and whether
  // changes kept repeating (rescan disabled, error logged once).
  validityChangedAt?: number;
  validityUnstable?: boolean;
};
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
const connectImap = async (
  config: MailboxConfig,
  extra: { maxIdleTime?: number } = {}
): Promise<ImapFlow> => {
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
    // Hard ceilings below the 1 GB library defaults: a message body is never
    // requested beyond MAX_RAW_MESSAGE_BYTES, so nothing larger is legitimate.
    maxLiteralSize: MAX_RAW_MESSAGE_BYTES + 1024 * 1024,
    maxResponseSize: MAX_RAW_MESSAGE_BYTES + 4 * 1024 * 1024,
    ...IMAP_TIMEOUTS,
    ...(extra.maxIdleTime ? { maxIdleTime: extra.maxIdleTime } : {})
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

// Connection for the IDLE manager (Task 17): same hardened connect path as the
// sync adapter (resolveSafeMailEndpoint, pinned address, mandatory TLS, size
// limits). Throws EmailAuthError / EmailTransientError / AppError, never with
// credentials or server text. The caller owns the returned client.
export const openImapIdleClient = async (
  account: EmailAccount,
  options: { maxIdleTime?: number } = {}
): Promise<ImapFlow> => connectImap(loadMailboxConfig(account), options);

const closeImap = async (client: ImapFlow): Promise<void> => {
  try {
    await client.logout();
  } catch {
    client.close();
  }
};

const isInstant = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

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
        const folder: FolderCursor = {
          uidValidity: entry.uidValidity,
          lastUid: entry.lastUid
        };
        if (isInstant(entry.syncedAt)) folder.syncedAt = entry.syncedAt;
        if (isInstant(entry.rescanSince)) {
          folder.rescanSince = entry.rescanSince;
        }
        if (isInstant(entry.importedAt)) folder.importedAt = entry.importedAt;
        if (isInstant(entry.validityChangedAt)) {
          folder.validityChangedAt = entry.validityChangedAt;
          if (entry.validityUnstable === true) folder.validityUnstable = true;
        }
        folders[p] = folder;
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
type RoundBudget = {
  messages: number;
  bytes: number;
  taken: number;
  // messages actually imported (the first one is always allowed, any size)
  delivered: number;
};

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

// Messages downloaded per FETCH; the budget is re-checked between batches.
const FETCH_BATCH_SIZE = 10;

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

// The header block of a (possibly truncated) message prefix. A header block cut
// by the prefix limit loses its last, partial line.
const headerBlock = (prefix: Buffer): Buffer => {
  const text = prefix.toString("latin1");
  const end = text.search(/\r?\n\r?\n/);
  const block =
    end >= 0 ? text.slice(0, end) : text.slice(0, text.lastIndexOf("\n") + 1);
  return Buffer.from(`${block}\r\n\r\n`, "latin1");
};

const isOversize = (size: number) => size > MAX_RAW_MESSAGE_BYTES;

// Weight charged for a message imported as headers only.
const HEADERS_ONLY_WEIGHT_BYTES = 64 * 1024;

// An unknown size (missing or 0, as a broken server may report) is charged as
// the largest message that can be downloaded, never as free.
const weightOf = (size: number): number => {
  if (!(size > 0)) return MAX_RAW_MESSAGE_BYTES;
  return isOversize(size) ? HEADERS_ONLY_WEIGHT_BYTES : size;
};

// Takes messages (ascending) while the round budget lasts. At least one message
// is always taken per round so a single large message cannot stall the sync.
const takeWithinBudget = (
  candidates: MessageMeta[],
  budget: RoundBudget
): { selected: MessageMeta[]; cut: boolean } => {
  const selected: MessageMeta[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const candidate of candidates) {
    const weight = weightOf(candidate.size);
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

const HOUR_MS = 60 * 60 * 1000;
// Clock skew allowance between our clock and the server's internal dates.
const RESCAN_MARGIN_MS = HOUR_MS;
// A UIDVALIDITY change within this time of the previous one (or during a
// rescan) is a server that keeps changing it, e.g. Dovecot with in-memory
// indexes: rescanning on each change would re-read the same window forever.
const VALIDITY_STABLE_MS = HOUR_MS;

// Start of the window read again after a UIDVALIDITY change: from the last
// moment the folder was known to be caught up (per folder, or the account's
// last sync for cursors written before that was recorded), and never less
// than the initial import window. It never reaches before the folder's
// initial import once that import finished, and is capped at
// UIDVALIDITY_RESCAN_MAX_DAYS.
const rescanStart = (
  previous: FolderCursor,
  accountLastSyncAt: Date | string | null | undefined,
  now: number
): number => {
  const accountSynced = accountLastSyncAt
    ? new Date(accountLastSyncAt).getTime()
    : NaN;
  const reference =
    previous.syncedAt ?? (isInstant(accountSynced) ? accountSynced : undefined);
  let since = now - INITIAL_IMPORT_HOURS * HOUR_MS;
  if (reference !== undefined) {
    since = Math.min(since, reference - RESCAN_MARGIN_MS);
  }
  // syncedAt is only recorded once the folder was caught up, i.e. after the
  // initial import was fully read.
  if (previous.importedAt !== undefined && previous.syncedAt !== undefined) {
    since = Math.max(since, previous.importedAt - RESCAN_MARGIN_MS);
  }
  return Math.max(since, now - UIDVALIDITY_RESCAN_MAX_DAYS * 24 * HOUR_MS);
};

const syncFolder = async (
  client: ImapFlow,
  accountId: number,
  folder: FolderToSync,
  previous: FolderCursor | undefined,
  budget: RoundBudget,
  accountLastSyncAt?: Date | string | null
): Promise<FolderResult> => {
  // The round is already full: leave this folder for the next one.
  if (budget.messages <= 0 || (budget.taken > 0 && budget.bytes <= 0)) {
    return { emails: [], cursor: previous, hasMore: true };
  }

  // Taken before the mailbox is opened (and uidNext read): mail that arrives
  // later has a higher UID and an internal date after this instant.
  const startedAt = Date.now();
  const lock = await client.getMailboxLock(folder.path, { readOnly: true });
  try {
    const mailbox = client.mailbox as {
      uidValidity: bigint | number | string;
      uidNext: number;
    };
    const uidValidity = String(mailbox.uidValidity);
    const lastKnownUid = Math.max(0, Number(mailbox.uidNext) - 1);

    // Cursor of the current UIDVALIDITY (undefined before the first sync).
    let current = previous;

    // The folder was recreated: UIDs of the old cursor mean nothing, and mail
    // that arrived since the last sync may only exist under the new UIDs.
    // Read the recent window again (never the whole history); messages
    // already imported come back with new provider ids and are recognised by
    // their Message-ID at ingestion.
    // A change while a rescan is still running or soon after the previous
    // change: fall back to restarting at the end of the folder (mail since
    // the last sync may be missed), never a rescan loop.
    const repeatedChange =
      !!previous &&
      previous.uidValidity !== uidValidity &&
      (previous.rescanSince !== undefined ||
        (previous.validityChangedAt !== undefined &&
          startedAt - previous.validityChangedAt < VALIDITY_STABLE_MS));

    if (previous && repeatedChange) {
      if (!previous.validityUnstable) {
        logger.error(
          { accountId, folder: folder.path },
          "email imap: UIDVALIDITY keeps changing; rescan disabled, cursor reset to the end of the folder"
        );
      }
      current = {
        uidValidity,
        lastUid: lastKnownUid,
        validityChangedAt: startedAt,
        validityUnstable: true,
        ...(previous.importedAt !== undefined
          ? { importedAt: previous.importedAt }
          : {})
      };
    } else if (previous && previous.uidValidity !== uidValidity) {
      const rescanSince = rescanStart(previous, accountLastSyncAt, startedAt);
      logger.warn(
        {
          accountId,
          folder: folder.path,
          since: new Date(rescanSince).toISOString()
        },
        "email imap: UIDVALIDITY changed, rescanning recent mail"
      );
      current = {
        uidValidity,
        lastUid: 0,
        rescanSince,
        validityChangedAt: startedAt,
        ...(previous.syncedAt !== undefined
          ? { syncedAt: previous.syncedAt }
          : {}),
        ...(previous.importedAt !== undefined
          ? { importedAt: previous.importedAt }
          : {})
      };
    }

    // caughtUp: every message present when the folder was opened is settled,
    // which also ends a rescan.
    const cursorAt = (lastUid: number, caughtUp: boolean): FolderCursor => {
      const next: FolderCursor = { uidValidity, lastUid };
      if (caughtUp) {
        next.syncedAt = startedAt;
      } else {
        if (current?.syncedAt !== undefined) next.syncedAt = current.syncedAt;
        if (current?.rescanSince !== undefined) {
          next.rescanSince = current.rescanSince;
        }
      }
      // the first sync of the folder is its initial import
      const importedAt = current ? current.importedAt : startedAt;
      if (importedAt !== undefined) next.importedAt = importedAt;
      if (
        current?.validityChangedAt !== undefined &&
        startedAt - current.validityChangedAt < VALIDITY_STABLE_MS
      ) {
        next.validityChangedAt = current.validityChangedAt;
        if (current.validityUnstable) next.validityUnstable = true;
      }
      return next;
    };

    if (repeatedChange) {
      return {
        emails: [],
        cursor: cursorAt(lastKnownUid, true),
        hasMore: false
      };
    }

    let candidates: MessageMeta[];
    // UIDs the cursor moves past when the whole candidate list is consumed
    let candidatesEnd: number;
    let moreBeyondCandidates = false;

    // First sync: the initial import window. Rescan: the window recorded when
    // UIDVALIDITY changed, resumed after the cursor's UID across rounds.
    if (!current || current.rescanSince !== undefined) {
      const windowStart =
        current?.rescanSince ?? startedAt - INITIAL_IMPORT_HOURS * HOUR_MS;
      const afterUid = current?.lastUid ?? 0;
      // IMAP SINCE only has day granularity: filter by the exact date. The
      // search criteria is the range, so no UID list goes over the wire.
      const since = new Date(windowStart);
      const meta = await client.fetchAll(
        afterUid > 0 ? { since, uid: `${afterUid + 1}:*` } : { since },
        { uid: true, size: true, internalDate: true },
        { uid: true }
      );
      const inWindow = meta
        .filter(m => {
          const time = new Date(m.internalDate as Date | string).getTime();
          // "N:*" always returns the highest UID even when it is below N.
          return (
            m.uid > afterUid && Number.isFinite(time) && time >= windowStart
          );
        })
        .map(m => ({ uid: m.uid, size: Number(m.size) || 0 }))
        .sort((a, b) => a.uid - b.uid);
      if (!current) {
        // Only the most recent messages of the window are imported.
        candidates = inWindow.slice(-INITIAL_IMPORT_MAX);
      } else {
        // A rescan imports the whole window, a bounded slice per round.
        candidates = inWindow.slice(0, Math.max(1, budget.messages));
        moreBeyondCandidates = inWindow.length > candidates.length;
      }
      const lastCandidate = candidates.length
        ? candidates[candidates.length - 1].uid
        : 0;
      // Once the window is read only newer mail is, never the history.
      candidatesEnd = moreBeyondCandidates
        ? lastCandidate
        : Math.max(lastKnownUid, lastCandidate, afterUid);
      if (!candidates.length) {
        return {
          emails: [],
          cursor: cursorAt(candidatesEnd, true),
          hasMore: false
        };
      }
    } else {
      const { lastUid: fromUid } = current;
      // "N:*" always returns the highest UID even when it is below N.
      const found = sortedUnique(
        await client.search({ uid: `${fromUid + 1}:*` }, { uid: true })
      ).filter(uid => uid > fromUid);
      if (!found.length) {
        return { emails: [], cursor: cursorAt(fromUid, true), hasMore: false };
      }
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

    // Every candidate was expunged between SEARCH and FETCH: nothing to read,
    // move past them without asking for another round just for this.
    if (!candidates.length) {
      return {
        emails: [],
        cursor: cursorAt(candidatesEnd, !moreBeyondCandidates),
        hasMore: moreBeyondCandidates
      };
    }

    const { selected, cut } = takeWithinBudget(candidates, budget);
    if (!selected.length) {
      // The round budget was spent by an earlier folder: try again next round
      // (a rescan that just started is kept, so its window does not move).
      return { emails: [], cursor: current, hasMore: true };
    }

    const sizeOf = new Map(selected.map(m => [m.uid, m.size]));
    // Account for what really crossed the wire, not what the server claimed.
    const chargeExtra = (uid: number, actual: number) =>
      Math.max(0, actual - weightOf(sizeOf.get(uid)));

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
          flags,
          ...(message.internalDate
            ? { internalDate: new Date(message.internalDate) }
            : {})
        });
      });

    // uid -> email, or null for a message skipped because it cannot be parsed
    const done = new Map<number, NormalizedEmail | null>();
    // Every UID of a batch whose stream ended normally is settled (a UID that
    // never came back was expunged); in the batch where the round stopped only
    // the messages actually received are.
    const settled = new Set<number>();
    let stoppedEarly = false;

    // Headers only: a bounded prefix of the message, cut at the header block.
    const importHeadersOnly = async (uids: number[]) => {
      if (!uids.length) return;
      const wanted = new Set(uids);
      const seen = new Set<number>();
      // eslint-disable-next-line no-restricted-syntax
      for await (const message of client.fetch(
        toRanges(uids),
        {
          uid: true,
          flags: true,
          internalDate: true,
          source: { maxLength: MAX_HEADERS_FETCH_BYTES }
        },
        { uid: true }
      )) {
        // imapflow passes unsolicited and repeated rows through
        if (
          wanted.has(message.uid) &&
          !seen.has(message.uid) &&
          message.source
        ) {
          // A row without the body (e.g. an unsolicited FLAGS update) must not
          // hide the real row that follows.
          seen.add(message.uid);
          budget.bytes -= chargeExtra(message.uid, message.source.length);
          try {
            const email = await normalize(
              message,
              headerBlock(message.source),
              [...Array.from(message.flags || []), "oversize"]
            );
            done.set(message.uid, {
              ...email,
              text: "",
              htmlSanitized: undefined,
              attachments: []
            });
            settled.add(message.uid);
          } catch {
            done.set(message.uid, null);
            settled.add(message.uid);
            logger.warn(
              { accountId, folder: folder.path, uid: message.uid },
              "email imap: message headers could not be parsed, skipped"
            );
          }
        }
      }
    };

    // Small batches: the budget is re-checked with real byte counts between
    // them, so a lying size can overshoot by at most one message.
    // eslint-disable-next-line no-restricted-syntax
    for (const batch of chunk(selected, FETCH_BATCH_SIZE)) {
      if (stoppedEarly) break;
      if (budget.delivered > 0 && budget.bytes < 0) {
        stoppedEarly = true;
        break;
      }
      const batchUids = batch.map(m => m.uid);
      const known = batch.filter(m => isOversize(m.size)).map(m => m.uid);
      // Too large to import whole: keep the envelope so the conversation shows
      // it, flagged "oversize", without body or attachments.

      await importHeadersOnly(known);

      const normal = batch.filter(m => !isOversize(m.size)).map(m => m.uid);
      const truncated: number[] = [];
      const seen = new Set<number>();
      if (normal.length) {
        // eslint-disable-next-line no-restricted-syntax
        for await (const message of client.fetch(
          toRanges(normal),
          {
            uid: true,
            flags: true,
            internalDate: true,
            // The reported size can be missing or understated: never download
            // more than the cap, whatever the server claimed.
            source: { maxLength: MAX_RAW_MESSAGE_BYTES }
          },
          { uid: true }
        )) {
          if (
            !normal.includes(message.uid) ||
            seen.has(message.uid) ||
            !message.source
          ) {
            // unsolicited or repeated row (imapflow passes them through)

            continue;
          }
          seen.add(message.uid);
          const extra = chargeExtra(message.uid, message.source.length);
          if (budget.delivered > 0 && budget.bytes - extra < 0) {
            // Real size does not fit in what is left of the round: discard it
            // (it is read again next round) and stop.
            stoppedEarly = true;
            break;
          }
          budget.bytes -= extra;
          // Whatever happens next, this message used the round's bandwidth:
          // it counts as the "first message" so a run of truncated or
          // unparseable ones cannot bypass the budget check.
          budget.delivered += 1;
          if (message.source.length >= MAX_RAW_MESSAGE_BYTES) {
            // Cut at the cap: the body is incomplete, import headers only.
            truncated.push(message.uid);
            settled.add(message.uid);

            continue;
          }
          settled.add(message.uid);
          try {
            const email = await normalize(
              message,
              message.source,
              Array.from(message.flags || [])
            );
            done.set(message.uid, email);
          } catch {
            // A message that cannot be parsed would otherwise block the folder
            // forever; skip it (the cursor moves past its UID).
            done.set(message.uid, null);
            logger.warn(
              { accountId, folder: folder.path, uid: message.uid },
              "email imap: message could not be parsed, skipped"
            );
          }
        }
      }

      await importHeadersOnly(truncated);

      if (!stoppedEarly) batchUids.forEach(uid => settled.add(uid));
    }

    // The cursor can only cover a contiguous run of settled messages.
    let lastSettled: number | undefined;
    if (stoppedEarly) {
      // eslint-disable-next-line no-restricted-syntax
      for (const m of selected) {
        if (!settled.has(m.uid)) break;
        lastSettled = m.uid;
      }
    }
    const emails = Array.from(done.entries())
      .filter(([uid]) => lastSettled === undefined || uid <= lastSettled)
      .sort((x, y) => x[0] - y[0])
      .map(([, email]) => email)
      .filter((email): email is NormalizedEmail => email !== null);

    let lastUid: number;
    if (stoppedEarly) lastUid = lastSettled ?? selected[0].uid - 1;
    else if (cut) lastUid = selected[selected.length - 1].uid;
    else lastUid = candidatesEnd;

    const hasMore = cut || stoppedEarly || moreBeyondCandidates;
    return { emails, cursor: cursorAt(lastUid, !hasMore), hasMore };
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
        taken: 0,
        delivered: 0
      };
      let hasMore = false;

      // eslint-disable-next-line no-restricted-syntax
      for (const folder of folders) {
        const result = await syncFolder(
          client,
          account.id,
          folder,
          previous.folders[folder.path],
          budget,
          account.lastSyncAt
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
      const info = await transport.sendMail(toMailOptions(mail));
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

  let transport: Awaited<ReturnType<typeof createSmtpTransport>>;
  try {
    transport = await createSmtpTransport(config);
  } catch (error) {
    if (error instanceof EmailTransientError) throw connectionFailed();
    throw error;
  }
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
