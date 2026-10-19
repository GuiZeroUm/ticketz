import crypto from "crypto";
import { CodeChallengeMethod, Credentials } from "google-auth-library";
import { UniqueConstraintError } from "sequelize";
import AppError from "../../errors/AppError";
import serializeEmailAccount from "../../helpers/SerializeEmailAccount";
import { GMAIL_SCOPES, GmailConfig, getGmailConfig } from "../../config/gmail";
import { isAllowedRedirectOrigin } from "../../helpers/corsOrigin";
import { cacheLayer } from "../../libs/cache";
import EmailAccount from "../../models/EmailAccount";
import Queue from "../../models/Queue";
import { enqueueAccountSync } from "../../queues/email";
import { logger } from "../../utils/logger";
import { emitEmailAccount } from "./EmailAccountStatusService";
import {
  GMAIL_HTTP_TIMEOUT_MS,
  GmailAuthClient,
  createGmailOAuthClient,
  gmailFailureReason,
  gmailGrantInUse,
  revokeGoogleToken
} from "./GmailAuthClient";
import {
  GMAIL_WATCH_CONNECT_TIMEOUT_MS,
  watchGmailAccount
} from "./GmailWatchService";

// Dedicated Gmail OAuth (connect a mailbox), separate from the Clerk login.
// Flow (ruling R27):
//  1. POST /email/oauth/google/start (logged-in admin) -> Google consent URL;
//  2. GET /email/oauth/google/callback (no session: the browser comes back
//     from Google) consumes the state but does NOT exchange the code; it parks
//     {state record, code} under a fresh single-use handle and redirects to
//     <tenant>/connections#email=pending&handle=<handle> (fragment, ruling
//     R32: never sent to servers, access logs or Referer);
//  3. POST /email/oauth/google/finish {handle} (logged-in admin) exchanges the
//     code only when the caller is the same user of the same company that
//     started the flow. A consent URL sent to someone else (phishing) can never
//     attach that person's mailbox to the sender's company.
export {
  getGmailAuthClient,
  persistRotatedRefreshToken,
  revokeGmailAccount
} from "./GmailAuthClient";
export type { GmailAuthClient } from "./GmailAuthClient";

export const GMAIL_STATE_PREFIX = "email:oauth:state:";
export const GMAIL_STATE_TTL_SECONDS = 600;
export const GMAIL_HANDLE_PREFIX = "email:oauth:handle:";
export const GMAIL_HANDLE_TTL_SECONDS = 300;

const STATE_ERROR = "ERR_GMAIL_STATE";
const NOT_CONFIGURED = "ERR_GMAIL_NOT_CONFIGURED";
const SCOPES_MISSING = "ERR_GMAIL_SCOPES_MISSING";
const NO_REFRESH_TOKEN = "ERR_GMAIL_NO_REFRESH_TOKEN";
const OAUTH_FAILED = "ERR_GMAIL_OAUTH_FAILED";
const ACCOUNT_EXISTS = "ERR_EMAIL_ACCOUNT_EXISTS";
const ACCOUNT_MISMATCH = "ERR_GMAIL_ACCOUNT_MISMATCH";
const ACCOUNT_NOT_FOUND = "ERR_EMAIL_ACCOUNT_NOT_FOUND";

const READONLY_SCOPE = GMAIL_SCOPES[0];
const PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

// 32 random bytes in base64url (state and handle).
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const ADDRESS_PATTERN = /^[^\s@<>"',;()]+@[^\s@<>"',;()]+\.[^\s@<>"',;()]+$/;
const MAX_CODE_LENGTH = 2048;
const MAX_ADDRESS_LENGTH = 254;
const MAX_NAME_LENGTH = 255;

// Stored server side only (Redis), consumed once. The origin was validated by
// isAllowedRedirectOrigin when the flow started (ruling R14).
type StateRecord = {
  companyId: number;
  userId: number;
  name: string | null;
  queueId: number | null;
  codeVerifier: string;
  origin: string;
  // Reconnecting this account (R29): the mailbox must be the same address.
  accountId: number | null;
};

// What the callback parks for /finish (Redis only, single use, 300 s).
type PendingRecord = { record: StateRecord; code: string };

type Profile = { address: string; historyId: string };

