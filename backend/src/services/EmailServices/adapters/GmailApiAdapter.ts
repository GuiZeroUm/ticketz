import { Readable } from "stream";
import { gmail as createGmailApi, gmail_v1 } from "@googleapis/gmail";
import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer";
import type EmailAccount from "../../../models/EmailAccount";
import { logger } from "../../../utils/logger";
import {
  GmailAuthClient,
  getGmailAuthClient,
  persistRotatedRefreshToken
} from "../GmailAuthClient";
import {
  HttpFailure,
  gmailFailureReason,
  gmailReasonsOf,
  gmailStatusOf,
  isAbortFailure,
  isInvalidGrant,
  networkCodeOf
} from "../gmailErrors";
import {
  INITIAL_IMPORT_MAX,
  MAX_RAW_MESSAGE_BYTES,
  SYNC_BATCH_MAX,
  SYNC_ROUND_MAX_BYTES
} from "../limits";
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

// Gmail API provider (OAuth, scopes gmail.readonly + gmail.send only).
//
// Cursor: { historyId, initial?, pending? }
//  - no cursor: initial import (last day, at most INITIAL_IMPORT_MAX messages)
//    from the historyId read BEFORE listing, then history.list from it in the
//    same round, which closes the race window (duplicates are dropped by the
//    ingestion, unique per providerMessageId);
//  - initial + pending: an initial import cut by the round budget, resumed
//    with the remaining message ids (oldest first);
//  - historyId: incremental, history.list(messageAdded) since it. An expired
//    historyId (HTTP 404) restarts as an initial import from the current one.
// Nothing here writes the EmailAccount row (ruling R23): a refresh token
// rotated during a round is persisted by afterRound, after the round's final
// status write.

type GmailCursor = { historyId: string; initial?: boolean; pending?: string[] };

type GmailApi = gmail_v1.Gmail;

type RoundBudget = {
  messages: number;
  bytes: number;
  // units (history records / initial ids) already taken this round; the
  // first one is always taken, whatever its size
  taken: number;
};

type Unit = { recordId?: string; ids: string[] };

type MessageMeta = {
  id: string;
  threadId?: string;
  labelIds: string[];
  sizeEstimate: number;
  internalDate?: string;
};

// Only the mailboxes we ingest (R31/R33), so archived or filtered mail does
// not take the INITIAL_IMPORT_MAX slots; isIngestible stays the authority.
export const GMAIL_INITIAL_QUERY = "newer_than:1d {in:inbox in:sent} -in:chats";
const SKIP_LABELS = ["DRAFT", "SPAM", "TRASH", "CHAT"];

// A message body can be up to MAX_RAW_MESSAGE_BYTES (base64url in JSON): the
// default 15 s client timeout is for small calls only.
const RAW_TIMEOUT_MS = 120_000;
// Upload time grows with the message: base + time per MiB (about 1 Mbit/s),
// capped, so a large send on a slow uplink is not cut and marked ambiguous.
const SEND_TIMEOUT_BASE_MS = 120_000;
const SEND_TIMEOUT_PER_MIB_MS = 8_000;
const SEND_TIMEOUT_MAX_MS = 10 * 60_000;
export const gmailSendTimeoutMs = (bytes: number): number =>
  Math.min(
    SEND_TIMEOUT_MAX_MS,
    SEND_TIMEOUT_BASE_MS +
      Math.ceil(bytes / (1024 * 1024)) * SEND_TIMEOUT_PER_MIB_MS
  );
// Passed as maxContentLength on the raw download. gaxios only enforces it when
// the response has a Content-Length header (Google's gzip responses usually do
// not), so it is a backstop: the real bound is sizeEstimate, checked before
// downloading, and the decoded size, checked after.
const RAW_RESPONSE_MAX_BYTES =
  Math.ceil((MAX_RAW_MESSAGE_BYTES * 4) / 3) + 1024 * 1024;
