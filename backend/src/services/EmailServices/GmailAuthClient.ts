import { OAuth2Client } from "google-auth-library";
import { Op, WhereOptions } from "sequelize";
import { GmailConfig, getGmailConfig } from "../../config/gmail";
import EmailAccount from "../../models/EmailAccount";
import { logger } from "../../utils/logger";
import { EmailAuthError, EmailTransientError } from "./adapters/errors";
import { gmailFailureReason, isInvalidGrant } from "./gmailErrors";

// Kept apart from GmailOAuthService (which pulls the sync queue) so the Gmail
// adapter (Task 15) can import it from adapters/index.ts without an import cycle.

export const GMAIL_HTTP_TIMEOUT_MS = 15_000;
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// Error reading lives in gmailErrors.ts (shared with the Gmail API adapter);
// gmailFailureReason stays importable from here.
export { gmailFailureReason };

// invalid_grant = the refresh token was revoked/expired/the password changed:
// only a new consent fixes it. Anything else (network, 5xx, a misconfigured
// client) is transient for the account.
const toGmailFailure = (err: unknown): Error => {
  if (err instanceof EmailAuthError || err instanceof EmailTransientError) {
    return err;
  }
  if (isInvalidGrant(err)) {
    return new EmailAuthError();
  }
  return new EmailTransientError(
    "ERR_EMAIL_TRANSIENT",
    gmailFailureReason(err)
  );
};

// OAuth2Client that maps refresh failures to our error classes (so every path
// that refreshes - getAccessToken, request, getRequestHeaders - throws
// EmailAuthError on invalid_grant) and remembers a rotated refresh token.
export class GmailAuthClient extends OAuth2Client {
  // Set when Google answers a refresh with a different refresh token. It is
  // NOT written to the database here (ruling R23: nothing inside a sync round
  // may write the EmailAccount row). See persistRotatedRefreshToken.
  rotatedRefreshToken: string | null = null;

  protected async refreshTokenNoCache(refreshToken?: string | null) {
    let response: Awaited<ReturnType<OAuth2Client["refreshToken"]>>;
    try {
      response = await super.refreshTokenNoCache(refreshToken);
    } catch (err) {
      throw toGmailFailure(err);
    }
    const rotated = response.tokens.refresh_token;
    if (rotated && rotated !== refreshToken) this.rotatedRefreshToken = rotated;
    return response;
  }
}

export const createGmailOAuthClient = (
  config: GmailConfig = getGmailConfig()
): GmailAuthClient =>
  new GmailAuthClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    transporterOptions: { timeout: GMAIL_HTTP_TIMEOUT_MS }
  });

// OAuth2 client for a connected Gmail account, refreshing its access token on
// demand. `account` must be loaded with EmailAccount.scope("withSecrets").
// Throws EmailAuthError when there is no refresh token; refresh failures with
// invalid_grant surface as EmailAuthError from the client's calls.
export const getGmailAuthClient = (account: EmailAccount): GmailAuthClient => {
  const config = getGmailConfig();
  if (!config.enabled) {
    throw new EmailTransientError("ERR_GMAIL_NOT_CONFIGURED");
  }
  const refreshToken = account.getCredentials()?.refreshToken;
  if (!refreshToken) throw new EmailAuthError("ERR_EMAIL_CREDENTIALS_MISSING");

  const client = createGmailOAuthClient(config);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
};

// Ruling R23 choice: a rotated refresh token is persisted only OUTSIDE a sync
// round. Callers (the Gmail adapter's send path, or the sync worker AFTER the
// round's final status write) call this with the same account instance; it
// writes only `credentials`, guarded by the account's current updatedAt and a
// non-disabled status, so it never overwrites a reconnect or resurrects a
// disconnected account. Returns false when there was nothing to write or the
// row changed meanwhile (the old token keeps working until Google drops it).
export const persistRotatedRefreshToken = async (
  account: EmailAccount,
  client: GmailAuthClient
): Promise<boolean> => {
  const rotated = client.rotatedRefreshToken;
  if (!rotated) return false;

  const previous = account.getDataValue("credentials");
  account.setCredentials({
    ...(account.getCredentials() || {}),
    refreshToken: rotated
  });
  const [affected, rows] = (await EmailAccount.update(
    { credentials: account.getDataValue("credentials") },
    {
      where: {
        id: account.id,
        provider: "gmail_api",
        status: { [Op.ne]: "disabled" },
        updatedAt: account.updatedAt
      },
      returning: ["updatedAt"]
    }
  )) as unknown as [number, Pick<EmailAccount, "updatedAt">[]?];

  if (!affected) {
    account.setDataValue("credentials", previous);
    logger.warn(
      { companyId: account.companyId, emailAccountId: account.id },
      "Rotated Gmail refresh token not saved: the account changed meanwhile"
    );
    return false;
  }
  client.rotatedRefreshToken = null;
  account.set({ updatedAt: rows?.[0]?.updatedAt ?? new Date() });
  return true;
};

// Revoking a token removes the whole grant of that Google account for our
// OAuth client, which would also cut off another company connected to the
// same mailbox (each company keeps its own row and refresh token).
export const gmailGrantInUse = async (
  address: string,
  excludeAccountId?: number
): Promise<boolean> => {
  const where: WhereOptions = {
    provider: "gmail_api",
    address,
    status: { [Op.ne]: "disabled" }
  };
  if (excludeAccountId) where.id = { [Op.ne]: excludeAccountId };
  return (await EmailAccount.count({ where })) > 0;
};

// POST https://oauth2.googleapis.com/revoke with the token in the form body,
// never in the URL (OAuth2Client.revokeToken puts it in the query string).
export const revokeGoogleToken = async (token: string): Promise<void> => {
  const { transporter } = new OAuth2Client({
    transporterOptions: { timeout: GMAIL_HTTP_TIMEOUT_MS }
  });
  await transporter.request({
    url: REVOKE_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({ token }),
    retry: false
  });
};

// Best effort: never throws, logs only ids and a fixed reason.
export const revokeGmailAccount = async (
  account: EmailAccount
): Promise<void> => {
  if (account.provider !== "gmail_api") return;
  const context = { companyId: account.companyId, emailAccountId: account.id };
  try {
    const refreshToken = account.getCredentials()?.refreshToken;
    if (!refreshToken) {
      logger.info(context, "No Gmail token to revoke");
      return;
    }
    if (await gmailGrantInUse(account.address, account.id)) {
      logger.info(
        context,
        "Gmail grant kept: the mailbox is still connected in another account"
      );
      return;
    }
    await revokeGoogleToken(refreshToken);
  } catch (err) {
    logger.warn(
      { ...context, reason: gmailFailureReason(err) },
      "Could not revoke Gmail token"
    );
  }
};
