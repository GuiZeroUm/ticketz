/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { UniqueConstraintError } from "sequelize";
import FiscalNote, { FiscalNoteStatus } from "../../models/FiscalNote";
import FiscalNoteWebhookDelivery from "../../models/FiscalNoteWebhookDelivery";
import { logger } from "../../utils/logger";
import { applyProviderStatus, syncFiscalNote } from "./FiscalNoteService";
import { NotaasStatusResponse, notaasConfig } from "./NotaasClient";

// X-Notaas-Signature: sha256=<hex do HMAC-SHA256 do corpo bruto>.
export const isValidNotaasSignature = (
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string
): boolean => {
  if (!secret || !rawBody || !header) return false;
  const expected = Buffer.from(
    `sha256=${crypto
      .createHmac("sha256", secret)
      .update(Uint8Array.from(rawBody))
      .digest("hex")}`
  );
  const received = Buffer.from(String(header).trim());
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(
    Uint8Array.from(expected),
    Uint8Array.from(received)
  );
};

const EVENT_STATUS: Record<string, NotaasStatusResponse["status"]> = {
  "nfse.issued": "issued",
  "nfse.error": "error",
  "nfse.cancelled": "cancelled"
};

export interface WebhookResult {
  status: number;
  outcome:
    | "processed"
    | "duplicate"
    | "ignored"
    | "invalid_signature"
    | "not_configured"
    | "invalid_payload";
}

interface WebhookInput {
  rawBody?: Buffer;
  signature?: string;
  deliveryHeader?: string;
  eventHeader?: string;
}

export const handleNotaasWebhook = async ({
  rawBody,
  signature,
  deliveryHeader,
  eventHeader
}: WebhookInput): Promise<WebhookResult> => {
  const { webhookSecret } = notaasConfig();
  if (!webhookSecret) return { status: 503, outcome: "not_configured" };
  if (!isValidNotaasSignature(rawBody, signature, webhookSecret)) {
    return { status: 401, outcome: "invalid_signature" };
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: 400, outcome: "invalid_payload" };
  }

  const event = String(body?.event || eventHeader || "");
  const deliveryId = String(deliveryHeader || body?.deliveryId || "").slice(
    0,
    100
  );
  const data = (body?.data || {}) as Record<string, any>;
  const providerInvoiceId = data.invoiceId ? String(data.invoiceId) : "";

  // O projeto do provedor é compartilhado com outro sistema: evento de nota
  // que não emitimos é aceito (200) e descartado, sem registro.
  if (!providerInvoiceId) return { status: 200, outcome: "ignored" };
  const note = await FiscalNote.findOne({ where: { providerInvoiceId } });
  if (!note) return { status: 200, outcome: "ignored" };

  if (deliveryId) {
    const seen = await FiscalNoteWebhookDelivery.findByPk(deliveryId);
    if (seen) return { status: 200, outcome: "duplicate" };
  }

  const remote: Partial<NotaasStatusResponse> & { documentsReady?: boolean } = {
    status: EVENT_STATUS[event] || data.status,
    chNFSe: data.chNFSe,
    emittedAt: data.emittedAt,
    pdfUrl: data.pdfUrl,
    xmlUrl: data.xmlUrl,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
    cancelOutcome: data.cancelOutcome,
    documentsReady: event === "nfse.documents_ready"
  };
  if (event === "nfse.documents_ready") delete remote.status;
  await applyProviderStatus(note, remote);

  // O evento pode vir sem todos os campos (ex.: chave de acesso): completa
  // com a consulta de status, sem segurar a resposta além de 5 s.
  const needsSync =
    (["issued", "cancelling", "cancelled"] as FiscalNoteStatus[]).includes(
      note.status
    ) &&
    (!note.accessKey || (!note.pdfUrl && !note.documentsReady));
  if (needsSync) {
    await syncFiscalNote(note, 5000).catch(error =>
      logger.warn(
        { noteId: note.id, err: error?.code || error?.message },
        "[fiscalNote] consulta após webhook falhou; a reconciliação completa"
      )
    );
  }

  if (deliveryId) {
    try {
      await FiscalNoteWebhookDelivery.create({
        deliveryId,
        event: event.slice(0, 40)
      } as any);
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
    }
  }
  return { status: 200, outcome: "processed" };
};