// Above this the MIME goes through the upload endpoint (multipart, up to
// 35 MB at Google) instead of a base64url string in the JSON body.
export const GMAIL_RAW_JSON_MAX_BYTES = 4 * 1024 * 1024;
// history.list pages read per round (each up to SYNC_BATCH_MAX records).
const HISTORY_PAGES_MAX = 20;
// Weight charged for a message imported as headers only.
const HEADERS_ONLY_WEIGHT_BYTES = 64 * 1024;

// Failures where the request surely never reached Google (no connection or
// TLS handshake failed): a send can be retried safely.
const PRE_SEND_CODES = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EADDRNOTAVAIL",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "ERR_TLS_CERT_ALTNAME_INVALID"
];

// 403 reasons that are quota/rate limits (retry later), not a refusal.
const RATE_LIMIT_REASONS = [
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "RATE_LIMIT_EXCEEDED",
  "RESOURCE_EXHAUSTED"
];
// 403 reasons meaning the grant lacks a scope: only a new consent fixes it.
const SCOPE_REASONS = [
  "insufficientPermissions",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT"
];

const PROGRAMMING_ERRORS = [
  "TypeError",
  "ReferenceError",
  "RangeError",
  "SyntaxError"
];

const isOurError = (err: unknown): boolean =>
  err instanceof EmailAuthError ||
  err instanceof EmailTransientError ||
  err instanceof EmailSendRejectedError ||
  err instanceof EmailSendAmbiguousError;

// Secret-free log of an unexpected error: a GaxiosError carries the request
// config (Authorization header) and Google's text, so only fixed fields go
// out; a stack only for programming errors, which are ours.
const logUnexpected = (accountId: number, err: unknown) => {
  const e = (err || {}) as HttpFailure;
  const name = typeof e.name === "string" ? e.name.slice(0, 40) : typeof err;
  const entry: Record<string, unknown> = {
    accountId,
    name,
    reason: gmailFailureReason(err)
  };
  if (PROGRAMMING_ERRORS.includes(name) && typeof e.stack === "string") {
    entry.stack = e.stack;
  }
  logger.warn(entry, "email gmail: unexpected error");
};

const isAuthFailure = (err: unknown): boolean => {
  const status = gmailStatusOf(err);
  return (
    status === 401 ||
    isInvalidGrant(err) ||
    (status === 403 && gmailReasonsOf(err).some(r => SCOPE_REASONS.includes(r)))
  );
};

// fetch: 401/invalid_grant/missing scope → EmailAuthError; everything else
// (429, 5xx, network, unexpected) → EmailTransientError.
export const mapGmailFetchError = (err: unknown, accountId: number): Error => {
  if (isOurError(err)) return err as Error;
  if (isAuthFailure(err)) return new EmailAuthError();
  const status = gmailStatusOf(err);
  if (status === undefined && !networkCodeOf(err) && !isAbortFailure(err)) {
    logUnexpected(accountId, err);
  }
  return new EmailTransientError(undefined, gmailFailureReason(err));
};

// send: decides whether the message may have left.
//  - Google answered 400/403 → rejected (ERR_GMAIL_SEND_<status>); 403 rate
//    limits are transient and a missing scope needs re-authentication;
//  - 429 / 5xx with a response → transient (not accepted);
//  - other 4xx → rejected (ERR_EMAIL_REJECTED, status in reason);
//  - no response: connection never made → transient; timeout, reset or
//    anything else → ambiguous (never resent).
export const mapGmailSendError = (err: unknown, accountId: number): Error => {
  if (isOurError(err)) return err as Error;
  if (isAuthFailure(err)) return new EmailAuthError();
  const status = gmailStatusOf(err);
  if (status !== undefined) {
    const tag = `${status}`;
    if (
      status === 403 &&
      gmailReasonsOf(err).some(r => RATE_LIMIT_REASONS.includes(r))
    ) {
      return new EmailTransientError(undefined, `HTTP_${tag}`);
    }
    if (status === 400 || status === 403) {
      return new EmailSendRejectedError(`ERR_GMAIL_SEND_${tag}`, tag);
    }
    if (status === 429 || status >= 500) {
      return new EmailTransientError(undefined, `HTTP_${tag}`);
    }
    if (status >= 400)
      return new EmailSendRejectedError("ERR_EMAIL_REJECTED", tag);
    // 2xx/3xx that still failed (unreadable body...): it may have been sent.
    return new EmailSendAmbiguousError();
  }
  const code = networkCodeOf(err);
  if (code && PRE_SEND_CODES.includes(code)) {
    return new EmailTransientError(undefined, code);
  }
  if (!code && !isAbortFailure(err)) logUnexpected(accountId, err);
  return new EmailSendAmbiguousError();
};

