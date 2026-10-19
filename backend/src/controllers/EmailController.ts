import { Request, Response } from "express";
import AppError from "../errors/AppError";
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

  return res.status(200).json({ enabled });
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
