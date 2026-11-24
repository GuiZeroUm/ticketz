/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniqueConstraintError } from "sequelize";
import FiscalNote from "../../../models/FiscalNote";
import Invoices from "../../../models/Invoices";
import { enqueueFiscalNoteEmission } from "../fiscalNoteQueue";
import { getFiscalProfile } from "../FiscalProfileService";
import {
  cancelNfse,
  emitNfse,
  getNfseStatus,
  NotaasApiError
} from "../NotaasClient";
import {
  applyProviderStatus,
  reconcileFiscalNotes,
  cancelFiscalNote,
  processFiscalNoteEmission,
  requestFiscalNoteEmission,
  resolveFiscalDocument,
  serializeFiscalNote,
  shortNumberFromAccessKey,
  TRANSIENT_FAILURE_CODE
} from "../FiscalNoteService";
import { completeProfile, fakeModel } from "./fiscalTestUtils";

jest.mock("../../../models/FiscalNote", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    max: jest.fn()
  }
}));
jest.mock("../../../models/Invoices", () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findAll: jest.fn() }
}));
jest.mock("../../../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../../../models/CompanyFiscalProfile", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/FiscalNoteWebhookDelivery", () => ({
  __esModule: true,
  default: { destroy: jest.fn() }
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
jest.mock("../FiscalProfileService", () => ({
  ...jest.requireActual("../FiscalProfileService"),
  getFiscalProfile: jest.fn()
}));
jest.mock("../NotaasClient", () => ({
  ...jest.requireActual("../NotaasClient"),
  emitNfse: jest.fn(),
  getNfseStatus: jest.fn(),
  cancelNfse: jest.fn(),
  getNfseDocumentLocation: jest.fn()
}));

const paidInvoice = (overrides: Record<string, any> = {}) =>
  fakeModel({
    id: 28,
    companyId: 7,
    status: "paid",
    value: "149.90",
    currency: "BRL",
    detail: "Plano Pro",
    competencia: "2026-11",
    paidAt: new Date(),
    company: { id: 7, slug: "cliente-exemplo" },
    ...overrides
  });

describe("fiscal note emission (simulated Notaas)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NOTAAS_ENABLED = "true";
    process.env.NOTAAS_API_KEY = "test-key";
    process.env.NOTAAS_AUTO_EMIT_ENABLED = "true";
    process.env.NOTAAS_AUTO_EMIT_SINCE = "2026-11-01T00:00:00Z";
    delete process.env.NOTAAS_SERVICE_CODE;
    delete process.env.NOTAAS_ISS_RATE;
    delete process.env.TENANT_RUNTIME_COMPANY_ID;
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(null);
    (FiscalNote.max as jest.Mock).mockResolvedValue(0);
    (FiscalNote.create as jest.Mock).mockImplementation(async data =>
      fakeModel({ id: 1, ...data })
    );
  });

  it("does nothing automatically and refuses manually when disabled", async () => {
    process.env.NOTAAS_ENABLED = "false";
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "auto" })
    ).resolves.toBeNull();
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({
      message: "ERR_FISCAL_NOTES_DISABLED",
      statusCode: 503
    });
    expect(Invoices.findByPk).not.toHaveBeenCalled();
  });

  it("never emits in a dedicated runtime that shares the database", async () => {
    process.env.TENANT_RUNTIME_COMPANY_ID = "9";
    process.env.QUEUE_PREFIX = "acnorte";
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "auto" })
    ).resolves.toBeNull();
    delete process.env.TENANT_RUNTIME_COMPANY_ID;
    delete process.env.QUEUE_PREFIX;
  });

  it("keeps a paid invoice without fiscal data as pending, without emitting", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    (getFiscalProfile as jest.Mock).mockResolvedValue(null);
    const note = await requestFiscalNoteEmission({
      invoiceId: 28,
      trigger: "auto"
    });
    expect(note.status).toBe("pending_fiscal_data");
    expect(enqueueFiscalNoteEmission).not.toHaveBeenCalled();
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({
      message: "ERR_FISCAL_DATA_INCOMPLETE",
      statusCode: 422
    });
  });

  it("queues a paid invoice with complete fiscal data", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    (getFiscalProfile as jest.Mock).mockResolvedValue(completeProfile());
    const note = await requestFiscalNoteEmission({
      invoiceId: 28,
      trigger: "manual",
      userId: 3
    });
    expect(FiscalNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 28,
        companyId: 7,
        reference: "EW-28",
        emissionAttempt: 1,
        status: "queued",
        trigger: "manual",
        requestedByUserId: 3
      })
    );
    expect(enqueueFiscalNoteEmission).toHaveBeenCalledWith(note);
  });

  it("refuses unpaid invoices and the platform's own invoices", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(
      paidInvoice({ status: "open" })
    );
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({ message: "ERR_INVOICE_NOT_PAID" });
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "auto" })
    ).resolves.toBeNull();

    (Invoices.findByPk as jest.Mock).mockResolvedValue(
      paidInvoice({ company: { id: 1, slug: "teste" } })
    );
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({ message: "ERR_FISCAL_NOTE_NOT_APPLICABLE" });
    expect(FiscalNote.create).not.toHaveBeenCalled();
  });

  it("allows only one valid note per invoice", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(
      fakeModel({ id: 5, invoiceId: 28, status: "issued" })
    );
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({
      message: "ERR_FISCAL_NOTE_EXISTS",
      statusCode: 409
    });
    const auto = await requestFiscalNoteEmission({
      invoiceId: 28,
      trigger: "auto"
    });
    expect(auto.id).toBe(5);
    expect(enqueueFiscalNoteEmission).not.toHaveBeenCalled();
  });

  it("lets the first of two concurrent requests win", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    (getFiscalProfile as jest.Mock).mockResolvedValue(completeProfile());
    const winner = fakeModel({ id: 9, invoiceId: 28, status: "queued" });
    (FiscalNote.findOne as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    (FiscalNote.create as jest.Mock).mockRejectedValue(
      new UniqueConstraintError({})
    );
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "auto" })
    ).resolves.toBe(winner);
    expect(enqueueFiscalNoteEmission).not.toHaveBeenCalled();
  });

  it("reuses the idempotency key after a transient failure, renews it after a rejection", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    (getFiscalProfile as jest.Mock).mockResolvedValue(completeProfile());
    const transient = fakeModel({
      id: 5,
      invoiceId: 28,
      status: "error",
      emissionAttempt: 1,
      errorCode: TRANSIENT_FAILURE_CODE
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(transient);
    await requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" });
    expect(transient.emissionAttempt).toBe(1);
    expect(transient.status).toBe("queued");

    const rejected = fakeModel({
      id: 6,
      invoiceId: 28,
      status: "error",
      emissionAttempt: 1,
      errorCode: "VALIDATION_ERROR",
      providerInvoiceId: "inv-err"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(rejected);
    (getNfseStatus as jest.Mock).mockResolvedValue({ status: "error" });
    await requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" });
    expect(getNfseStatus).toHaveBeenCalledWith("inv-err", expect.any(Number));
    expect(rejected.emissionAttempt).toBe(2);
    expect(rejected.providerInvoiceId).toBeNull();
  });

  it("checks the provider before retrying and blocks if the note was issued", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    (getFiscalProfile as jest.Mock).mockResolvedValue(completeProfile());
    const errored = fakeModel({
      id: 6,
      invoiceId: 28,
      status: "error",
      emissionAttempt: 1,
      errorCode: "E1",
      providerInvoiceId: "inv-1"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(errored);
    (getNfseStatus as jest.Mock).mockResolvedValue({ status: "issued" });
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({ message: "ERR_FISCAL_NOTE_EXISTS" });
    expect(errored.status).toBe("issued");
    expect(errored.emissionAttempt).toBe(1);
    expect(enqueueFiscalNoteEmission).not.toHaveBeenCalled();

    const inFlight = fakeModel({ ...errored, status: "error" });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(inFlight);
    (getNfseStatus as jest.Mock).mockResolvedValue({ status: "processing" });
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({ message: "ERR_FISCAL_NOTE_EXISTS" });

    const unknown = fakeModel({ ...errored, status: "error" });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(unknown);
    (getNfseStatus as jest.Mock).mockRejectedValue(new Error("offline"));
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({ message: "ERR_FISCAL_STATUS_CHECK_FAILED" });
    expect(enqueueFiscalNoteEmission).not.toHaveBeenCalled();
  });

  it("does not retry an errored note automatically", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    const errored = fakeModel({ id: 5, invoiceId: 28, status: "error" });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(errored);
    await requestFiscalNoteEmission({ invoiceId: 28, trigger: "auto" });
    expect(errored.update).not.toHaveBeenCalled();
    expect(enqueueFiscalNoteEmission).not.toHaveBeenCalled();
  });

  it("emits nothing automatically unless NOTAAS_AUTO_EMIT_ENABLED is on", async () => {
    delete process.env.NOTAAS_AUTO_EMIT_ENABLED;
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "auto" })
    ).resolves.toBeNull();
    expect(Invoices.findByPk).not.toHaveBeenCalled();

    process.env.NOTAAS_AUTO_EMIT_ENABLED = "true";
    delete process.env.NOTAAS_AUTO_EMIT_SINCE;
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "auto" })
    ).resolves.toBeNull();
    expect(FiscalNote.create).not.toHaveBeenCalled();

    // O botão manual continua funcionando com o automático desligado.
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    (getFiscalProfile as jest.Mock).mockResolvedValue(completeProfile());
    await requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" });
    expect(enqueueFiscalNoteEmission).toHaveBeenCalled();
  });

  it("does not emit automatically for invoices paid before the start date", async () => {
    (Invoices.findByPk as jest.Mock).mockResolvedValue(
      paidInvoice({ paidAt: new Date("2026-10-15T12:00:00Z") })
    );
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "auto" })
    ).resolves.toBeNull();
    expect(FiscalNote.create).not.toHaveBeenCalled();
  });

  it("reconciles invoices paid in a dedicated runtime (which never emits)", async () => {
    (FiscalNote.findAll as jest.Mock).mockResolvedValue([]);
    (Invoices.findAll as jest.Mock).mockResolvedValue([{ id: 30 }]);
    (Invoices.findByPk as jest.Mock).mockResolvedValue(
      paidInvoice({
        id: 30,
        companyId: 9,
        company: { id: 9, slug: "dedicado" }
      })
    );
    (getFiscalProfile as jest.Mock).mockResolvedValue(
      completeProfile({ companyId: 9 })
    );

    await reconcileFiscalNotes();

    const query = (Invoices.findAll as jest.Mock).mock.calls[0][0];
    expect(query.where.status).toBe("paid");
    expect(query.where.paidAt).toBeDefined();
    expect(FiscalNote.create).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 30, companyId: 9, trigger: "auto" })
    );
    expect(enqueueFiscalNoteEmission).toHaveBeenCalled();
  });

  it("does not look for missing notes while the automatic mode is off", async () => {
    delete process.env.NOTAAS_AUTO_EMIT_ENABLED;
    (FiscalNote.findAll as jest.Mock).mockResolvedValue([]);
    await reconcileFiscalNotes();
    expect(Invoices.findAll).not.toHaveBeenCalled();
  });

  describe("queue worker", () => {
    const queuedNote = () =>
      fakeModel({
        id: 5,
        invoiceId: 28,
        companyId: 7,
        status: "queued",
        emissionAttempt: 1
      });

    beforeEach(() => {
      (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
      (getFiscalProfile as jest.Mock).mockResolvedValue(completeProfile());
    });

    it("sends service 010501, ISS 5%, the invoice value and the idempotency key", async () => {
      const note = queuedNote();
      (FiscalNote.findByPk as jest.Mock).mockResolvedValue(note);
      (emitNfse as jest.Mock).mockResolvedValue({
        invoiceId: "inv-1",
        status: "queued"
      });

      await processFiscalNoteEmission(5, { finalAttempt: false });

      const [payload, key] = (emitNfse as jest.Mock).mock.calls[0];
      expect(key).toBe("ew-invoice-28");
      expect(payload).toEqual(
        expect.objectContaining({
          servico: {
            codigo: "010501",
            descricao:
              "Licença de uso do software Espaço Whats — Plano Pro — competência 11/2026"
          },
          valores: { total: 149.9, aliquotaIss: 5 },
          competencia: "2026-11",
          referencia: "EW-28"
        })
      );
      expect(payload.tomador).toEqual(
        expect.objectContaining({
          cnpj: "11222333000181",
          razaoSocial: "Empresa Exemplo Ltda",
          endereco: expect.objectContaining({ cep: "01001000", uf: "SP" })
        })
      );
      expect(note.status).toBe("processing");
      expect(note.providerInvoiceId).toBe("inv-1");
    });

    it("skips notes that are no longer queued", async () => {
      (FiscalNote.findByPk as jest.Mock).mockResolvedValue(
        fakeModel({ id: 5, status: "processing" })
      );
      await processFiscalNoteEmission(5, { finalAttempt: false });
      expect(emitNfse).not.toHaveBeenCalled();
    });

    it("marks a rejection (422) as error without retrying", async () => {
      const note = queuedNote();
      (FiscalNote.findByPk as jest.Mock).mockResolvedValue(note);
      (emitNfse as jest.Mock).mockRejectedValue(
        new NotaasApiError({
          message: "certificado ausente",
          code: "CONFIG_ERROR",
          status: 422,
          retryable: false
        })
      );
      await expect(
        processFiscalNoteEmission(5, { finalAttempt: false })
      ).resolves.toBeUndefined();
      expect(note.status).toBe("error");
      expect(note.errorCode).toBe("CONFIG_ERROR");
    });

    it("lets the queue retry 429/500 and records a transient failure at the end", async () => {
      const note = queuedNote();
      (FiscalNote.findByPk as jest.Mock).mockResolvedValue(note);
      const unavailable = new NotaasApiError({
        message: "busy",
        code: "HTTP_500",
        status: 500,
        retryable: true
      });
      (emitNfse as jest.Mock).mockRejectedValue(unavailable);
      await expect(
        processFiscalNoteEmission(5, { finalAttempt: false })
      ).rejects.toBe(unavailable);
      expect(note.status).toBe("queued");

      await processFiscalNoteEmission(5, { finalAttempt: true });
      expect(note.status).toBe("error");
      expect(note.errorCode).toBe(TRANSIENT_FAILURE_CODE);
    });

    it("waits for fiscal data removed after queueing", async () => {
      const note = queuedNote();
      (FiscalNote.findByPk as jest.Mock).mockResolvedValue(note);
      (getFiscalProfile as jest.Mock).mockResolvedValue(null);
      await processFiscalNoteEmission(5, { finalAttempt: false });
      expect(emitNfse).not.toHaveBeenCalled();
      expect(note.status).toBe("pending_fiscal_data");
    });
  });

  describe("provider status", () => {
    const accessKey =
      "355030821" +
      "11222333000181" +
      "0000000012345" +
      "2611" +
      "123456789" +
      "0";

    it("derives the short number from the access key", () => {
      expect(accessKey).toHaveLength(50);
      expect(shortNumberFromAccessKey(accessKey)).toBe("12345");
      expect(shortNumberFromAccessKey("123")).toBeNull();
    });

    it("applies issued data and never goes back", async () => {
      const note = fakeModel({ id: 5, status: "processing" });
      await applyProviderStatus(note, {
        status: "issued",
        chNFSe: accessKey,
        pdfUrl: "https://storage.notaas.com.br/a.pdf"
      });
      expect(note.status).toBe("issued");
      expect(note.accessKey).toBe(accessKey);
      expect(serializeFiscalNote(note)).toEqual(
        expect.objectContaining({
          status: "issued",
          hasPdf: true,
          hasXml: false
        })
      );

      await applyProviderStatus(note, { status: "processing" });
      expect(note.status).toBe("issued");
      await applyProviderStatus(note, { status: "error", errorCode: "E1" });
      expect(note.status).toBe("issued");
      expect(note.errorCode).toBeNull();

      const cancelled = fakeModel({ id: 6, status: "cancelled" });
      await applyProviderStatus(cancelled, { status: "issued" });
      expect(cancelled.update).not.toHaveBeenCalled();
    });

    it("shows queued notes as processing", () => {
      expect(
        serializeFiscalNote(fakeModel({ id: 1, status: "queued" })).status
      ).toBe("processing");
      expect(serializeFiscalNote(null)).toBeNull();
    });
  });

  describe("documents and cancellation", () => {
    const issued = () =>
      fakeModel({
        id: 5,
        invoiceId: 28,
        companyId: 7,
        status: "issued",
        number: "12345",
        providerInvoiceId: "inv-1",
        pdfUrl: "https://storage.notaas.com.br/files/a.pdf",
        xmlUrl: null
      });

    it("serves documents only for the invoice's own company, or the platform", async () => {
      (FiscalNote.findOne as jest.Mock).mockResolvedValue(issued());
      await expect(
        resolveFiscalDocument(28, "pdf", { companyId: 99 })
      ).rejects.toMatchObject({
        message: "ERR_FISCAL_NOTE_NOT_FOUND",
        statusCode: 404
      });
      await expect(
        resolveFiscalDocument(28, "pdf", { companyId: 7 })
      ).resolves.toEqual(
        expect.objectContaining({
          filename: "nota-fiscal-12345.pdf",
          contentType: "application/pdf"
        })
      );
      await expect(resolveFiscalDocument(28, "pdf", {})).resolves.toBeTruthy();
    });

    it("refuses document URLs outside the provider's storage", async () => {
      (FiscalNote.findOne as jest.Mock).mockResolvedValue(
        fakeModel({ ...issued(), pdfUrl: "https://example.org/a.pdf" })
      );
      await expect(resolveFiscalDocument(28, "pdf", {})).rejects.toMatchObject({
        message: "ERR_FISCAL_DOCUMENT_NOT_READY"
      });
    });

    it("validates the cancellation reason and only cancels issued notes", async () => {
      await expect(cancelFiscalNote(28, "curto")).rejects.toMatchObject({
        message: "ERR_FISCAL_CANCEL_REASON"
      });
      (FiscalNote.findOne as jest.Mock).mockResolvedValue(
        fakeModel({ id: 5, status: "processing" })
      );
      await expect(
        cancelFiscalNote(28, "Fatura emitida em duplicidade")
      ).rejects.toMatchObject({ message: "ERR_FISCAL_NOTE_NOT_CANCELLABLE" });

      const note = issued();
      (FiscalNote.findOne as jest.Mock).mockResolvedValue(note);
      await cancelFiscalNote(28, "Fatura emitida em duplicidade", 3);
      expect(cancelNfse).toHaveBeenCalledWith(
        "inv-1",
        "Fatura emitida em duplicidade"
      );
      expect(note.status).toBe("cancelling");
    });
  });
});