// ------------------------------------------------------------------ helpers

const parseCursor = (raw: unknown): GmailCursor | null => {
  const source = raw as Partial<GmailCursor> | null;
  if (
    !source ||
    typeof source.historyId !== "string" ||
    !/^\d{1,20}$/.test(source.historyId)
  ) {
    return null;
  }
  const cursor: GmailCursor = { historyId: source.historyId };
  if (source.initial === true) {
    cursor.initial = true;
    if (Array.isArray(source.pending)) {
      cursor.pending = source.pending
        .filter((id): id is string => typeof id === "string" && id !== "")
        .slice(0, INITIAL_IMPORT_MAX);
    }
  }
  return cursor;
};

// History ids are uint64 decimal strings.
const maxHistoryId = (a: string | undefined, b: string): string =>
  a !== undefined && /^\d{1,20}$/.test(a) && BigInt(a) > BigInt(b) ? a : b;

const hasSkipLabel = (labels: string[]): boolean =>
  labels.some(label => SKIP_LABELS.includes(label));

// Message ids of one history record, deduplicated: messages added, and
// messages that got the INBOX label (R33; other label additions are ignored).
// Labels known from the record already exclude drafts/spam/trash/chats; the
// current labels are checked again before importing (isIngestible).
const historyRecordIds = (record: gmail_v1.Schema$History): string[] => {
  const added = (record.messagesAdded || []).map(entry => entry.message);
  const toInbox = (record.labelsAdded || [])
    .filter(entry => (entry.labelIds || []).includes("INBOX"))
    .map(entry => entry.message);
  const ids: string[] = [];
  [...added, ...toInbox].forEach(message => {
    if (
      message?.id &&
      !hasSkipLabel(message.labelIds || []) &&
      !ids.includes(message.id)
    ) {
      ids.push(message.id);
    }
  });
  return ids;
};

// Ruling R31: the same mailboxes IMAP reads (INBOX and Sent).
const isIngestible = (labels: string[]): boolean =>
  !hasSkipLabel(labels) &&
  (labels.includes("INBOX") || labels.includes("SENT"));

const isOversize = (size: number) => size > MAX_RAW_MESSAGE_BYTES;

// An unknown size is charged as the largest message that can be downloaded.
const weightOf = (size: number): number => {
  if (!(size > 0)) return MAX_RAW_MESSAGE_BYTES;
  return isOversize(size) ? HEADERS_ONLY_WEIGHT_BYTES : size;
};

// The header block of a (possibly truncated) raw message.
const headerBlock = (prefix: Buffer): Buffer => {
  const text = prefix.toString("latin1");
  const end = text.search(/\r?\n\r?\n/);
  const block =
    end >= 0 ? text.slice(0, end) : text.slice(0, text.lastIndexOf("\n") + 1);
  return Buffer.from(`${block}\r\n\r\n`, "latin1");
};

const HEADER_NAME_RE = /^[!-9;-~]{1,100}$/;