export type StartGmailOAuthInput = {
  companyId: number;
  userId: number;
  name?: unknown;
  queueId?: unknown;
  // Optional: reconnect this gmail_api account (sends login_hint).
  accountId?: unknown;
  // Origin of the frontend that started the flow (Origin header, else the
  // Referer's origin). Anything not allowed falls back to FRONTEND_URL.
  origin?: string | null;
};

export type CompleteGmailOAuthInput = {
  code?: unknown;
  state?: unknown;
  error?: unknown;
};

export type FinishGmailOAuthInput = {
  handle?: unknown;
  companyId: number;
  userId: number;
};

// A failure with one of our fixed codes (shown translated by the frontend).
class GmailConnectError extends Error {}

const CONNECT_ERROR_STATUS: Record<string, number> = {
  [ACCOUNT_EXISTS]: 409,
  [ACCOUNT_MISMATCH]: 409
};

const randomToken = (): string => crypto.randomBytes(32).toString("base64url");

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const connectionsUrl = (
  origin: string,
  params: Record<string, string>
): string => `${origin}/connections#${new URLSearchParams(params).toString()}`;

const errorUrl = (origin: string, code: string): string =>
  connectionsUrl(origin, { email: "error", code });

// For the controller when everything else failed: FRONTEND_URL, fixed code.
export const gmailFallbackRedirect = (code = OAUTH_FAILED): string =>
  errorUrl(getGmailConfig().frontendUrl, code);

export const requestFrontendOrigin = (
  originHeader?: string,
  referer?: string
): string | null => {
  if (originHeader && originHeader !== "null") return originHeader;
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

const frontendOrigin = (candidate: unknown, config: GmailConfig): string =>
  isAllowedRedirectOrigin(candidate)
    ? (candidate as string)
    : config.frontendUrl;

const parseName = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AppError("ERR_EMAIL_INVALID_ACCOUNT", 400);
  }
  const name = value.trim();
  if (name.length > MAX_NAME_LENGTH) {
    throw new AppError("ERR_EMAIL_INVALID_ACCOUNT", 400);
  }
  return name || null;
};

const queueOfCompany = async (
  companyId: number,
  queueId: number
): Promise<boolean> =>
  Boolean(
    await Queue.findOne({
      where: { id: queueId, companyId },
      attributes: ["id"]
    })
  );

// Same rules as the IMAP/SMTP accounts (EmailAccountService).
const resolveQueueId = async (
  companyId: number,
  value: unknown
): Promise<number | null> => {
  if (value === undefined || value === null || value === "") return null;
  const queueId = Number(value);
  if (
    typeof value === "boolean" ||
    !Number.isInteger(queueId) ||
    queueId < 1 ||
    !(await queueOfCompany(companyId, queueId))
  ) {
    throw new AppError("ERR_QUEUE_NOT_FOUND", 404);
  }
  return queueId;
};

// Only a gmail_api account of the caller's company can be reconnected.
const resolveReconnectAccount = async (
  companyId: number,
  value: unknown
): Promise<EmailAccount | null> => {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  const account =
    typeof value !== "boolean" && Number.isSafeInteger(id) && id > 0
      ? await EmailAccount.findOne({
          where: { id, companyId, provider: "gmail_api" }
        })
      : null;
  if (!account) throw new AppError(ACCOUNT_NOT_FOUND, 404);
  return account;
};

export const StartGmailOAuthService = async ({
  companyId,
  userId,
  name,
  queueId,
  accountId,
  origin
}: StartGmailOAuthInput): Promise<{ url: string }> => {
  const config = getGmailConfig();
  if (!config.enabled) throw new AppError(NOT_CONFIGURED, 503);

  const reconnect = await resolveReconnectAccount(companyId, accountId);
  const record: StateRecord = {
    companyId,
    userId,
    name: parseName(name),
    queueId: await resolveQueueId(companyId, queueId),
    codeVerifier: "",
    origin: frontendOrigin(origin, config),
    accountId: reconnect?.id ?? null
  };

  const client = createGmailOAuthClient(config);
  const { codeVerifier, codeChallenge } =
    await client.generateCodeVerifierAsync();
  record.codeVerifier = codeVerifier;
  const state = randomToken();

  try {
    await cacheLayer.set(
      `${GMAIL_STATE_PREFIX}${state}`,
      JSON.stringify(record),
      "EX",
      GMAIL_STATE_TTL_SECONDS
    );
  } catch {
    logger.warn({ companyId, userId }, "Could not store Gmail OAuth state");
    throw new AppError(OAUTH_FAILED, 503);
  }

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    // Incremental authorization would merge earlier grants of this same
    // client ID into the token; false keeps the granted set exactly
    // gmail.readonly + gmail.send, so the scope check below stays exact.
    include_granted_scopes: false,
    scope: [...GMAIL_SCOPES],
    state,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: codeChallenge,
    ...(reconnect ? { login_hint: reconnect.address } : {})
  });
  return { url };
};

