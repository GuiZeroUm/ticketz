import crypto from "crypto";
import { CodeChallengeMethod, Credentials } from "google-auth-library";
import { UniqueConstraintError } from "sequelize";
import AppError from "../../errors/AppError";
import { GMAIL_SCOPES, GmailConfig, getGmailConfig } from "../../config/gmail";
import { isAllowedFrontendOrigin } from "../../helpers/corsOrigin";
import { cacheLayer } from "../../libs/cache";
import EmailAccount from "../../models/EmailAccount";
import Queue from "../../models/Queue";
import { enqueueAccountSync } from "../../queues/email";
import { logger } from "../../utils/logger";
import { emailEnabledForCompany } from "./EmailAccessService";
import { emitEmailAccount } from "./EmailAccountStatusService";
import {
  GMAIL_HTTP_TIMEOUT_MS,
  GmailAuthClient,
  createGmailOAuthClient,
  gmailFailureReason,
  gmailGrantInUse,
  revokeGoogleToken
} from "./GmailAuthClient";

// Dedicated Gmail OAuth (connect a mailbox), separate from the Clerk login.
// Flow: POST /email/oauth/google/start -> Google consent ->
// GET /email/oauth/google/callback -> 302 to <tenant>/connections?email=...
export {
  getGmailAuthClient,
  persistRotatedRefreshToken,
  revokeGmailAccount
} from "./GmailAuthClient";
export type { GmailAuthClient } from "./GmailAuthClient";

export const GMAIL_STATE_PREFIX = "email:oauth:state:";
export const GMAIL_STATE_TTL_SECONDS = 600;

const STATE_ERROR = "ERR_GMAIL_STATE";
const NOT_CONFIGURED = "ERR_GMAIL_NOT_CONFIGURED";
const SCOPES_MISSING = "ERR_GMAIL_SCOPES_MISSING";
const NO_REFRESH_TOKEN = "ERR_GMAIL_NO_REFRESH_TOKEN";
const OAUTH_FAILED = "ERR_GMAIL_OAUTH_FAILED";
const ACCOUNT_EXISTS = "ERR_EMAIL_ACCOUNT_EXISTS";
const CHANNEL_DISABLED = "ERR_EMAIL_CHANNEL_DISABLED";

const READONLY_SCOPE = GMAIL_SCOPES[0];
const PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

// 32 random bytes in base64url.
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const ADDRESS_PATTERN = /^[^\s@<>"',;()]+@[^\s@<>"',;()]+\.[^\s@<>"',;()]+$/;
const MAX_CODE_LENGTH = 2048;
const MAX_ADDRESS_LENGTH = 254;
const MAX_NAME_LENGTH = 255;

// Stored server side only (Redis), consumed once. The origin was validated by
// isAllowedFrontendOrigin when the flow started (ruling R14).
type StateRecord = {
  companyId: number;
  userId: number;
  name: string | null;
  queueId: number | null;
  codeVerifier: string;
  origin: string;
};

type Profile = { address: string; historyId: string };

export type StartGmailOAuthInput = {
  companyId: number;
  userId: number;
  name?: unknown;
  queueId?: unknown;
  // Origin of the frontend that started the flow (Origin header, else the
  // Referer's origin). Anything not allowed falls back to FRONTEND_URL.
  origin?: string | null;
};

export type CompleteGmailOAuthInput = {
  code?: unknown;
  state?: unknown;
  error?: unknown;
};

// A failure with one of our fixed codes, shown by the frontend after the redirect.
class GmailConnectError extends Error {}

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const redirectUrl = (
  origin: string,
  result: "connected" | "error",
  code?: string
): string => {
  const params = new URLSearchParams({ email: result });
  if (code) params.set("code", code);
  return `${origin}/connections?${params.toString()}`;
};

// For the controller when everything else failed: FRONTEND_URL, fixed code.
export const gmailFallbackRedirect = (code = OAUTH_FAILED): string =>
  redirectUrl(getGmailConfig().frontendUrl, "error", code);

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
  isAllowedFrontendOrigin(candidate)
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