// Header block rebuilt from a "metadata" response (no CR/LF injection).
const headersFromMetadata = (
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined
): Buffer => {
  const lines = (headers || [])
    .filter(h => typeof h.name === "string" && HEADER_NAME_RE.test(h.name))
    .map(h => `${h.name}: ${String(h.value || "").replace(/[\r\n]+/g, " ")}`);
  return Buffer.from(`${lines.join("\r\n")}\r\n\r\n`, "utf8");
};

// The RFC 5322 message, as nodemailer's SMTP path would send it. Bcc is never
// set (OutgoingEmail has none).
export const buildGmailMime = async (mail: OutgoingEmail): Promise<Buffer> => {
  const composer = new MailComposer({
    ...toMailOptions(mail),
    // never fetch a URL while composing (attachments are local files)
    disableUrlAccess: true
  });
  try {
    return await composer.compile().build();
  } catch {
    throw new EmailSendRejectedError("ERR_EMAIL_INVALID_MESSAGE", "compose");
  }
};

// Seam for tests: the Gmail API client bound to an account's OAuth client.
export const gmailApiFor = (auth: GmailAuthClient): GmailApi =>
  createGmailApi({ version: "v1", auth });

// ---------------------------------------------------------------- one round

class GmailSyncRound {
  readonly emails: NormalizedEmail[] = [];

  // Message ids taken this round (fetched or deliberately skipped).
  private readonly handled = new Set<string>();

  private readonly budget: RoundBudget = {
    messages: SYNC_BATCH_MAX,
    bytes: SYNC_ROUND_MAX_BYTES,
    taken: 0
  };

  constructor(
    private readonly api: GmailApi,
    private readonly accountId: number
  ) {}

  private exhausted(): boolean {
    return (
      this.budget.taken > 0 &&
      (this.budget.messages <= 0 || this.budget.bytes <= 0)
    );
  }

  async run(previous: GmailCursor | null): Promise<{
    cursor: GmailCursor;
    hasMore: boolean;
  }> {
    let state = previous || (await this.startInitial());
    let resynced = false;

    while (true) {
      if (state.initial) {
        const pending = state.pending ?? (await this.listInitialIds());
        const remaining = await this.processInitial(pending);
        if (remaining.length) {
          return {
            cursor: {
              historyId: state.historyId,
              initial: true,
              pending: remaining
            },
            hasMore: true
          };
        }
        state = { historyId: state.historyId };
      }
      try {
        return await this.followHistory(state.historyId);
      } catch (err) {
        // The stored historyId is too old for Gmail: start over from now.
        if (gmailStatusOf(err) !== 404 || resynced) throw err;
        resynced = true;
        logger.warn(
          { accountId: this.accountId },
          "email gmail: historyId expired, resyncing from the current one"
        );
        state = await this.startInitial();
      }
    }
  }

  // historyId read BEFORE listing: what arrives meanwhile shows up in history.
  private async startInitial(): Promise<GmailCursor> {
    const { data } = await this.api.users.getProfile({ userId: "me" });
    const historyId = data?.historyId ? String(data.historyId) : "";
    if (!/^\d{1,20}$/.test(historyId)) {
      throw new EmailTransientError(undefined, "NO_HISTORY_ID");
    }
    return { historyId, initial: true };
  }

