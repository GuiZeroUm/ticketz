import { Op } from "sequelize";
import {
  runtimeCompanyWhere,
  runtimeOwnsCompany
} from "../../helpers/tenantRuntime";
import EmailAccount from "../../models/EmailAccount";
import { enqueueAccountSync, markSyncDirtyIfActive } from "../../queues/email";
import { logger } from "../../utils/logger";
import { emailEnabledForCompany } from "./EmailAccessService";

// Work behind POST /webhooks/gmail/push (Task 16), once the controller has
// authenticated Pub/Sub and answered 204.

const MAX_ADDRESS_LENGTH = 254;
const ADDRESS_PATTERN = /^[^\s@<>"',;()]+@[^\s@<>"',;()]+\.[^\s@<>"',;()]+$/;
const MAX_DATA_LENGTH = 4096;

// { message: { data: base64(JSON { emailAddress, historyId }) } } -> address,
// or null when the body is not a Gmail notification. The historyId is not
// used: the sync round starts from the account's saved cursor.
export const pushedAddress = (body: unknown): string | null => {
  const data = (body as { message?: { data?: unknown } } | null)?.message?.data;
  if (typeof data !== "string" || !data || data.length > MAX_DATA_LENGTH) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    const address =
      typeof decoded?.emailAddress === "string"
        ? decoded.emailAddress.trim().toLowerCase()
        : "";
    return address &&
      address.length <= MAX_ADDRESS_LENGTH &&
      ADDRESS_PATTERN.test(address)
      ? address
      : null;
  } catch {
    return null;
  }
};

// Unknown (setting/company lookup failed) counts as disabled for this
// notification: the minute tick retries the company anyway.
const companyEnabled = async (companyId: number): Promise<boolean> => {
  try {
    return await emailEnabledForCompany(companyId);
  } catch {
    logger.warn({ companyId }, "Could not check the email channel for push");
    return false;
  }
};

// Every active Gmail account with that address (the same mailbox can be
// connected by several companies), in companies this runtime owns with the
// email channel enabled. Returns how many syncs were enqueued. The jobId of
// enqueueAccountSync (`sync-<id>`) collapses duplicate notifications. A
// failing company or enqueue never stops the others.
export const dispatchGmailPush = async (address: string): Promise<number> => {
  const accounts = await EmailAccount.findAll({
    attributes: ["id", "companyId"],
    where: {
      [Op.and]: [
        { provider: "gmail_api", status: "active", address },
        runtimeCompanyWhere()
      ]
    }
  });

  const enabled = new Map<number, boolean>();
  let enqueued = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const account of accounts) {
    if (!runtimeOwnsCompany(account.companyId)) continue;
    if (!enabled.has(account.companyId)) {
      enabled.set(account.companyId, await companyEnabled(account.companyId));
    }
    if (!enabled.get(account.companyId)) continue;
    try {
      await enqueueAccountSync(account.id);
      enqueued += 1;
    } catch {
      logger.warn(
        { companyId: account.companyId, emailAccountId: account.id },
        "Could not enqueue email sync from Gmail push"
      );
      continue;
    }
    // The add is dropped while this account's round is running (same jobId),
    // and that round may already have read the history: flag it so the
    // round's completion queues another one (same as IMAP IDLE).
    try {
      await markSyncDirtyIfActive(account.id);
    } catch {
      logger.warn(
        { companyId: account.companyId, emailAccountId: account.id },
        "Could not flag email sync from Gmail push"
      );
    }
  }
  return enqueued;
};