const parseRecord = (value: Partial<StateRecord>): StateRecord | null => {
  try {
    if (
      !isPositiveInteger(value.companyId) ||
      !isPositiveInteger(value.userId) ||
      typeof value.codeVerifier !== "string" ||
      !VERIFIER_PATTERN.test(value.codeVerifier) ||
      typeof value.origin !== "string" ||
      !(value.name === null || typeof value.name === "string") ||
      !(value.queueId === null || isPositiveInteger(value.queueId)) ||
      !(value.accountId == null || isPositiveInteger(value.accountId))
    ) {
      return null;
    }
    return { ...value, accountId: value.accountId ?? null } as StateRecord;
  } catch {
    return null;
  }
};

// Atomic get+del: a state/handle works once, whatever happens next. The
// format is checked before Redis is touched.
const consumeJson = async (
  prefix: string,
  token: unknown
): Promise<Record<string, unknown> | null> => {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  try {
    const raw = await cacheLayer.consume(`${prefix}${token}`);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === "object" ? value : null;
  } catch {
    logger.warn("Could not read Gmail OAuth state");
    return null;
  }
};

const consumeState = async (state: unknown): Promise<StateRecord | null> => {
  const value = await consumeJson(GMAIL_STATE_PREFIX, state);
  return value ? parseRecord(value as Partial<StateRecord>) : null;
};

const validCode = (code: unknown): code is string =>
  typeof code === "string" && code.length > 0 && code.length <= MAX_CODE_LENGTH;

const consumeHandle = async (
  handle: unknown
): Promise<PendingRecord | null> => {
  const value = await consumeJson(GMAIL_HANDLE_PREFIX, handle);
  if (!value) return null;
  const record = parseRecord((value.record || {}) as Partial<StateRecord>);
  return record && validCode(value.code) ? { record, code: value.code } : null;
};

const grantedScopes = (scope: unknown): string[] =>
  typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];

const fetchProfile = async (client: GmailAuthClient): Promise<Profile> => {
  const { data } = await client.request<{
    emailAddress?: unknown;
    historyId?: unknown;
  }>({
    url: PROFILE_URL,
    method: "GET",
    timeout: GMAIL_HTTP_TIMEOUT_MS,
    retry: false
  });
  const address =
    typeof data?.emailAddress === "string"
      ? data.emailAddress.trim().toLowerCase()
      : "";
  const historyId =
    typeof data?.historyId === "string" || typeof data?.historyId === "number"
      ? String(data.historyId)
      : "";
  if (
    !address ||
    address.length > MAX_ADDRESS_LENGTH ||
    !ADDRESS_PATTERN.test(address) ||
    !/^\d{1,30}$/.test(historyId)
  ) {
    throw new GmailConnectError(OAUTH_FAILED);
  }
  return { address, historyId };
};

// Best effort, never throws (ruling R30). Skipped while the mailbox is still
// connected in some account, and skipped when the address is unknown: revoking
// removes the whole grant of that Google account for our client, which could
// cut off another company connected to the same mailbox.
const revokeUnusedGrant = async (
  address: string | null,
  token: string,
  record: StateRecord
): Promise<void> => {
  if (!address) return;
  try {
    if (await gmailGrantInUse(address)) return;
    await revokeGoogleToken(token);
  } catch (err) {
    logger.warn(
      {
        companyId: record.companyId,
        userId: record.userId,
        reason: gmailFailureReason(err)
      },
      "Could not revoke unused Gmail grant"
    );
  }
};

