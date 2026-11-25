/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosError, AxiosInstance } from "axios";

// Configuração lida a cada uso: permite ligar/desligar sem recompilar e testar
// cenários sem importar o app.
export const notaasConfig = () => {
  const apiKey = process.env.NOTAAS_API_KEY?.trim() || "";
  const issRate = Number(process.env.NOTAAS_ISS_RATE ?? 5);
  const sinceRaw = process.env.NOTAAS_AUTO_EMIT_SINCE?.trim() || "";
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const autoEmitSince =
    since && Number.isFinite(since.getTime()) ? since : null;
  return {
    enabled: process.env.NOTAAS_ENABLED === "true" && !!apiKey,
    apiKey,
    baseUrl: (
      process.env.NOTAAS_BASE_URL?.trim() ||
      "https://platform.notaas.com.br/api/v1"
    ).replace(/\/+$/, ""),
    serviceCode: process.env.NOTAAS_SERVICE_CODE?.trim() || "010501",
    issRate: Number.isFinite(issRate) ? issRate : 5,
    webhookSecret: process.env.NOTAAS_WEBHOOK_SECRET || "",
    // Emissão automática (gatilho de pagamento e reconciliação). Desligada por
    // padrão: só o botão manual emite. Exige NOTAAS_AUTO_EMIT_SINCE válido,
    // que limita o automático às faturas pagas a partir dessa data.
    autoEmitRequested: process.env.NOTAAS_AUTO_EMIT_ENABLED === "true",
    autoEmitEnabled:
      process.env.NOTAAS_AUTO_EMIT_ENABLED === "true" && !!autoEmitSince,
    autoEmitSince
  };
};

export class NotaasApiError extends Error {
  public readonly status?: number;

  public readonly code: string;

  public readonly retryable: boolean;

  public readonly retryAfterMs?: number;

  constructor(params: {
    message: string;
    code: string;
    status?: number;
    retryable: boolean;
    retryAfterMs?: number;
  }) {
    super(params.message);
    this.name = "NotaasApiError";
    this.status = params.status;
    this.code = params.code;
    this.retryable = params.retryable;
    this.retryAfterMs = params.retryAfterMs;
  }
}

const retryAfterMs = (header: unknown): number | undefined => {
  if (header === undefined || header === null || header === "")
    return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(String(header));
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
};

// 429 e 5xx (e falha de rede) podem repetir; 400/402/403/409/422 não: são
// dados, plano, cota ou configuração, e repetir não muda o resultado.
export const toNotaasError = (error: unknown): NotaasApiError => {
  if (error instanceof NotaasApiError) return error;
  const axiosError = error as AxiosError<any>;
  const status = axiosError?.response?.status;
  const data = axiosError?.response?.data || {};
  const code = String(
    data?.code ||
      data?.error?.code ||
      data?.error ||
      (status ? `HTTP_${status}` : "NETWORK_ERROR")
  ).slice(0, 60);
  const message = String(
    data?.message ||
      data?.error?.message ||
      axiosError?.message ||
      "Notaas request failed"
  ).slice(0, 500);
  if (!status) {
    return new NotaasApiError({ message, code, retryable: true });
  }
  return new NotaasApiError({
    message,
    code,
    status,
    retryable: status === 429 || status >= 500,
    retryAfterMs: retryAfterMs(axiosError.response?.headers?.["retry-after"])
  });
};

export interface NotaasEmitPayload {
  servico: { codigo: string; descricao: string };
  valores: { total: number; aliquotaIss: number };
  competencia?: string;
  referencia: string;
  tomador?: Record<string, unknown>;
}

export interface NotaasEmitResponse {
  invoiceId: string;
  status: string;
  referencia?: string;
  idempotentReplay?: boolean;
}

export interface NotaasStatusResponse {
  status: string;
  chNFSe?: string | null;
  numeroNfe?: string | null;
  emittedAt?: string | null;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  documentsCached?: boolean;
  cancelOutcome?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

const client = (): AxiosInstance => {
  const config = notaasConfig();
  return axios.create({
    baseURL: config.baseUrl,
    timeout: 20000,
    headers: { "x-api-key": config.apiKey }
  });
};

const call = async <T>(fn: (http: AxiosInstance) => Promise<T>): Promise<T> => {
  try {
    return await fn(client());
  } catch (error) {
    throw toNotaasError(error);
  }
};

// POST /emitir — o único ponto que gera nota real. Só é chamado pela fila de
// emissão, nunca por testes (que simulam este módulo).
export const emitNfse = async (
  payload: NotaasEmitPayload,
  idempotencyKey: string
): Promise<NotaasEmitResponse> =>
  call(async http => {
    const { data } = await http.post("/emitir", payload, {
      headers: { "Idempotency-Key": idempotencyKey }
    });
    if (!data?.invoiceId) {
      throw new NotaasApiError({
        message: "Notaas response without invoiceId",
        code: "INVALID_RESPONSE",
        retryable: true
      });
    }
    return {
      invoiceId: String(data.invoiceId),
      status: String(data.status || "queued"),
      referencia: data.referencia,
      idempotentReplay: !!data.idempotentReplay
    };
  });

export const getNfseStatus = async (
  invoiceId: string,
  timeout = 20000
): Promise<NotaasStatusResponse> =>
  call(async http => {
    const { data } = await http.get(
      `/invoices/${encodeURIComponent(invoiceId)}/status`,
      { timeout }
    );
    return data as NotaasStatusResponse;
  });

export const cancelNfse = async (
  invoiceId: string,
  motivo: string
): Promise<void> =>
  call(async http => {
    await http.post("/cancelar", { invoiceId, motivo });
  });

// URL do arquivo no storage. Pedimos sem seguir o redirect para não reenviar a
// chave da API a outro host.
export const getNfseDocumentLocation = async (
  invoiceId: string,
  kind: "pdf" | "xml"
): Promise<string> =>
  call(async http => {
    const response = await http.get(
      `/invoices/${encodeURIComponent(invoiceId)}/${kind}`,
      {
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400
      }
    );
    const location = response.headers?.location || response.data?.url;
    if (!location) {
      throw new NotaasApiError({
        message: "Document not available",
        code: "DOCUMENT_NOT_READY",
        status: 409,
        retryable: false
      });
    }
    return String(location);
  });
