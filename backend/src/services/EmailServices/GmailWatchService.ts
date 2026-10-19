import { Op } from "sequelize";
import { getGmailConfig } from "../../config/gmail";
import {
  runtimeCompanyWhere,
  runtimeOwnsCompany
} from "../../helpers/tenantRuntime";
import EmailAccount from "../../models/EmailAccount";
import { logger } from "../../utils/logger";
import { gmailApiFor } from "./adapters/GmailApiAdapter";
import { emailEnabledForCompany } from "./EmailAccessService";
import {
  GMAIL_HTTP_TIMEOUT_MS,
  getGmailAuthClient,
  gmailFailureReason,
  gmailGrantInUse,
  persistRotatedRefreshToken
} from "./GmailAuthClient";

// Gmail push (Task 16). With GMAIL_PUBSUB_TOPIC set, every active Gmail
// account asks Google to publish a notification on that topic whenever its
// INBOX or SENT changes (users.watch). The push webhook
// (POST /webhooks/gmail/push) then enqueues a sync of the account, so mail
// arrives in seconds instead of on the next minute tick. Polling stays on
// either way: push only brings a round forward, and a missed notification
// costs at most one tick.
//
// A watch lasts 7 days; GmailWatchRenew renews it daily (queues/email.ts).
// Nothing here runs inside a sync round (ruling R23), and the only column
// written is watchExpiresAt (plus a rotated refresh token through the guarded
// persistRotatedRefreshToken).

// Same labels as the ingestion (ruling R31) and the IMAP folders.
export const GMAIL_WATCH_LABELS = ["INBOX", "SENT"];
export const WATCH_RENEW_WINDOW_MS = 48 * 60 * 60 * 1000;

const context = (account: EmailAccount) => ({
  companyId: account.companyId,
  emailAccountId: account.id
});

// Push needs all three variables: with only the topic, Gmail would publish
// to a webhook that answers 404 (it cannot authenticate Pub/Sub without the
// audience and service account), and Pub/Sub would keep redelivering.
export const gmailPushConfigured = (): boolean => {
  const { pubsubTopic, pubsubAudience, pubsubServiceAccount } =
    getGmailConfig();
  return Boolean(pubsubTopic && pubsubAudience && pubsubServiceAccount);
};

// Finish step (OAuth connect): a short wait, the user is looking at the
// screen. A watch missed there is set by the startup/daily renewal.
export const GMAIL_WATCH_CONNECT_TIMEOUT_MS = 5_000;

export type WatchOptions = { timeoutMs?: number };

// Never throws. A rotated refresh token is saved only through the guarded
// helper (current updatedAt, non-disabled row).
const persistToken = async (
  account: EmailAccount,
  client: ReturnType<typeof getGmailAuthClient>
): Promise<void> => {
  if (!client.rotatedRefreshToken) return;
  try {
    await persistRotatedRefreshToken(account, client);
  } catch (err) {
    logger.warn(
      { ...context(account), reason: gmailFailureReason(err) },
      "Could not save rotated Gmail refresh token"
    );
  }
};

const parseExpiration = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (!/^\d{1,16}$/.test(String(value))) return null;
  const at = new Date(Number(value));
  return Number.isNaN(at.getTime()) ? null : at;
};

