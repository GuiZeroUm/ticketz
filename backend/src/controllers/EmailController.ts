import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { getGmailConfig } from "../config/gmail";
import {
  assertEmailEnabled,
  emailEnabledForCompany
} from "../services/EmailServices/EmailAccessService";
import {
  createEmailAccount,
  deleteEmailAccount,
  listEmailAccounts,
  requestEmailAccountSync,
  testEmailAccount,
  updateEmailAccount
} from "../services/EmailServices/EmailAccountService";
import {
  openAttachment,
  safeInlineContentType
} from "../services/EmailServices/EmailAttachmentStorage";
import {
  CompleteGmailOAuthService,
  FinishGmailOAuthService,
  StartGmailOAuthService,
  gmailFallbackRedirect,
  requestFrontendOrigin
} from "../services/EmailServices/GmailOAuthService";
import { gmailFailureReason } from "../services/EmailServices/GmailAuthClient";
import { logger } from "../utils/logger";
import GetEmailThreadService, {
  assertAttachmentVisible
} from "../services/EmailServices/GetEmailThreadService";

const idParam = (value: string): number => {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) ? id : 0;
};

const body = (req: Request): Record<string, unknown> =>
  req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body
    : {};

export const availability = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const enabled = await emailEnabledForCompany(req.user.companyId);

  // Lets the frontend show Gmail as unavailable instead of failing on start.
  return res
    .status(200)
    .json({ enabled, gmailConfigured: getGmailConfig().enabled });
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  await assertEmailEnabled(req.user.companyId);
  return res.status(200).json(await listEmailAccounts(req.user.companyId));
};

export const test = async (req: Request, res: Response): Promise<Response> => {
  await assertEmailEnabled(req.user.companyId);
  await testEmailAccount(body(req));
  return res.status(204).send();
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  await assertEmailEnabled(companyId);
  const account = await createEmailAccount(
    companyId,
    Number(userId),
    body(req)
  );
  return res.status(201).json(account);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  await assertEmailEnabled(req.user.companyId);
  const account = await updateEmailAccount(
    req.user.companyId,
    idParam(req.params.id),
    body(req)
  );
  return res.status(200).json(account);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  await assertEmailEnabled(req.user.companyId);
  await deleteEmailAccount(req.user.companyId, idParam(req.params.id));
  return res.status(204).send();
};

export const sync = async (req: Request, res: Response): Promise<Response> => {
  await assertEmailEnabled(req.user.companyId);
  await requestEmailAccountSync(req.user.companyId, idParam(req.params.id));
  return res.status(202).send();
};

export const thread = async (
  req: Request,
  res: Response
): Promise<Response> => {
  await assertEmailEnabled(req.user.companyId);
  const result = await GetEmailThreadService({
    ticketId: idParam(req.params.ticketId),
    user: req.user
  });
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json(result);
};

export const attachment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { companyId } = req.user;
  await assertEmailEnabled(companyId);

  const id = idParam(req.params.id);
  if (!id) throw new AppError("ERR_EMAIL_ATTACHMENT_NOT_FOUND", 404);

  // before the file is opened: a hidden attachment is a plain 404
  await assertAttachmentVisible(id, req.user);

  const { attachment: file, stream } = await openAttachment(companyId, id);

  // res.attachment builds Content-Disposition with RFC 5987 encoding (the
  // stored name may hold quotes, semicolons or non-ASCII); it also guesses a
  // Content-Type from the extension, so the safe type is set after it.
  res.attachment(file.filename);
  res.setHeader("Content-Type", safeInlineContentType(file.contentType));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");

  stream.on("error", () => {
    // headers may already be out: all that is left is to cut the response
    res.destroy();
  });
  stream.pipe(res);
};

export const googleStart = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  await assertEmailEnabled(companyId);
  const { name, queueId, accountId } = body(req);
  const { url } = await StartGmailOAuthService({
    companyId,
    userId: Number(userId),
    name,
    queueId,
    accountId,
    origin: requestFrontendOrigin(req.get("origin"), req.get("referer"))
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ url });
};

// Unauthenticated: Google redirects the browser here. The company and user
// come only from the server side state; the answer is always a redirect.
export const googleCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  let redirectTo: string;
  try {
    ({ redirectTo } = await CompleteGmailOAuthService({
      code: req.query.code,
      state: req.query.state,
      error: req.query.error
    }));
  } catch (err) {
    logger.warn(
      { reason: gmailFailureReason(err) },
      "Gmail OAuth callback failed unexpectedly"
    );
    redirectTo = gmailFallbackRedirect();
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(302, redirectTo);
};

// Completes the connection parked by the callback, only for the same user of
// the same company that started it (ruling R27).
export const googleFinish = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  await assertEmailEnabled(companyId);
  const account = await FinishGmailOAuthService({
    handle: body(req).handle,
    companyId,
    userId: Number(userId)
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(account);
};