// The user unticked a scope on the consent screen: the token is useless.
const discardPartialGrant = async (
  client: GmailAuthClient,
  tokens: Credentials,
  granted: string[],
  record: StateRecord
): Promise<void> => {
  const token = tokens.refresh_token || tokens.access_token;
  if (!token) return;
  let address: string | null = null;
  if (granted.includes(READONLY_SCOPE) && tokens.access_token) {
    try {
      client.setCredentials({
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date
      });
      ({ address } = await fetchProfile(client));
    } catch {
      // address unknown: nothing is revoked (R30)
    }
  }
  await revokeUnusedGrant(address, token, record);
};

const upsertAccount = async (
  record: StateRecord,
  { address, historyId }: Profile,
  scopes: string[],
  refreshToken: string
): Promise<{ account: EmailAccount; action: "create" | "update" }> => {
  const { companyId, userId } = record;
  if (record.accountId) {
    // Reconnecting a given account (R29): the consent must be for its mailbox.
    // Nothing is revoked: the grant belongs to whatever mailbox was picked.
    const target = await EmailAccount.findOne({
      where: { id: record.accountId, companyId, provider: "gmail_api" }
    });
    if (!target || target.address !== address) {
      throw new GmailConnectError(ACCOUNT_MISMATCH);
    }
  }
  const existing = await EmailAccount.scope("withSecrets").findOne({
    where: { companyId, address }
  });
  // Same rule as EmailAccountService in reverse: an IMAP/SMTP row (even a
  // disabled one) is not turned into a Gmail one, because providerMessageId
  // formats differ and the old messages would be imported again.
  if (existing && existing.provider !== "gmail_api") {
    await revokeUnusedGrant(address, refreshToken, record);
    throw new GmailConnectError(ACCOUNT_EXISTS);
  }

  // The queue may have been deleted while the user was on Google.
  const queueId =
    record.queueId && (await queueOfCompany(companyId, record.queueId))
      ? record.queueId
      : null;
  const initialCursor = { historyId, initial: true };

  let account: EmailAccount;
  let action: "create" | "update";
  if (existing) {
    // Reconnect (reauth or a disabled mailbox): same row, so its tickets stay
    // attached. A live account keeps its cursor (same address = same mailbox,
    // R29) so nothing that arrived while it needed reauth is skipped (Task 15
    // resyncs if the historyId expired); a disabled one starts over like a new
    // connection.
    const wasDisabled = existing.status === "disabled";
    const cursor = existing.getDataValue("syncCursor") as {
      historyId?: unknown;
    } | null;
    const keepCursor = !wasDisabled && typeof cursor?.historyId === "string";
    existing.set({
      preset: "gmail",
      name: record.name || existing.name,
      queueId,
      status: "active",
      scopes,
      errorCount: 0,
      lastError: null,
      connectedByUserId: userId,
      syncCursor: keepCursor ? cursor : initialCursor,
      ...(wasDisabled
        ? { lastSyncAt: null, externalId: null, watchExpiresAt: null }
        : {})
    });
    existing.setCredentials({ refreshToken });
    account = existing;
    action = wasDisabled ? "create" : "update";
  } else {
    account = EmailAccount.build({
      companyId,
      provider: "gmail_api",
      preset: "gmail",
      name: record.name || address,
      address,
      status: "active",
      queueId,
      connectedByUserId: userId,
      scopes,
      errorCount: 0,
      lastError: null,
      syncCursor: initialCursor
    });
    account.setCredentials({ refreshToken });
    action = "create";
  }

  try {
    await account.save();
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      // A concurrent callback connected the same mailbox first.
      await revokeUnusedGrant(address, refreshToken, record);
      throw new GmailConnectError(ACCOUNT_EXISTS);
    }
    throw err;
  }
  return { account, action };
};

const connectMailbox = async (
  config: GmailConfig,
  record: StateRecord,
  code: string
) => {
  const client = createGmailOAuthClient(config);

  let tokens: Credentials;
  try {
    ({ tokens } = await client.getToken({
      code,
      codeVerifier: record.codeVerifier
    }));
  } catch (err) {
    logger.warn(
      {
        companyId: record.companyId,
        userId: record.userId,
        reason: gmailFailureReason(err)
      },
      "Gmail authorization code exchange failed"
    );
    throw new GmailConnectError(OAUTH_FAILED);
  }

  const granted = grantedScopes(tokens.scope);
  if (!GMAIL_SCOPES.every(scope => granted.includes(scope))) {
    await discardPartialGrant(client, tokens, granted, record);
    throw new GmailConnectError(SCOPES_MISSING);
  }
  if (!tokens.refresh_token) throw new GmailConnectError(NO_REFRESH_TOKEN);

  client.setCredentials(tokens);
  const profile = await fetchProfile(client);
  return upsertAccount(record, profile, granted, tokens.refresh_token);
};