export const StartGmailOAuthService = async ({
  companyId,
  userId,
  name,
  queueId,
  origin
}: StartGmailOAuthInput): Promise<{ url: string }> => {
  const config = getGmailConfig();
  if (!config.enabled) throw new AppError(NOT_CONFIGURED, 503);

  const record: StateRecord = {
    companyId,
    userId,
    name: parseName(name),
    queueId: await resolveQueueId(companyId, queueId),
    codeVerifier: "",
    origin: frontendOrigin(origin, config)
  };

  const client = createGmailOAuthClient(config);
  const { codeVerifier, codeChallenge } =
    await client.generateCodeVerifierAsync();
  record.codeVerifier = codeVerifier;
  const state = crypto.randomBytes(32).toString("base64url");

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
    // false: the token must carry only the mail scopes, never merge scopes
    // this Google account granted to other clients/flows (login).
    include_granted_scopes: false,
    scope: [...GMAIL_SCOPES],
    state,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: codeChallenge
  });
  return { url };
};

const parseRecord = (raw: string): StateRecord | null => {
  try {
    const value = JSON.parse(raw) as Partial<StateRecord>;
    if (
      !isPositiveInteger(value.companyId) ||
      !isPositiveInteger(value.userId) ||
      typeof value.codeVerifier !== "string" ||
      !VERIFIER_PATTERN.test(value.codeVerifier) ||
      typeof value.origin !== "string" ||
      !(value.name === null || typeof value.name === "string") ||
      !(value.queueId === null || isPositiveInteger(value.queueId))
    ) {
      return null;
    }
    return value as StateRecord;
  } catch {
    return null;
  }
};

// Atomic get+del: a state works once, whatever happens next.
const consumeState = async (state: unknown): Promise<StateRecord | null> => {
  if (typeof state !== "string" || !STATE_PATTERN.test(state)) return null;
  let raw: string | null;
  try {
    raw = await cacheLayer.consume(`${GMAIL_STATE_PREFIX}${state}`);
  } catch {
    logger.warn("Could not read Gmail OAuth state");
    return null;
  }
  return raw ? parseRecord(raw) : null;
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

// Best effort, never throws. Skipped while the mailbox is still connected in
// some account (revoking would cut that one off too).
const revokeUnusedGrant = async (
  address: string | null,
  token: string,
  record: StateRecord
): Promise<void> => {
  try {
    if (address && (await gmailGrantInUse(address))) return;
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
      // address unknown: revoke anyway
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
    // attached. A live account keeps its cursor so nothing that arrived while
    // it needed reauth is skipped (Task 15 resyncs if the historyId expired);
    // a disabled one starts over like a new connection.
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

// Never throws: every outcome is a redirect to the frontend's /connections
// with ?email=connected or ?email=error&code=<fixed code>. The state is
// validated (and consumed) before anything else; nothing secret (code, state,
// tokens) ever reaches the redirect or the logs.
export const CompleteGmailOAuthService = async ({
  code,
  state,
  error
}: CompleteGmailOAuthInput): Promise<{ redirectTo: string }> => {
  const config = getGmailConfig();
  const record = await consumeState(state);
  if (!record) {
    return {
      redirectTo: redirectUrl(config.frontendUrl, "error", STATE_ERROR)
    };
  }

  // Re-checked: never redirect to an origin that does not pass the rules now.
  const origin = frontendOrigin(record.origin, config);
  const fail = (failure: string) => {
    logger.warn(
      { companyId: record.companyId, userId: record.userId, code: failure },
      "Gmail connection failed"
    );
    return { redirectTo: redirectUrl(origin, "error", failure) };
  };

  if (
    error ||
    typeof code !== "string" ||
    !code ||
    code.length > MAX_CODE_LENGTH
  ) {
    return fail(STATE_ERROR);
  }
  if (!config.enabled) return fail(NOT_CONFIGURED);

  try {
    // The super admin may have switched the channel off meanwhile.
    if (!(await emailEnabledForCompany(record.companyId))) {
      return fail(CHANNEL_DISABLED);
    }

    const { account, action } = await connectMailbox(config, record, code);

    // Extension point (Task 16): watchGmailAccount(account) goes here.
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
      {
        companyId: account.companyId,
        emailAccountId: account.id,
        userId: record.userId
      },
      "Gmail account connected"
    );
    return { redirectTo: redirectUrl(origin, "connected") };
  } catch (err) {
    if (err instanceof GmailConnectError) return fail(err.message);
    logger.warn(
      {
        companyId: record.companyId,
        userId: record.userId,
        reason: gmailFailureReason(err)
      },
      "Gmail connection failed unexpectedly"
    );
    return { redirectTo: redirectUrl(origin, "error", OAUTH_FAILED) };
  }
};