// Starts (or renews: a new watch replaces the mailbox's current one) the push
// watch of a Gmail account. `account` must carry its credentials (loaded with
// EmailAccount.scope("withSecrets"), or the instance just saved by the OAuth
// finish step). Best effort: never throws and logs only ids and a short
// reason; returns whether the watch is in place. Does nothing unless push is
// fully configured (gmailPushConfigured). `timeoutMs` bounds the watch call
// (default GMAIL_HTTP_TIMEOUT_MS).
//
// watchExpiresAt is written with `silent` (updatedAt untouched), so an
// in-flight sync round keeps its final write (R23), and only while the row is
// still an active gmail_api account: a disconnect or a reauth that happened
// during the call is never undone, and no other column is touched.
export const watchGmailAccount = async (
  account: EmailAccount,
  { timeoutMs = GMAIL_HTTP_TIMEOUT_MS }: WatchOptions = {}
): Promise<boolean> => {
  if (!gmailPushConfigured() || account.provider !== "gmail_api") {
    return false;
  }
  const topicName = getGmailConfig().pubsubTopic;

  let client: ReturnType<typeof getGmailAuthClient>;
  try {
    client = getGmailAuthClient(account);
  } catch (err) {
    logger.warn(
      { ...context(account), reason: gmailFailureReason(err) },
      "Gmail watch skipped"
    );
    return false;
  }

  try {
    const { data } = await gmailApiFor(client).users.watch(
      {
        userId: "me",
        requestBody: {
          topicName,
          labelIds: GMAIL_WATCH_LABELS,
          labelFilterBehavior: "include"
        }
      },
      { timeout: timeoutMs, retry: false }
    );
    const expiresAt = parseExpiration(data?.expiration);
    if (!expiresAt) {
      logger.warn(context(account), "Gmail watch answered without expiration");
      return false;
    }
    const [affected] = await EmailAccount.update(
      { watchExpiresAt: expiresAt },
      {
        where: { id: account.id, provider: "gmail_api", status: "active" },
        silent: true
      }
    );
    if (!affected) {
      logger.info(
        context(account),
        "Gmail watch expiry not saved: the account is no longer active"
      );
      return false;
    }
    account.setDataValue("watchExpiresAt", expiresAt);
    return true;
  } catch (err) {
    // invalid_grant / 401 included: the sync round of the minute tick marks
    // the account for reauth; nothing about the account status is decided
    // here.
    logger.warn(
      { ...context(account), reason: gmailFailureReason(err) },
      "Could not start Gmail watch"
    );
    return false;
  } finally {
    await persistToken(account, client);
  }
};

// Stops the push watch of an account being disconnected. Called by
// disableEmailAccount BEFORE the credentials are wiped (and before the token
// is revoked). Skipped when no watch is known to be running, and while
// another non-disabled gmail_api row (another company) shares the mailbox:
// a watch belongs to the mailbox, not to our row, so stopping it would also
// cut that company's push. Best effort: never throws.
export const stopGmailWatch = async (account: EmailAccount): Promise<void> => {
  if (account.provider !== "gmail_api") return;
  // watchExpiresAt is set only after Google confirmed a watch for this row
  // (and cleared on disable/reconnect from disabled). Null or past means this
  // row never started a watch or it already expired at Google, so there is
  // nothing of ours to stop, and calling users.stop anyway could cut a watch
  // that another company's row of the same mailbox started.
  const expiresAt = account.watchExpiresAt
    ? new Date(account.watchExpiresAt).getTime()
    : NaN;
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) return;

  try {
    if (await gmailGrantInUse(account.address, account.id)) {
      logger.info(
        context(account),
        "Gmail watch kept: the mailbox is still connected in another account"
      );
      return;
    }
    if (!account.getCredentials()?.refreshToken) return;
    const client = getGmailAuthClient(account);
    await gmailApiFor(client).users.stop(
      { userId: "me" },
      { timeout: GMAIL_HTTP_TIMEOUT_MS, retry: false }
    );
  } catch (err) {
    logger.warn(
      { ...context(account), reason: gmailFailureReason(err) },
      "Could not stop Gmail watch"
    );
  }
};

// Daily job: renews the watch of every active Gmail account whose watch is
// unknown or ends within 48 h, in companies this runtime owns and where the
// email channel is enabled. Returns how many watches were renewed. Does
// nothing unless push is fully configured (gmailPushConfigured).
export const renewExpiringWatches = async (): Promise<number> => {
  if (!gmailPushConfigured()) return 0;

  const limit = new Date(Date.now() + WATCH_RENEW_WINDOW_MS);
  const accounts = await EmailAccount.scope("withSecrets").findAll({
    where: {
      [Op.and]: [
        { provider: "gmail_api", status: "active" },
        {
          [Op.or]: [
            { watchExpiresAt: null },
            { watchExpiresAt: { [Op.lt]: limit } }
          ]
        },
        runtimeCompanyWhere()
      ]
    },
    order: [["id", "ASC"]]
  });

  const enabled = new Map<number, boolean>();
  let renewed = 0;
  // Sequential on purpose: a handful of small calls per day, no burst on the
  // Gmail API quota.
  // eslint-disable-next-line no-restricted-syntax
  for (const account of accounts) {
    if (!runtimeOwnsCompany(account.companyId)) continue;
    if (!enabled.has(account.companyId)) {
      let on = false;
      try {
        on = await emailEnabledForCompany(account.companyId);
      } catch {
        on = false;
      }
      enabled.set(account.companyId, on);
    }
    if (!enabled.get(account.companyId)) continue;
    if (await watchGmailAccount(account)) renewed += 1;
  }
  return renewed;
};