  // Newest first from Gmail; returned oldest first, at most INITIAL_IMPORT_MAX.
  private async listInitialIds(): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await this.api.users.messages.list({
        userId: "me",
        q: GMAIL_INITIAL_QUERY,
        maxResults: INITIAL_IMPORT_MAX,
        ...(pageToken ? { pageToken } : {})
      });
      (data?.messages || []).forEach(message => {
        if (
          message.id &&
          ids.length < INITIAL_IMPORT_MAX &&
          !ids.includes(message.id)
        ) {
          ids.push(message.id);
        }
      });
      pageToken = data?.nextPageToken || undefined;
    } while (pageToken && ids.length < INITIAL_IMPORT_MAX);
    return ids.reverse();
  }

  // Returns the ids left for the next round.
  private async processInitial(ids: string[]): Promise<string[]> {
    for (let i = 0; i < ids.length; i += 1) {
      if (this.exhausted()) return ids.slice(i);
      const taken = await this.processUnit({ ids: [ids[i]] });
      if (!taken) return ids.slice(i);
    }
    return [];
  }

  private async followHistory(startHistoryId: string): Promise<{
    cursor: GmailCursor;
    hasMore: boolean;
  }> {
    // Last history record whose messages were all handled: the resume point.
    let resumeAt = startHistoryId;
    let pageToken: string | undefined;
    // Mailbox historyId when the first page was read: records added while
    // paginating may be missing from later pages, so never move past it
    // without having seen them.
    let firstPageHistoryId: string | undefined;
    const seenTokens = new Set<string>();

    for (let page = 0; ; page += 1) {
      // A misbehaving pagination (endless or repeated tokens) cannot hold
      // the round: continue from what was handled. Ask for an immediate
      // round only when this one made progress; a stuck pagination waits
      // for the next tick instead of re-enqueuing in a tight loop.
      if (
        page >= HISTORY_PAGES_MAX ||
        (pageToken && seenTokens.has(pageToken))
      ) {
        return {
          cursor: { historyId: resumeAt },
          hasMore: resumeAt !== startHistoryId
        };
      }
      if (pageToken) seenTokens.add(pageToken);
      const { data } = await this.api.users.history.list({
        userId: "me",
        startHistoryId,
        // labelAdded (R33): a message moved back to INBOX is new mail for
        // us, as a move-back is a new UID with IMAP.
        historyTypes: ["messageAdded", "labelAdded"],
        maxResults: SYNC_BATCH_MAX,
        ...(pageToken ? { pageToken } : {})
      });
      if (firstPageHistoryId === undefined && data?.historyId) {
        firstPageHistoryId = String(data.historyId);
      }
      const units: Unit[] = (data?.history || []).map(record => ({
        recordId: record.id ? String(record.id) : undefined,
        ids: historyRecordIds(record)
      }));

      // eslint-disable-next-line no-restricted-syntax
      for (const unit of units) {
        if (unit.ids.length) {
          if (this.exhausted())
            return { cursor: { historyId: resumeAt }, hasMore: true };
          const taken = await this.processUnit(unit);
          if (!taken) return { cursor: { historyId: resumeAt }, hasMore: true };
        }
        if (unit.recordId) resumeAt = unit.recordId;
      }

      if (!data?.nextPageToken) {
        return {
          cursor: { historyId: maxHistoryId(firstPageHistoryId, resumeAt) },
          hasMore: false
        };
      }
      if (this.exhausted()) {
        return { cursor: { historyId: resumeAt }, hasMore: true };
      }
      pageToken = data.nextPageToken;
    }
  }

  // One history record (or one initial id) at a time, so the cursor always
  // falls between records. Returns false when the unit does not fit in what is
  // left of the round (nothing of it was imported). A message already handled
  // in this round (added and then labelled INBOX, or imported initially and
  // seen again in the catch-up) is not fetched twice.
  private async processUnit(unit: Unit): Promise<boolean> {
    const ids = unit.ids.filter(id => !this.handled.has(id));
    if (!ids.length) return true;
    const first = this.budget.taken === 0;
    if (!first && ids.length > this.budget.messages) return false;

    const metas: MessageMeta[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const id of ids) {
      const meta = await this.getMeta(id);
      // Current labels (R31): only INBOX or SENT mail, never drafts/spam/
      // trash/chats; mail archived by a filter stays out, as with IMAP.
      if (meta && isIngestible(meta.labelIds)) metas.push(meta);
    }
    const weight = metas.reduce((sum, m) => sum + weightOf(m.sizeEstimate), 0);
    if (!first && weight > this.budget.bytes) return false;

    this.budget.messages -= ids.length;
    this.budget.bytes -= weight;
    this.budget.taken += 1;
    ids.forEach(id => this.handled.add(id));

    // eslint-disable-next-line no-restricted-syntax
    for (const meta of metas) {
      const email = await this.importMessage(meta);
      if (email) this.emails.push(email);
    }
    return true;
  }

  // null: the message no longer exists (deleted between history and get).
  private async getMeta(id: string): Promise<MessageMeta | null> {
    try {
      const { data } = await this.api.users.messages.get({
        userId: "me",
        id,
        format: "minimal"
      });
      return {
        id,
        threadId: data?.threadId || undefined,
        labelIds: data?.labelIds || [],
        sizeEstimate: Number(data?.sizeEstimate) || 0,
        internalDate: data?.internalDate || undefined
      };
    } catch (err) {
      if (gmailStatusOf(err) === 404) return null;
      throw err;
    }
  }

  private async normalize(
    meta: MessageMeta,
    raw: Buffer,
    extraFlags: string[] = []
  ): Promise<NormalizedEmail> {
    const parsed = await simpleParser(raw);
    const internal = new Date(Number(meta.internalDate));
    if (
      !(parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())) &&
      !Number.isNaN(internal.getTime())
    ) {
      parsed.date = internal;
    }
    return normalizeParsedMail(parsed, {
      accountId: this.accountId,
      // Sent from the mailbox (here or in Gmail): the ingestion only lets it
      // into a thread that already has a ticket.
      direction: meta.labelIds.includes("SENT") ? "out" : "in",
      providerMessageId: meta.id,
      providerThreadId: meta.threadId,
      flags: [...meta.labelIds, ...extraFlags],
      ...(meta.internalDate ? { internalDate: internal } : {})
    });
  }

  private async parseOrSkip(
    meta: MessageMeta,
    raw: Buffer,
    headersOnly: boolean
  ): Promise<NormalizedEmail | null> {
    try {
      const email = await this.normalize(
        meta,
        raw,
        headersOnly ? ["oversize"] : []
      );
      if (!headersOnly) return email;
      return { ...email, text: "", htmlSanitized: undefined, attachments: [] };
    } catch {
      // An unparseable message would otherwise block the mailbox forever.
      logger.warn(
        { accountId: this.accountId, providerMessageId: meta.id },
        "email gmail: message could not be parsed, skipped"
      );
      return null;
    }
  }

  // Too large to import whole: keep the envelope, flagged "oversize".
  private async importHeadersOnly(
    meta: MessageMeta
  ): Promise<NormalizedEmail | null> {
    let data: gmail_v1.Schema$Message;
    try {
      ({ data } = await this.api.users.messages.get({
        userId: "me",
        id: meta.id,
        format: "metadata"
      }));
    } catch (err) {
      if (gmailStatusOf(err) === 404) return null;
      throw err;
    }
    return this.parseOrSkip(
      { ...meta, labelIds: data?.labelIds || meta.labelIds },
      headersFromMetadata(data?.payload?.headers),
      true
    );
  }

  private async importMessage(
    meta: MessageMeta
  ): Promise<NormalizedEmail | null> {
    if (isOversize(meta.sizeEstimate)) return this.importHeadersOnly(meta);

    let data: gmail_v1.Schema$Message;
    try {
      ({ data } = await this.api.users.messages.get(
        { userId: "me", id: meta.id, format: "raw" },
        { timeout: RAW_TIMEOUT_MS, maxContentLength: RAW_RESPONSE_MAX_BYTES }
      ));
    } catch (err) {
      if (gmailStatusOf(err) === 404) return null;
      // Google answered 2xx but the body is over our cap (understated size).
      const status = gmailStatusOf(err);
      if (status !== undefined && status >= 200 && status < 300) {
        return this.importHeadersOnly(meta);
      }
      throw err;
    }
    if (!data?.raw) {
      logger.warn(
        { accountId: this.accountId, providerMessageId: meta.id },
        "email gmail: message without content, skipped"
      );
      return null;
    }
    const raw = Buffer.from(data.raw, "base64url");
    // Account for what really crossed the wire, not the estimate.
    this.budget.bytes -= Math.max(0, raw.length - weightOf(meta.sizeEstimate));
    const current = { ...meta, labelIds: data.labelIds || meta.labelIds };
    if (raw.length > MAX_RAW_MESSAGE_BYTES) {
      return this.parseOrSkip(current, headerBlock(raw), true);
    }
    return this.parseOrSkip(current, raw, false);
  }
}

