/* eslint-disable @typescript-eslint/no-explicit-any, no-restricted-syntax */
import { Op, UniqueConstraintError, literal } from "sequelize";
import AppError from "../../errors/AppError";
import {
  billingConsoleSlugs,
  isBillingConsoleCompany
} from "../../helpers/billingConsole";
import { isDedicatedRuntime } from "../../helpers/tenantRuntime";
import { getIO } from "../../libs/socket";
import Company from "../../models/Company";
import CompanyFiscalProfile from "../../models/CompanyFiscalProfile";
import FiscalNote, {
  FiscalNoteStatus,
  FiscalNoteTrigger
} from "../../models/FiscalNote";
import FiscalNoteWebhookDelivery from "../../models/FiscalNoteWebhookDelivery";
import Invoices from "../../models/Invoices";
import { logger } from "../../utils/logger";
import { enqueueFiscalNoteEmission } from "./fiscalNoteQueue";
import {
  getFiscalProfile,
  isFiscalProfileComplete
} from "./FiscalProfileService";
import {
  NotaasEmitPayload,
  NotaasStatusResponse,
  cancelNfse,
  emitNfse,
  getNfseDocumentLocation,
  getNfseStatus,
  notaasConfig,
  toNotaasError
} from "./NotaasClient";

// Falha transitória que esgotou as tentativas: a nota pode ter chegado ao
// provedor, então uma nova tentativa reaproveita a mesma chave de idempotência.
export const TRANSIENT_FAILURE_CODE = "NOTAAS_UNAVAILABLE";

const ACTIVE_STATUSES: FiscalNoteStatus[] = [
  "queued",
  "processing",
  "issued",
  "cancelling"
];
const DOCUMENT_STATUSES: FiscalNoteStatus[] = [
  "issued",
  "cancelling",
  "cancelled"
];

export interface FiscalNoteView {
  id: number;
  status: Exclude<FiscalNoteStatus, "queued">;
  number: string | null;
  issuedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  hasPdf: boolean;
  hasXml: boolean;
}

// Código genérico que o cliente vê quando a emissão falha. O detalhe do
// provedor (que pode citar configuração fiscal da plataforma) fica só com o
// financeiro.
export const CLIENT_FAILURE_CODE = "ERR_FISCAL_NOTE_FAILED";

export type FiscalNoteAudience = "platform" | "client";

export const serializeFiscalNote = (
  note?: FiscalNote | null,
  audience: FiscalNoteAudience = "platform"
): FiscalNoteView | null => {
  if (!note) return null;
  const documents = DOCUMENT_STATUSES.includes(note.status);
  const viaProvider = !!note.documentsReady && !!note.providerInvoiceId;
  return {
    id: note.id,
    // Para a tela, "na nossa fila" e "no provedor" são a mesma etapa.
    status: note.status === "queued" ? "processing" : note.status,
    number: note.number || null,
    issuedAt: note.emittedAt || null,
    errorCode:
      audience === "client"
        ? note.status === "error"
          ? CLIENT_FAILURE_CODE
          : null
        : note.errorCode || null,
    errorMessage: audience === "client" ? null : note.errorMessage || null,
    hasPdf: documents && (!!note.pdfUrl || viaProvider),
    hasXml: documents && (!!note.xmlUrl || viaProvider)
  };
};

export const idempotencyKeyFor = (
  note: Pick<FiscalNote, "invoiceId" | "emissionAttempt">
): string =>
  note.emissionAttempt > 1
    ? `ew-invoice-${note.invoiceId}-r${note.emissionAttempt}`
    : `ew-invoice-${note.invoiceId}`;

// Número curto da NFS-e no Padrão Nacional: posições 24 a 36 da chave.
export const shortNumberFromAccessKey = (
  accessKey?: string | null
): string | null => {
  const digits = String(accessKey || "").replace(/\D/g, "");
  if (digits.length < 36) return null;
  return digits.substring(23, 36).replace(/^0+/, "") || "0";
};

export const invoiceCompetencia = (invoice: Invoices): string | null => {
  const candidates = [
    invoice.competencia,
    invoice.periodStart,
    invoice.dueDate,
    invoice.paidAt ? new Date(invoice.paidAt).toISOString() : null
  ];
  const found = candidates
    .map(value => String(value || "").slice(0, 7))
    .find(value => /^\d{4}-\d{2}$/.test(value));
  return found || null;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};
