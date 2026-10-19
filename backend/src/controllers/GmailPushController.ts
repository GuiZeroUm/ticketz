import express, { Request, RequestHandler, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { Op } from "sequelize";
import { getGmailConfig } from "../config/gmail";
import {
  runtimeCompanyWhere,
  runtimeOwnsCompany
} from "../helpers/tenantRuntime";
import EmailAccount from "../models/EmailAccount";
import { enqueueAccountSync } from "../queues/email";
import { emailEnabledForCompany } from "../services/EmailServices/EmailAccessService";
import { GMAIL_HTTP_TIMEOUT_MS } from "../services/EmailServices/GmailAuthClient";
import { logger } from "../utils/logger";

// POST /webhooks/gmail/push: Pub/Sub push subscription of the Gmail watch
// topic (Task 16, setup in docs/email-channel.md). No session: the caller is
// Google, authenticated by the OIDC token Pub/Sub signs for the subscription's
// service account.
//
// Answers:
//  - 404 when push is not configured (GMAIL_PUBSUB_TOPIC, _AUDIENCE and
//    _SERVICE_ACCOUNT all needed): the endpoint does not exist for callers;
//  - 401 when the token is missing/invalid, has another audience, or is not
//    a verified token of the configured service account;
//  - 204 otherwise, sent BEFORE the work, malformed body included: a 4xx/5xx
//    makes Pub/Sub redeliver, and the minute tick covers anything missed.
// The payload is never echoed or logged.

export const GMAIL_PUSH_PATH = "/webhooks/gmail/push";
// A Gmail notification is ~200 bytes of JSON (base64 inside a Pub/Sub
// envelope). Anything near this limit is not one.
export const GMAIL_PUSH_BODY_LIMIT = "64kb";

const MAX_ADDRESS_LENGTH = 254;
const ADDRESS_PATTERN = /^[^\s@<>"',;()]+@[^\s@<>"',;()]+\.[^\s@<>"',;()]+$/;
const MAX_DATA_LENGTH = 4096;

type PushConfig = {
  topic: string;
  audience: string;
  serviceAccount: string;
};

const pushConfig = (): PushConfig | null => {
  const { pubsubTopic, pubsubAudience, pubsubServiceAccount } =
    getGmailConfig();
  if (!pubsubTopic || !pubsubAudience || !pubsubServiceAccount) return null;
  return {
    topic: pubsubTopic,
    audience: pubsubAudience,
    serviceAccount: pubsubServiceAccount.toLowerCase()
  };
};

// One client for the process: it caches Google's signing certificates.
let verifierClient: OAuth2Client | null = null;
const verifier = (): OAuth2Client => {
  if (!verifierClient) {
    verifierClient = new OAuth2Client({
      transporterOptions: { timeout: GMAIL_HTTP_TIMEOUT_MS }
    });
  }
  return verifierClient;
};

const bearerToken = (header: unknown): string | null => {
  if (typeof header !== "string") return null;
  const match = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(header.trim());
  return match ? match[1] : null;
};

// Signature, expiry, issuer (accounts.google.com) and audience are checked by
// verifyIdToken; the token must also belong to the configured service
// account, with a verified email.
export const verifyPushToken = async (
  authorization: unknown,
  config: PushConfig
): Promise<boolean> => {
  const idToken = bearerToken(authorization);
  if (!idToken) return false;
  try {
    const ticket = await verifier().verifyIdToken({
      idToken,
      audience: config.audience
    });
    const payload = ticket.getPayload();
    return Boolean(
      payload &&
      payload.email_verified === true &&
      typeof payload.email === "string" &&
      payload.email.toLowerCase() === config.serviceAccount
    );
  } catch {
    return false;
  }
};

// { message: { data: base64(JSON { emailAddress, historyId }) } } -> address,
// or null when the body is not a Gmail notification.
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

// Every active Gmail account with that address (the same mailbox can be
// connected by several companies), in companies this runtime owns with the
// email channel enabled. Returns how many syncs were enqueued. The jobId of
// enqueueAccountSync (`sync-<id>`) collapses duplicate notifications.
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
      enabled.set(
        account.companyId,
        await emailEnabledForCompany(account.companyId)
      );
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
    }
  }
  return enqueued;
};

// Small JSON parser for this route only. app.ts mounts it before the global
// 10 MB parser (which then skips the already-read body). Too large -> 413
// right away; invalid JSON -> body undefined, answered 204 after the token
// check like any other malformed notification.
const jsonParser = express.json({ limit: GMAIL_PUSH_BODY_LIMIT });
export const gmailPushBodyParser: RequestHandler = (req, res, next) => {
  jsonParser(req, res, err => {
    if (!err) return next();
    if ((err as { type?: string }).type === "entity.too.large") {
      return res.status(413).end();
    }
    // Marks the body as consumed so no later parser tries to read it again.
    (req as unknown as { _body: boolean })._body = true;
    req.body = undefined;
    return next();
  });
};

export const push = async (req: Request, res: Response): Promise<void> => {
  const config = pushConfig();
  if (!config) {
    res.status(404).end();
    return;
  }
  if (!(await verifyPushToken(req.headers.authorization, config))) {
    logger.warn("Rejected Gmail push: invalid or missing OIDC token");
    res.status(401).end();
    return;
  }

  res.status(204).end();

  const address = pushedAddress(req.body);
  if (!address) {
    logger.warn("Ignored malformed Gmail push notification");
    return;
  }
  try {
    await dispatchGmailPush(address);
  } catch (err) {
    logger.warn(
      { error: (err as Error)?.name },
      "Could not dispatch Gmail push notification"
    );
  }
};
