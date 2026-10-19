import express, { Request, RequestHandler, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { getGmailConfig } from "../config/gmail";
import { GMAIL_HTTP_TIMEOUT_MS } from "../services/EmailServices/GmailAuthClient";
import {
  dispatchGmailPush,
  pushedAddress
} from "../services/EmailServices/GmailPushService";
import { gmailPushConfigured } from "../services/EmailServices/GmailWatchService";
import { logger } from "../utils/logger";

// POST /webhooks/gmail/push: Pub/Sub push subscription of the Gmail watch
// topic (Task 16, setup in docs/email-channel.md). No session: the caller is
// Google, authenticated by the OIDC token Pub/Sub signs for the subscription's
// service account. This file only checks config and the token and answers;
// the notification is handled by GmailPushService.
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

type PushConfig = {
  audience: string;
  serviceAccount: string;
};

const pushConfig = (): PushConfig | null => {
  if (!gmailPushConfigured()) return null;
  const { pubsubAudience, pubsubServiceAccount } = getGmailConfig();
  return {
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
    // debug, not warn: anyone on the internet can call this URL, and a
    // warn per request would let them flood the logs.
    logger.debug("Rejected Gmail push: invalid or missing OIDC token");
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