export const DESCRIPTION_DETAIL_MAX = 200;
const fromCodePoint = (code: number): string =>
  Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : " ";

// O texto livre da fatura vai para o documento fiscal: sem HTML, sem
// entidades escapadas (ex.: "&#x2F;"), sem caracteres de controle e curto.
export const cleanDescriptionText = (value: unknown): string => {
  const decoded = String(value ?? "")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, hex) =>
      fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d{1,7});/g, (_m, dec) => fromCodePoint(Number(dec)))
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(
      /&([a-z]+);/gi,
      (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m
    );
  return (
    decoded
      .replace(/<[^>]*>/g, " ")
      .replace(/[<>]/g, " ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, DESCRIPTION_DETAIL_MAX)
      .trim()
  );
};

export const fiscalNoteDescription = (invoice: Invoices): string => {
  const competencia = invoiceCompetencia(invoice);
  const parts = ["Licença de uso do software Espaço Whats"];
  const detail = cleanDescriptionText(invoice.detail);
  if (detail) parts.push(detail);
  if (competencia) {
    const [year, month] = competencia.split("-");
    parts.push(`competência ${month}/${year}`);
  }
  return parts.join(" — ").slice(0, 1000);
};

const buildTomador = (
  profile: CompanyFiscalProfile
): Record<string, unknown> => {
  const tomador: Record<string, unknown> =
    profile.documentType === "cnpj"
      ? { cnpj: profile.document, razaoSocial: profile.legalName }
      : { cpf: profile.document, nome: profile.legalName };
  tomador.email = profile.email;
  if (profile.municipalRegistration) {
    tomador.inscricaoMunicipal = profile.municipalRegistration;
  }
  tomador.endereco = {
    logradouro: profile.street,
    numero: profile.number,
    ...(profile.complement ? { complemento: profile.complement } : {}),
    bairro: profile.district,
    cidade: profile.city,
    uf: profile.state,
    cep: profile.zipCode
  };
  return tomador;
};

export const buildEmissionPayload = (
  invoice: Invoices,
  profile: CompanyFiscalProfile
): NotaasEmitPayload => {
  const config = notaasConfig();
  const competencia = invoiceCompetencia(invoice);
  return {
    servico: {
      codigo: config.serviceCode,
      descricao: fiscalNoteDescription(invoice)
    },
    valores: {
      total: Math.round(Number(invoice.value) * 100) / 100,
      aliquotaIss: config.issRate
    },
    ...(competencia ? { competencia } : {}),
    referencia: `EW-${invoice.id}`,
    tomador: buildTomador(profile)
  };
};

export const emitFiscalNoteUpdate = (note: FiscalNote): void => {
  try {
    const io = getIO();
    const event = `company-${note.companyId}-invoice`;
    io.to(`company-${note.companyId}-mainchannel`).emit(event, {
      action: "update",
      invoiceId: note.invoiceId,
      fiscalNote: serializeFiscalNote(note, "client")
    });
    io.to("super").emit(event, {
      action: "update",
      invoiceId: note.invoiceId,
      fiscalNote: serializeFiscalNote(note, "platform")
    });
  } catch (error) {
    logger.debug({ err: error?.message }, "[fiscalNote] socket indisponível");
  }
};

export const currentFiscalNote = async (
  invoiceId: number
): Promise<FiscalNote | null> =>
  FiscalNote.findOne({
    where: { invoiceId },
    order: [["id", "DESC"]]
  });

export const currentFiscalNotesByInvoice = async (
  invoiceIds: number[]
): Promise<Map<number, FiscalNote>> => {
  const ids = [...new Set(invoiceIds.filter(Boolean))];
  const result = new Map<number, FiscalNote>();
  if (!ids.length) return result;
  const notes = await FiscalNote.findAll({
    where: { invoiceId: ids },
    order: [["id", "DESC"]]
  });
  notes.forEach(note => {
    if (!result.has(note.invoiceId)) result.set(note.invoiceId, note);
  });
  return result;
};

const assertEmissionRuntime = (manual: boolean): boolean => {
  // A emissão roda só no runtime principal; runtimes dedicados apenas exibem
  // e baixam notas da mesma tabela.
  if (isDedicatedRuntime() || !notaasConfig().enabled) {
    if (manual) throw new AppError("ERR_FISCAL_NOTES_DISABLED", 503);
    return false;
  }
  return true;
};

const loadInvoice = async (invoiceId: number): Promise<Invoices | null> =>
  Invoices.findByPk(invoiceId, {
    include: [{ model: Company, as: "company", attributes: ["id", "slug"] }]
  });

// Antes de nova tentativa sobre uma nota que o provedor conhece, confirma lá
// (só leitura) que ela não foi emitida nem segue em andamento. Na dúvida,
// não reemite.
const assertNotEmittedRemotely = async (note: FiscalNote): Promise<void> => {
  let remote: NotaasStatusResponse;
  try {
    remote = await getNfseStatus(note.providerInvoiceId, 10000);
  } catch {
    throw new AppError("ERR_FISCAL_STATUS_CHECK_FAILED", 502);
  }
  if (remote.status === "error") return;
  await applyProviderStatus(note, remote);
  throw new AppError("ERR_FISCAL_NOTE_EXISTS", 409);
};

interface EmissionRequest {
  invoiceId: number;
  trigger: FiscalNoteTrigger;
  userId?: number | null;
}

// Ponto único de pedido de emissão: gatilho automático (fatura paga) e botão
// manual do financeiro. Nunca chama o provedor diretamente: enfileira.
export const requestFiscalNoteEmission = async ({
  invoiceId,
  trigger,
  userId = null
}: EmissionRequest): Promise<FiscalNote | null> => {
  const manual = trigger === "manual";
  if (!assertEmissionRuntime(manual)) return null;
  const config = notaasConfig();
  if (!manual && !config.autoEmitEnabled) return null;

  const invoice = await loadInvoice(invoiceId);
  if (!invoice || invoice.status === "deleted") {
    if (manual) throw new AppError("ERR_NO_INVOICE_FOUND", 404);
    return null;
  }
  if (invoice.status !== "paid") {
    if (manual) throw new AppError("ERR_INVOICE_NOT_PAID", 409);
    return null;
  }
  if (
    !manual &&
    (!invoice.paidAt || new Date(invoice.paidAt) < config.autoEmitSince)
  ) {
    return null;
  }
  if (
    !(Number(invoice.value) > 0) ||
    isBillingConsoleCompany(invoice.company)
  ) {
    if (manual) throw new AppError("ERR_FISCAL_NOTE_NOT_APPLICABLE", 422);
    return null;
  }

  let note = await currentFiscalNote(invoice.id);
  if (note && ACTIVE_STATUSES.includes(note.status)) {
    if (manual) throw new AppError("ERR_FISCAL_NOTE_EXISTS", 409);
    return note;
  }
  if (note?.status === "error" && !manual) return note;

  const profile = await getFiscalProfile(invoice.companyId);
  const complete = isFiscalProfileComplete(profile);
  const status: FiscalNoteStatus = complete ? "queued" : "pending_fiscal_data";

  if (!note || note.status === "cancelled") {
    // Reemissão após cancelamento precisa de chave de idempotência nova.
    const previousAttempt = note
      ? Number(
          (await FiscalNote.max("emissionAttempt", {
            where: { invoiceId: invoice.id }
          })) || 0
        )
      : 0;
    try {
      note = await FiscalNote.create({
        invoiceId: invoice.id,
        companyId: invoice.companyId,
        reference: `EW-${invoice.id}`,
        emissionAttempt: previousAttempt + 1,
        status,
        trigger,
        requestedByUserId: userId
      } as any);
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      // Outro pedido criou a nota ao mesmo tempo (ex.: webhook do gateway e
      // baixa manual): o primeiro vence.
      const winner = await currentFiscalNote(invoice.id);
      if (manual) throw new AppError("ERR_FISCAL_NOTE_EXISTS", 409);
      return winner;
    }
  } else {
    const retryFromError = note.status === "error";
    if (retryFromError && note.providerInvoiceId) {
      await assertNotEmittedRemotely(note);
    }
    const reuseKey = note.errorCode === TRANSIENT_FAILURE_CODE;
    await note.update({
      status,
      trigger,
      requestedByUserId: userId,
      ...(retryFromError
        ? {
            errorCode: null,
            errorMessage: null,
            providerInvoiceId: reuseKey ? note.providerInvoiceId : null,
            emissionAttempt: reuseKey
              ? note.emissionAttempt
              : note.emissionAttempt + 1
          }
        : {})
    });
  }

  emitFiscalNoteUpdate(note);

  if (!complete) {
    if (manual) throw new AppError("ERR_FISCAL_DATA_INCOMPLETE", 422);
    return note;
  }

  await enqueueFiscalNoteEmission(note);
  return note;
};

// Gatilho de "fatura paga": não bloqueia nem derruba o pagamento.
export const scheduleAutoFiscalNote = (invoiceId: number): void => {
  requestFiscalNoteEmission({ invoiceId, trigger: "auto" }).catch(error => {
    logger.error(
      { invoiceId, err: error?.message },
      "[fiscalNote] falha ao agendar emissão automática"
    );
  });
};

export const previewFiscalNote = async (invoiceId: number) => {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice || invoice.status === "deleted") {
    throw new AppError("ERR_NO_INVOICE_FOUND", 404);
  }
  const profile = await getFiscalProfile(invoice.companyId);
  if (!isFiscalProfileComplete(profile)) {
    throw new AppError("ERR_FISCAL_DATA_INCOMPLETE", 422);
  }
  const payload = buildEmissionPayload(invoice, profile);
  return {
    tomador: {
      name: profile.legalName,
      documentType: profile.documentType,
      document: profile.document,
      email: profile.email
    },
    value: payload.valores.total,
    currency: invoice.currency || "BRL",
    competencia: payload.competencia || null,
    service: {
      code: payload.servico.codigo,
      description: payload.servico.descricao
    },
    issRate: payload.valores.aliquotaIss
  };
};

