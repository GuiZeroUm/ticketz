/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import FiscalNote from "../../../models/FiscalNote";
import FiscalNoteWebhookDelivery from "../../../models/FiscalNoteWebhookDelivery";
import { getNfseStatus } from "../NotaasClient";
import {
  handleNotaasWebhook,
  isValidNotaasSignature,
  webhookMaxAgeMs
} from "../NotaasWebhookService";
import { fakeModel } from "./fiscalTestUtils";

jest.mock("../../../models/FiscalNote", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/FiscalNoteWebhookDelivery", () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), create: jest.fn() }
}));
jest.mock("../../../models/Invoices", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/CompanyFiscalProfile", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/User", () => ({ __esModule: true, default: {} }));
jest.mock("../../../libs/socket", () => {
  const room: any = { to: () => room, emit: jest.fn() };
  return { getIO: () => room };
});
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock("../fiscalNoteQueue", () => ({
  enqueueFiscalNoteEmission: jest.fn()
}));
jest.mock("../NotaasClient", () => ({
  ...jest.requireActual("../NotaasClient"),
  emitNfse: jest.fn(),
  getNfseStatus: jest.fn(),
  cancelNfse: jest.fn()
}));

const SECRET = "test-webhook-secret";
const sign = (raw: Buffer, secret = SECRET) =>
  `sha256=${crypto.createHmac("sha256", secret).update(Uint8Array.from(raw)).digest("hex")}`;

const deliver = (
  body: Record<string, any>,
  delivery = "dlv-1",
  secret = SECRET,
  timestamp: unknown = new Date().toISOString()
) => {
  const rawBody = Buffer.from(
    JSON.stringify({ deliveryId: delivery, timestamp, ...body })
  );
  return handleNotaasWebhook({ rawBody, signature: sign(rawBody, secret) });
};

const accessKey =
  "355030821" + "11222333000181" + "0000000012345" + "2611" + "123456789" + "0";

