/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { logger } from "../../../utils/logger";
import {
  buildWebhookDiagnostic,
  describeSignature,
  logRejectedWebhookDiagnostic,
  resetDiagnosticsRateLimit
} from "../NotaasWebhookDiagnostics";

jest.mock("../../../utils/logger", () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const SECRET = "test-webhook-secret";
const mac = (body: string, enc: "hex" | "base64" = "hex") =>
  crypto
    .createHmac("sha256", SECRET)
    .update(Uint8Array.from(Buffer.from(body)))
    .digest(enc);

const body = JSON.stringify({
  event: "webhook.test",
  deliveryId: "d-1",
  timestamp: "2026-11-25T12:35:50Z",
  data: { invoiceId: "valor-sensivel-123", message: "conteudo" }
});

const diagnose = (
  raw: string | undefined,
  signature?: string,
  headers: any = {}
) =>
  buildWebhookDiagnostic({
    outcome: "invalid_signature",
    status: 401,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
    rawBody: raw === undefined ? undefined : Buffer.from(raw),
    signature,
    secret: SECRET
  });

describe("Notaas webhook diagnostics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDiagnosticsRateLimit();
  });

  it("describes the signature header without its value", () => {
    expect(describeSignature(undefined)).toEqual({
      present: false,
      prefix: null,
      valueLength: 0,
      encoding: null
    });
    expect(describeSignature(`sha256=${"a".repeat(64)}`)).toEqual({
      present: true,
      prefix: "sha256",
      valueLength: 64,
      encoding: "hex"
    });
    expect(describeSignature(mac(body, "base64")).encoding).toBe("base64");
  });

  it("reports which signature variant would match, without accepting it", () => {
    expect(diagnose(body, `sha256=${mac(body)}`).variants).toEqual({
      rawHex: true,
      reserializedJsonHex: true,
      withoutTrailingNewlineHex: false,
      rawBase64: false
    });
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(diagnose(pretty, `sha256=${mac(body)}`).variants).toMatchObject({
      rawHex: false,
      reserializedJsonHex: true
    });
    expect(diagnose(`${body}\n`, `sha256=${mac(body)}`).variants).toMatchObject(
      {
        rawHex: false,
        withoutTrailingNewlineHex: true
      }
    );
    expect(diagnose(body, mac(body, "base64")).variants).toMatchObject({
      rawHex: false,
      rawBase64: true
    });
    expect(diagnose(body, "sha256=deadbeef").variants).toEqual({
      rawHex: false,
      reserializedJsonHex: false,
      withoutTrailingNewlineHex: false,
      rawBase64: false
    });
  });

  it("lists header and key names, never secret, signature or body values", () => {
    const signature = `sha256=${mac(body)}`;
    const result = diagnose(body, signature, {
      "x-notaas-event": "webhook.test",
      "X-Notaas-Delivery": "d-1",
      authorization: "nao-listar"
    });
    expect(result).toMatchObject({
      notaasHeaders: ["x-notaas-delivery", "x-notaas-event"],
      contentType: "application/json",
      rawBodyCaptured: true,
      bodyLength: Buffer.byteLength(body),
      jsonValid: true,
      envelopeKeys: ["event", "deliveryId", "timestamp", "data"],
      dataKeys: ["invoiceId", "message"]
    });
    const serialized = JSON.stringify(result);
    [
      SECRET,
      mac(body),
      "valor-sensivel-123",
      "conteudo",
      "nao-listar",
      "d-1"
    ].forEach(forbidden => {
      expect(serialized).not.toContain(forbidden);
    });
  });

  it("explains a body that was not captured (non-JSON content type)", () => {
    const result = diagnose(undefined, undefined, {
      "content-type": "text/plain"
    });
    expect(result).toMatchObject({
      rawBodyCaptured: false,
      bodyLength: 0,
      jsonValid: false,
      contentType: "text/plain",
      envelopeKeys: null
    });
  });

  it("logs at most once per minute", () => {
    const input = {
      outcome: "invalid_signature",
      status: 401,
      headers: {},
      rawBody: Buffer.from(body),
      signature: undefined,
      secret: SECRET
    };
    expect(logRejectedWebhookDiagnostic(input, 1_000_000)).toBe(true);
    expect(logRejectedWebhookDiagnostic(input, 1_030_000)).toBe(false);
    expect(logRejectedWebhookDiagnostic(input, 1_061_000)).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