// Worker da fila: o único lugar que chama POST /emitir.
export const processFiscalNoteEmission = async (
  noteId: number,
  { finalAttempt }: { finalAttempt: boolean }
): Promise<void> => {
  if (isDedicatedRuntime() || !notaasConfig().enabled) return;
  const note = await FiscalNote.findByPk(noteId);
  if (!note || note.status !== "queued") return;

  const invoice = await Invoices.findByPk(note.invoiceId);
  if (!invoice || invoice.status !== "paid") {
    await note.update({
      status: "error",
      errorCode: "INVOICE_NOT_PAID",
      errorMessage: null
    });
    emitFiscalNoteUpdate(note);
    return;
  }
  const profile = await getFiscalProfile(note.companyId);
  if (!isFiscalProfileComplete(profile)) {
    await note.update({ status: "pending_fiscal_data" });
    emitFiscalNoteUpdate(note);
    return;
  }

  try {
    const response = await emitNfse(
      buildEmissionPayload(invoice, profile),
      idempotencyKeyFor(note)
    );
    await note.update({
      providerInvoiceId: response.invoiceId,
      status: "processing",
      submittedAt: new Date(),
      errorCode: null,
      errorMessage: null
    });
    emitFiscalNoteUpdate(note);
    logger.info(
      {
        noteId: note.id,
        invoiceId: note.invoiceId,
        replay: response.idempotentReplay
      },
      "[fiscalNote] emissão aceita pelo provedor"
    );
  } catch (raw) {
    const error = toNotaasError(raw);
    if (error.retryable && !finalAttempt) throw error;
    await note.update({
      status: "error",
      errorCode: error.retryable ? TRANSIENT_FAILURE_CODE : error.code,
      errorMessage: error.message
    });
    emitFiscalNoteUpdate(note);
    logger.warn(
      { noteId: note.id, status: error.status, code: error.code },
      "[fiscalNote] emissão falhou"
    );
  }
};