// ---------------------------------------------------------------- the adapter

const sendRaw = (api: GmailApi, raw: Buffer, threadId: string | undefined) => {
  const options = { timeout: gmailSendTimeoutMs(raw.length), retry: false };
  if (raw.length <= GMAIL_RAW_JSON_MAX_BYTES) {
    return api.users.messages.send(
      {
        userId: "me",
        requestBody: {
          raw: raw.toString("base64url"),
          ...(threadId ? { threadId } : {})
        }
      },
      options
    );
  }
  return api.users.messages.send(
    {
      userId: "me",
      requestBody: threadId ? { threadId } : {},
      media: { mimeType: "message/rfc822", body: Readable.from([raw]) }
    },
    options
  );
};

export class GmailApiAdapter implements EmailProviderAdapter {
  // OAuth client used by the last round of an account instance, so afterRound
  // can persist a refresh token Google rotated during it.
  private readonly roundClients = new WeakMap<EmailAccount, GmailAuthClient>();

  async fetchChanges(account: EmailAccount): Promise<{
    emails: NormalizedEmail[];
    cursor: EmailCursor;
    hasMore: boolean;
  }> {
    const client = getGmailAuthClient(account);
    this.roundClients.set(account, client);
    const round = new GmailSyncRound(gmailApiFor(client), account.id);
    try {
      const { cursor, hasMore } = await round.run(
        parseCursor(account.getDataValue("syncCursor"))
      );
      return { emails: round.emails, cursor, hasMore };
    } catch (err) {
      throw mapGmailFetchError(err, account.id);
    }
  }