// GET callback. Never throws: every outcome is a redirect to the frontend's
// /connections. The state is validated (and consumed) before anything else.
// The code is NOT exchanged here (R27): it is parked with the state record
// under a fresh single-use handle, and the redirect carries only that handle
// (#email=pending&handle=...), never the code or any token. Errors redirect
// with #email=error&code=<fixed code>.
export const CompleteGmailOAuthService = async ({
  code,
  state,
  error
}: CompleteGmailOAuthInput): Promise<{ redirectTo: string }> => {
  const config = getGmailConfig();
  const record = await consumeState(state);
  if (!record) return { redirectTo: errorUrl(config.frontendUrl, STATE_ERROR) };

  // Re-checked: never redirect to an origin that does not pass the rules now.
  const origin = frontendOrigin(record.origin, config);
  const fail = (failure: string) => {
    logger.warn(
      { companyId: record.companyId, userId: record.userId, code: failure },
      "Gmail connection failed"
    );
    return { redirectTo: errorUrl(origin, failure) };
  };

  if (error || !validCode(code)) return fail(STATE_ERROR);
  if (!config.enabled) return fail(NOT_CONFIGURED);

  const handle = randomToken();
  const pending: PendingRecord = { record, code };
  try {
    await cacheLayer.set(
      `${GMAIL_HANDLE_PREFIX}${handle}`,
      JSON.stringify(pending),
      "EX",
      GMAIL_HANDLE_TTL_SECONDS
    );
  } catch {
    return fail(OAUTH_FAILED);
  }
  return { redirectTo: connectionsUrl(origin, { email: "pending", handle }) };
};

// POST finish (isAuth + isAdmin + assertEmailEnabled in the route/controller).
// Consumes the handle first (so a refused attempt cannot be retried), then
// requires the caller to be the user of the company that started the flow.
// Returns the account in the public shape of the account list.
export const FinishGmailOAuthService = async ({
  handle,
  companyId,
  userId
}: FinishGmailOAuthInput) => {
  const pending = await consumeHandle(handle);
  if (!pending) throw new AppError(STATE_ERROR, 400);
  const { record, code } = pending;

  if (record.companyId !== companyId || record.userId !== userId) {
    logger.warn(
      { companyId, userId, startedByCompanyId: record.companyId },
      "Gmail connection finished by another user: refused"
    );
    throw new AppError(OAUTH_FAILED, 403);
  }

  const config = getGmailConfig();
  if (!config.enabled) throw new AppError(NOT_CONFIGURED, 503);

  let result: Awaited<ReturnType<typeof connectMailbox>>;
  try {
    result = await connectMailbox(config, record, code);
  } catch (err) {
    if (err instanceof GmailConnectError) {
      logger.warn(
        { companyId, userId, code: err.message },
        "Gmail connection failed"
      );
      throw new AppError(err.message, CONNECT_ERROR_STATUS[err.message] || 400);
    }
    logger.warn(
      { companyId, userId, reason: gmailFailureReason(err) },
      "Gmail connection failed unexpectedly"
    );
    throw new AppError(OAUTH_FAILED, 502);
  }

  const { account, action } = result;
  // Push watch (Task 16, only with push configured). Best effort and short
  // (5 s): it never throws, the minute tick keeps syncing the account, and a
  // missed watch is set by the startup/daily renewal.
  await watchGmailAccount(account, {
    timeoutMs: GMAIL_WATCH_CONNECT_TIMEOUT_MS
  });
  try {
    await enqueueAccountSync(account.id);
  } catch {
    // The account is saved; the minute tick picks it up anyway.
    logger.warn(
      { companyId: account.companyId, emailAccountId: account.id },
      "Could not enqueue email account sync"
    );
  }
  emitEmailAccount(account, action);
  logger.info(
    { companyId, emailAccountId: account.id, userId },
    "Gmail account connected"
  );
  return serializeEmailAccount(account);
};