const PROVIDER_STATUS: Record<string, FiscalNoteStatus> = {
  queued: "processing",
  processing: "processing",
  validated: "processing",
  issued: "issued",
  error: "error",
  cancelling: "cancelling",
  cancelled: "cancelled"
};

// Transições aceitas a partir do provedor, sempre para frente. Uma nota
// emitida nunca vira "erro" nem "processando" por causa de um evento atrasado
// ou forjado: se virasse, o botão de nova tentativa emitiria uma segunda nota.
// "cancelling" → "issued" é o cancelamento recusado pela prefeitura.
const PROVIDER_TRANSITIONS: Partial<
  Record<FiscalNoteStatus, FiscalNoteStatus[]>
> = {
  queued: ["processing", "issued", "error", "cancelling", "cancelled"],
  processing: ["issued", "error", "cancelling", "cancelled"],
  error: ["issued", "cancelling", "cancelled"],
  issued: ["cancelling", "cancelled"],
  cancelling: ["issued", "cancelled"]
};

export const canApplyProviderStatus = (
  from: FiscalNoteStatus,
  to: FiscalNoteStatus
): boolean => from === to || !!PROVIDER_TRANSITIONS[from]?.includes(to);

// Aplica o estado informado pelo provedor (status consultado ou webhook).
export const applyProviderStatus = async (
  note: FiscalNote,
  remote: Partial<NotaasStatusResponse> & { documentsReady?: boolean }
): Promise<boolean> => {
  if (note.status === "cancelled") return false;
  const changes: Record<string, any> = { lastSyncedAt: new Date() };
  const mapped = remote.status ? PROVIDER_STATUS[remote.status] : undefined;
  const regress = !!mapped && !canApplyProviderStatus(note.status, mapped);

  if (mapped && !regress) {
    changes.status = mapped;
    if (
      mapped === "issued" &&
      note.status === "cancelling" &&
      remote.cancelOutcome
    ) {
      changes.errorCode =
        `CANCEL_${String(remote.cancelOutcome).toUpperCase()}`.slice(0, 60);
      changes.errorMessage = null;
    } else if (mapped === "error") {
      changes.errorCode = (remote.errorCode || "PROVIDER_ERROR").slice(0, 60);
      changes.errorMessage = remote.errorMessage || null;
    } else if (mapped !== "cancelling") {
      changes.errorCode = null;
      changes.errorMessage = null;
    }
    if (mapped === "cancelled")
      changes.cancelledAt = note.cancelledAt || new Date();
  }
  if (remote.chNFSe) {
    changes.accessKey = remote.chNFSe;
    changes.number = shortNumberFromAccessKey(remote.chNFSe) || note.number;
  }
  if (remote.emittedAt) changes.emittedAt = new Date(remote.emittedAt);
  if (remote.pdfUrl) changes.pdfUrl = remote.pdfUrl;
  if (remote.xmlUrl) changes.xmlUrl = remote.xmlUrl;
  if (remote.documentsCached || remote.documentsReady)
    changes.documentsReady = true;

  const meaningful = Object.keys(changes).some(
    key => key !== "lastSyncedAt" && changes[key] !== (note as any)[key]
  );
  await note.update(changes);
  if (meaningful) emitFiscalNoteUpdate(note);
  return meaningful;
};