describe("Notaas webhook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NOTAAS_WEBHOOK_SECRET = SECRET;
    (FiscalNoteWebhookDelivery.findByPk as jest.Mock).mockResolvedValue(null);
    (getNfseStatus as jest.Mock).mockRejectedValue(new Error("offline"));
  });

  it("validates the signature in constant time and checks the length first", () => {
    const raw = Buffer.from("{}");
    expect(isValidNotaasSignature(raw, sign(raw), SECRET)).toBe(true);
    expect(isValidNotaasSignature(raw, sign(raw, "other"), SECRET)).toBe(false);
    expect(isValidNotaasSignature(raw, "sha256=abc", SECRET)).toBe(false);
    expect(isValidNotaasSignature(raw, undefined, SECRET)).toBe(false);
  });

  it("rejects an invalid signature before reading the payload", async () => {
    const result = await deliver(
      { event: "nfse.issued", data: { invoiceId: "inv-1" } },
      "d",
      "wrong"
    );
    expect(result).toEqual({ status: 401, outcome: "invalid_signature" });
    expect(FiscalNote.findOne).not.toHaveBeenCalled();
  });

  it("refuses everything while the secret is not configured", async () => {
    delete process.env.NOTAAS_WEBHOOK_SECRET;
    const result = await deliver({ event: "nfse.issued", data: {} });
    expect(result.status).toBe(503);
  });

  it("ignores (200) events of notes emitted by the other system", async () => {
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(null);
    const result = await deliver({
      event: "nfse.issued",
      data: { invoiceId: "other" }
    });
    expect(result).toEqual({ status: 200, outcome: "ignored" });
    expect(FiscalNoteWebhookDelivery.create).not.toHaveBeenCalled();
  });

  it("applies nfse.issued to our note and records the delivery", async () => {
    const note = fakeModel({
      id: 5,
      invoiceId: 28,
      companyId: 7,
      status: "processing"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(note);
    const result = await deliver({
      event: "nfse.issued",
      deliveryId: "dlv-1",
      data: {
        invoiceId: "inv-1",
        chNFSe: accessKey,
        pdfUrl: "https://storage.notaas.com.br/a.pdf",
        xmlUrl: "https://storage.notaas.com.br/a.xml"
      }
    });
    expect(result).toEqual({ status: 200, outcome: "processed" });
    expect(note.status).toBe("issued");
    expect(note.number).toBe("12345");
    expect(FiscalNoteWebhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: "dlv-1", event: "nfse.issued" })
    );
  });

  it("accepts provider retries up to 3 hours old and refuses older or undated envelopes", async () => {
    delete process.env.NOTAAS_WEBHOOK_MAX_AGE_MINUTES;
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(
      fakeModel({ id: 5, status: "processing" })
    );
    const ago = (minutes: number) =>
      new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const issued = { event: "nfse.issued", data: { invoiceId: "inv-1" } };

    // Reentregas de 30 min e 2 h do provedor.
    await expect(
      deliver(issued, "retry-30m", SECRET, ago(30))
    ).resolves.toEqual({
      status: 200,
      outcome: "processed"
    });
    await expect(
      deliver(issued, "retry-2h", SECRET, ago(120))
    ).resolves.toEqual({
      status: 200,
      outcome: "processed"
    });
    const twoHoursInSeconds = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
    await expect(
      deliver(issued, "retry-2h-epoch", SECRET, twoHoursInSeconds)
    ).resolves.toEqual({ status: 200, outcome: "processed" });

    await expect(deliver(issued, "too-old", SECRET, ago(181))).resolves.toEqual(
      {
        status: 400,
        outcome: "stale"
      }
    );
    await expect(deliver(issued, "undated", SECRET, null)).resolves.toEqual({
      status: 400,
      outcome: "stale"
    });
    const future = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    await expect(deliver(issued, "future", SECRET, future)).resolves.toEqual({
      status: 400,
      outcome: "stale"
    });
  });

  it("lets the window be configured, within 15 minutes and 24 hours", () => {
    process.env.NOTAAS_WEBHOOK_MAX_AGE_MINUTES = "60";
    expect(webhookMaxAgeMs()).toBe(60 * 60 * 1000);
    process.env.NOTAAS_WEBHOOK_MAX_AGE_MINUTES = "1";
    expect(webhookMaxAgeMs()).toBe(15 * 60 * 1000);
    process.env.NOTAAS_WEBHOOK_MAX_AGE_MINUTES = "100000";
    expect(webhookMaxAgeMs()).toBe(24 * 60 * 60 * 1000);
    delete process.env.NOTAAS_WEBHOOK_MAX_AGE_MINUTES;
    expect(webhookMaxAgeMs()).toBe(180 * 60 * 1000);
  });

  it("still ignores a 2-hour retry whose delivery was already processed", async () => {
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(
      fakeModel({ id: 5, status: "issued" })
    );
    (FiscalNoteWebhookDelivery.findByPk as jest.Mock).mockResolvedValue({
      deliveryId: "dlv-replayed"
    });
    const ago2h = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    await expect(
      deliver(
        { event: "nfse.error", data: { invoiceId: "inv-1" } },
        "dlv-replayed",
        SECRET,
        ago2h
      )
    ).resolves.toEqual({ status: 200, outcome: "duplicate" });
  });

  it("dedupes by the delivery id inside the signed body, not by headers", async () => {
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(
      fakeModel({ id: 5, status: "processing" })
    );
    await deliver(
      { event: "nfse.issued", data: { invoiceId: "inv-1" } },
      "signed-id"
    );
    expect(FiscalNoteWebhookDelivery.findByPk).toHaveBeenCalledWith(
      "signed-id"
    );
    expect(FiscalNoteWebhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: "signed-id" })
    );
  });

  it("never turns an issued or cancelling note into an error", async () => {
    const issued = fakeModel({
      id: 5,
      status: "issued",
      accessKey,
      pdfUrl: "https://storage.notaas.com.br/a.pdf"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(issued);
    await deliver(
      { event: "nfse.error", data: { invoiceId: "inv-1", errorCode: "E1" } },
      "dlv-late-error"
    );
    expect(issued.status).toBe("issued");
    expect(issued.errorCode).toBeUndefined();

    const cancelling = fakeModel({
      id: 6,
      status: "cancelling",
      accessKey,
      pdfUrl: "https://storage.notaas.com.br/a.pdf"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(cancelling);
    await deliver(
      { event: "nfse.error", data: { invoiceId: "inv-2" } },
      "dlv-late-error-2"
    );
    expect(cancelling.status).toBe("cancelling");
  });

  it("ignores a repeated delivery", async () => {
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(
      fakeModel({ id: 5, status: "issued" })
    );
    (FiscalNoteWebhookDelivery.findByPk as jest.Mock).mockResolvedValue({
      deliveryId: "dlv-1"
    });
    const result = await deliver({
      event: "nfse.issued",
      data: { invoiceId: "inv-1" }
    });
    expect(result).toEqual({ status: 200, outcome: "duplicate" });
  });

  it("handles nfse.documents_ready twice without changing the status", async () => {
    const note = fakeModel({
      id: 5,
      invoiceId: 28,
      companyId: 7,
      status: "issued",
      accessKey,
      number: "12345"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(note);
    const partial = await deliver(
      {
        event: "nfse.documents_ready",
        data: {
          invoiceId: "inv-1",
          pdfUrl: "https://storage.notaas.com.br/a.pdf"
        }
      },
      "dlv-partial"
    );
    const complete = await deliver(
      {
        event: "nfse.documents_ready",
        data: {
          invoiceId: "inv-1",
          pdfUrl: "https://storage.notaas.com.br/a.pdf",
          xmlUrl: "https://storage.notaas.com.br/a.xml"
        }
      },
      "dlv-complete"
    );
    expect(partial.outcome).toBe("processed");
    expect(complete.outcome).toBe("processed");
    expect(note.status).toBe("issued");
    expect(note.documentsReady).toBe(true);
    expect(note.xmlUrl).toBe("https://storage.notaas.com.br/a.xml");
  });

  it("records nfse.error and nfse.cancelled", async () => {
    const note = fakeModel({
      id: 5,
      invoiceId: 28,
      companyId: 7,
      status: "processing"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(note);
    await deliver(
      {
        event: "nfse.error",
        data: {
          invoiceId: "inv-1",
          errorCode: "E123",
          errorMessage: "rejeitada"
        }
      },
      "dlv-err"
    );
    expect(note).toMatchObject({ status: "error", errorCode: "E123" });

    const issued = fakeModel({
      id: 6,
      invoiceId: 29,
      companyId: 7,
      status: "cancelling",
      accessKey,
      pdfUrl: "https://storage.notaas.com.br/b.pdf"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(issued);
    await deliver(
      { event: "nfse.cancelled", data: { invoiceId: "inv-2" } },
      "dlv-cancel"
    );
    expect(issued.status).toBe("cancelled");
    expect(issued.cancelledAt).toBeInstanceOf(Date);
  });
});
