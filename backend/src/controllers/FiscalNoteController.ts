/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import axios from "axios";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import {
  lookupZipCode,
  showFiscalProfile,
  upsertFiscalProfile
} from "../services/FiscalNoteServices/FiscalProfileService";
import {
  assertProviderDocumentUrl,
  cancelFiscalNote,
  previewFiscalNote,
  requestFiscalNoteEmission,
  resolveFiscalDocument,
  serializeFiscalNote
} from "../services/FiscalNoteServices/FiscalNoteService";
import { handleNotaasWebhook } from "../services/FiscalNoteServices/NotaasWebhookService";

const positiveId = (value: string): number => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError("ERR_NO_INVOICE_FOUND", 404);
  }
  return id;
};

const documentKind = (value: string): "pdf" | "xml" => {
  if (value !== "pdf" && value !== "xml") {
    throw new AppError("ERR_FISCAL_NOTE_NOT_FOUND", 404);
  }
  return value;
};

// Dados fiscais da própria empresa (admin do tenant).
export const showOwnFiscalData = async (
  req: Request,
  res: Response
): Promise<Response> => res.json(await showFiscalProfile(req.user.companyId));

export const updateOwnFiscalData = async (
  req: Request,
  res: Response
): Promise<Response> =>
  res.json(await upsertFiscalProfile(req.user.companyId, req.body || {}));

// Dados fiscais de qualquer empresa (financeiro da plataforma).
export const showClientFiscalData = async (
  req: Request,
  res: Response
): Promise<Response> =>
  res.json(await showFiscalProfile(positiveId(req.params.companyId)));

export const updateClientFiscalData = async (
  req: Request,
  res: Response
): Promise<Response> =>
  res.json(
    await upsertFiscalProfile(positiveId(req.params.companyId), req.body || {})
  );

export const zipCode = async (req: Request, res: Response): Promise<Response> =>
  res.json(await lookupZipCode(req.params.cep));

export const preview = async (req: Request, res: Response): Promise<Response> =>
  res.json(await previewFiscalNote(positiveId(req.params.id)));

export const emit = async (req: Request, res: Response): Promise<Response> => {
  const note = await requestFiscalNoteEmission({
    invoiceId: positiveId(req.params.id),
    trigger: "manual",
    userId: Number(req.user.id) || null
  });
  return res.status(202).json(serializeFiscalNote(note));
};

export const cancel = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const note = await cancelFiscalNote(
    positiveId(req.params.id),
    req.body?.reason,
    Number(req.user.id) || null
  );
  return res.status(202).json(serializeFiscalNote(note));
};

const streamDocument = async (
  res: Response,
  target: { url: string; filename: string; contentType: string }
): Promise<void> => {
  let url = target.url;
  // Um único redirecionamento, e só para o storage do provedor.
  for (let hop = 0; hop < 2; hop += 1) {
    let upstream;
    try {
      upstream = await axios.get(url, {
        responseType: "stream",
        timeout: 30000,
        maxRedirects: 0,
        maxContentLength: 20 * 1024 * 1024,
        validateStatus: status => status >= 200 && status < 400
      });
    } catch (error) {
      logger.warn(
        { status: error?.response?.status },
        "[fiscalNote] download do documento falhou"
      );
      throw new AppError("ERR_FISCAL_DOCUMENT_DOWNLOAD_FAILED", 502);
    }
    if (upstream.status >= 300) {
      upstream.data?.destroy?.();
      url = assertProviderDocumentUrl(String(upstream.headers.location || ""));

      continue;
    }
    res.setHeader("Content-Type", target.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${target.filename.replace(/[^\w.-]/g, "_")}"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    upstream.data.pipe(res);
    return;
  }
  throw new AppError("ERR_FISCAL_DOCUMENT_DOWNLOAD_FAILED", 502);
};

// Cliente: só notas das faturas da própria empresa.
export const ownDocument = async (
  req: Request,
  res: Response
): Promise<void> => {
  const target = await resolveFiscalDocument(
    positiveId(req.params.id),
    documentKind(req.params.kind),
    { companyId: req.user.companyId }
  );
  await streamDocument(res, target);
};

// Financeiro da plataforma: qualquer fatura.
export const clientDocument = async (
  req: Request,
  res: Response
): Promise<void> => {
  const target = await resolveFiscalDocument(
    positiveId(req.params.id),
    documentKind(req.params.kind),
    {}
  );
  await streamDocument(res, target);
};

// Público: a autenticidade vem da assinatura HMAC, não de sessão.
export const webhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const result = await handleNotaasWebhook({
    rawBody: (req as any).rawBody,
    signature: req.header("x-notaas-signature")
  });
  if (result.status === 401) {
    logger.warn("[fiscalNote] webhook com assinatura inválida recusado");
  }
  return res.status(result.status).json({ outcome: result.outcome });
};