export const syncFiscalNote = async (
  note: FiscalNote,
  timeout?: number
): Promise<FiscalNote> => {
  if (!note.providerInvoiceId) return note;
  const remote = await getNfseStatus(note.providerInvoiceId, timeout);
  await applyProviderStatus(note, remote);
  return note;
};

const STALE_MS = 10 * 60 * 1000;
const STUCK_QUEUE_MS = 15 * 60 * 1000;
// Ids de entrega do webhook: bem acima da janela máxima aceita (24 h).
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Reserva do webhook: consulta notas paradas, reenfileira o que ficou na fila
// e, se configurado, emite faturas pagas que não ganharam nota.
export const reconcileFiscalNotes = async (): Promise<void> => {
  if (isDedicatedRuntime() || !notaasConfig().enabled) return;
  const now = Date.now();

  const stale = await FiscalNote.findAll({
    where: {
      status: ["processing", "cancelling"],
      updatedAt: { [Op.lt]: new Date(now - STALE_MS) }
    },
    order: [["updatedAt", "ASC"]],
    limit: 50
  });
  for (const note of stale) {
    try {
      await syncFiscalNote(note);
    } catch (error) {
      logger.warn(
        { noteId: note.id, code: toNotaasError(error).code },
        "[fiscalNote] reconciliação falhou"
      );
    }
  }

  const stuck = await FiscalNote.findAll({
    where: {
      status: "queued",
      updatedAt: { [Op.lt]: new Date(now - STUCK_QUEUE_MS) }
    },
    limit: 50
  });
  for (const note of stuck) {
    await enqueueFiscalNoteEmission(note);
  }

  // Pega faturas pagas sem nota, inclusive as confirmadas num runtime
  // dedicado (que não emite): a reconciliação do runtime principal emite.
  const { autoEmitEnabled, autoEmitSince: since } = notaasConfig();
  if (autoEmitEnabled && since) {
    const missing = await Invoices.findAll({
      attributes: ["id"],
      where: {
        status: "paid",
        value: { [Op.gt]: 0 },
        paidAt: { [Op.gte]: since },
        id: { [Op.notIn]: literal('(SELECT "invoiceId" FROM "FiscalNotes")') }
      },
      include: [
        {
          model: Company,
          as: "company",
          attributes: [],
          required: true,
          where: { slug: { [Op.notIn]: billingConsoleSlugs() } }
        }
      ],
      limit: 20
    });
    for (const invoice of missing) {
      await requestFiscalNoteEmission({
        invoiceId: invoice.id,
        trigger: "auto"
      });
    }
  }

  await FiscalNoteWebhookDelivery.destroy({
    where: { createdAt: { [Op.lt]: new Date(now - DELIVERY_RETENTION_MS) } }
  });
};

