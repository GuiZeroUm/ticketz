/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { logger } from "../../utils/logger";

// Diagnóstico de um webhook recusado: descreve a forma do pedido e testa se a
// assinatura bateria em variantes comuns de cálculo. Só registra metadados e
// verdadeiro/falso; nunca o segredo, o valor da assinatura ou valores do
// corpo. Uma variante que bate NÃO faz o pedido ser aceito.

const MIN_INTERVAL_MS = 60 * 1000;
const MAX_KEYS = 30;
let lastLoggedAt = 0;

export const resetDiagnosticsRateLimit = (): void => {
  lastLoggedAt = 0;
};

const safeName = (name: string): string =>
  String(name)
    .replace(/[^\w.-]/g, "_")
    .slice(0, 40);

const keysOf = (value: unknown): string[] | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).slice(0, MAX_KEYS).map(safeName)
    : null;

export interface SignatureShape {
  present: boolean;
  prefix: string | null;
  valueLength: number;
  encoding: "hex" | "base64" | "other" | null;
}

export const describeSignature = (header?: string): SignatureShape => {
  const raw = String(header ?? "").trim();
  if (!raw) {
    return { present: false, prefix: null, valueLength: 0, encoding: null };
  }
  const match = raw.match(/^([a-z0-9]{2,12})=(.*)$/i);
  const prefix = match ? safeName(match[1]).toLowerCase() : null;
  const value = match ? match[2] : raw;
  let encoding: SignatureShape["encoding"] = "other";
  if (/^[0-9a-f]+$/i.test(value)) encoding = "hex";
  else if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) encoding = "base64";
  return { present: true, prefix, valueLength: value.length, encoding };
};

const signatureValue = (header?: string): string => {
  const raw = String(header ?? "").trim();
  const match = raw.match(/^[a-z0-9]{2,12}=(.*)$/i);
  return match ? match[1] : raw;
};

const hmac = (secret: string, payload: Buffer): Buffer =>
  crypto.createHmac("sha256", secret).update(Uint8Array.from(payload)).digest();

const same = (received: string, expected: string): boolean => {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return (
    a.length === b.length &&
    crypto.timingSafeEqual(Uint8Array.from(a), Uint8Array.from(b))
  );
};

export interface SignatureVariants {
  rawHex: boolean;
  reserializedJsonHex: boolean;
  withoutTrailingNewlineHex: boolean;
  rawBase64: boolean;
}

// Compara a parte do cabeçalho depois do prefixo opcional ("sha256=").
export const signatureVariants = (
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string
): SignatureVariants => {
  const none = {
    rawHex: false,
    reserializedJsonHex: false,
    withoutTrailingNewlineHex: false,
    rawBase64: false
  };
  const received = signatureValue(header);
  if (!received || !secret || !rawBody) return none;

  const text = rawBody.toString("utf8");
  let reserialized: Buffer | null = null;
  try {
    reserialized = Buffer.from(JSON.stringify(JSON.parse(text)));
  } catch {
    reserialized = null;
  }
  const trimmed = Buffer.from(text.replace(/\r?\n$/, ""));
  const lower = received.toLowerCase();

  return {
    rawHex: same(lower, hmac(secret, rawBody).toString("hex")),
    reserializedJsonHex:
      !!reserialized && same(lower, hmac(secret, reserialized).toString("hex")),
    withoutTrailingNewlineHex:
      trimmed.length !== rawBody.length &&
      same(lower, hmac(secret, trimmed).toString("hex")),
    rawBase64: same(received, hmac(secret, rawBody).toString("base64"))
  };
};

interface DiagnosticInput {
  outcome: string;
  status: number;
  headers: Record<string, unknown>;
  rawBody?: Buffer;
  signature?: string;
  secret: string;
}

export const buildWebhookDiagnostic = ({
  outcome,
  status,
  headers,
  rawBody,
  signature,
  secret
}: DiagnosticInput): Record<string, unknown> => {
  let jsonValid = false;
  let envelopeKeys: string[] | null = null;
  let dataKeys: string[] | null = null;
  if (rawBody?.length) {
    try {
      const parsed = JSON.parse(rawBody.toString("utf8"));
      jsonValid = true;
      envelopeKeys = keysOf(parsed);
      dataKeys = keysOf((parsed as any)?.data);
    } catch {
      jsonValid = false;
    }
  }
  return {
    outcome,
    status,
    signature: describeSignature(signature),
    notaasHeaders: Object.keys(headers || {})
      .filter(name => /^x-notaas-/i.test(name))
      .map(name => safeName(name).toLowerCase())
      .sort(),
    contentType: String(headers?.["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9.+/-]/g, "_")
      .slice(0, 60),
    rawBodyCaptured: !!rawBody,
    bodyLength: rawBody?.length ?? 0,
    jsonValid,
    envelopeKeys,
    dataKeys,
    variants: signatureVariants(rawBody, signature, secret)
  };
};

// No máximo um registro por minuto, para não encher o log com reentregas.
export const logRejectedWebhookDiagnostic = (
  input: DiagnosticInput,
  now = Date.now()
): boolean => {
  if (now - lastLoggedAt < MIN_INTERVAL_MS) return false;
  lastLoggedAt = now;
  try {
    logger.warn(
      { notaasWebhookDiagnostic: buildWebhookDiagnostic(input) },
      "[fiscalNote] diagnóstico do webhook recusado"
    );
  } catch {
    // O diagnóstico nunca interfere na resposta ao provedor.
  }
  return true;
};