  // Called by the sync worker after the round's final status write (R23).
  async afterRound(account: EmailAccount): Promise<void> {
    const client = this.roundClients.get(account);
    if (!client) return;
    this.roundClients.delete(account);
    await this.persistToken(account, client);
  }

  async send(
    account: EmailAccount,
    mail: OutgoingEmail
  ): Promise<{ providerMessageId?: string; providerThreadId?: string }> {
    const client = getGmailAuthClient(account);
    try {
      await assertAttachmentsReadable(mail);
      const raw = await buildGmailMime(mail);
      const api = gmailApiFor(client);
      let response: Awaited<ReturnType<typeof sendRaw>>;
      try {
        response = await sendRaw(api, raw, mail.providerThreadId);
      } catch (err) {
        // The thread was deleted in Gmail: 404 means nothing was accepted,
        // so send it once more as a new Gmail thread (headers still thread it).
        if (!mail.providerThreadId || gmailStatusOf(err) !== 404) throw err;
        response = await sendRaw(api, raw, undefined);
      }
      return {
        providerMessageId: response.data?.id || undefined,
        providerThreadId: response.data?.threadId || undefined
      };
    } catch (err) {
      throw mapGmailSendError(err, account.id);
    } finally {
      // A send is not part of a sync round, so it may persist right away.
      await this.persistToken(account, client);
    }
  }

  private async persistToken(
    account: EmailAccount,
    client: GmailAuthClient
  ): Promise<void> {
    if (!client.rotatedRefreshToken) return;
    try {
      await persistRotatedRefreshToken(account, client);
    } catch (err) {
      logger.warn(
        { emailAccountId: account.id, reason: gmailFailureReason(err) },
        "Could not save rotated Gmail refresh token"
      );
    }
  }
}

export default GmailApiAdapter;