export const cancelFiscalNote = async (
  invoiceId: number,
  reason: string,
  userId?: number | null
): Promise<FiscalNote> => {
  assertEmissionRuntime(true);
  const motivo = String(reason || "").trim();
  if (motivo.length < 15 || motivo.length > 255) {
    throw new AppError("ERR_FISCAL_CANCEL_REASON");
  }
  const note = await currentFiscalNote(invoiceId);
  if (!note) throw new AppError("ERR_FISCAL_NOTE_NOT_FOUND", 404);
  if (note.status !== "issued" || !note.providerInvoiceId) {
    throw new AppError("ERR_FISCAL_NOTE_NOT_CANCELLABLE", 409);
  }
  try {
    await cancelNfse(note.providerInvoiceId, motivo);
  } catch (raw) {
    const error = toNotaasError(raw);
    logger.warn(
      { noteId: note.id, status: error.status, code: error.code },
      "[fiscalNote] cancelamento recusado"
    );
    throw new AppError("ERR_FISCAL_CANCEL_FAILED", 502);
  }
  await note.update({
    status: "cancelling",
    cancelReason: motivo,
    requestedByUserId: userId ?? note.requestedByUserId,
    errorCode: null,
    errorMessage: null
  });
  emitFiscalNoteUpdate(note);
  return note;
};

const ALLOWED_DOCUMENT_HOST = /(^|\.)notaas\.com\.br$/i;

// Só aceitamos baixar do storage do provedor: a URL vem da resposta dele e
// não pode virar um proxy para outro destino.
export const assertProviderDocumentUrl = (url: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("ERR_FISCAL_DOCUMENT_NOT_READY", 409);
  }
  if (
    parsed.protocol !== "https:" ||
    !ALLOWED_DOCUMENT_HOST.test(parsed.hostname)
  ) {
    throw new AppError("ERR_FISCAL_DOCUMENT_NOT_READY", 409);
  }
  return parsed.toString();
};

export interface FiscalDocumentTarget {
  url: string;
  filename: string;
  contentType: string;
}

// companyId = escopo do cliente; omitido = financeiro da plataforma.
export const resolveFiscalDocument = async (
  invoiceId: number,
  kind: "pdf" | "xml",
  scope: { companyId?: number }
): Promise<FiscalDocumentTarget> => {
  const note = await currentFiscalNote(invoiceId);
  if (
    !note ||
    (scope.companyId !== undefined && note.companyId !== scope.companyId)
  ) {
    throw new AppError("ERR_FISCAL_NOTE_NOT_FOUND", 404);
  }
  if (!DOCUMENT_STATUSES.includes(note.status)) {
    throw new AppError("ERR_FISCAL_DOCUMENT_NOT_READY", 409);
  }
  let url = kind === "pdf" ? note.pdfUrl : note.xmlUrl;
  if (!url) {
    if (!note.providerInvoiceId || !notaasConfig().apiKey) {
      throw new AppError("ERR_FISCAL_DOCUMENT_NOT_READY", 409);
    }
    try {
      url = await getNfseDocumentLocation(note.providerInvoiceId, kind);
    } catch {
      throw new AppError("ERR_FISCAL_DOCUMENT_NOT_READY", 409);
    }
  }
  const label = note.number || `fatura-${note.invoiceId}`;
  // Mesmo nome que a tela usa ao salvar: nfse-<número da nota>.
  return {
    url: assertProviderDocumentUrl(url),
    filename: `nfse-${label}.${kind}`,
    contentType: kind === "pdf" ? "application/pdf" : "application/xml"
  };
};
