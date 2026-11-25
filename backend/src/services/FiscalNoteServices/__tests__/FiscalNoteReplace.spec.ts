/* eslint-disable @typescript-eslint/no-explicit-any */
import FiscalNote from "../../../models/FiscalNote";
import Invoices from "../../../models/Invoices";
import { enqueueFiscalNoteEmission } from "../fiscalNoteQueue";
import { getFiscalProfile } from "../FiscalProfileService";
import { cancelNfse, emitNfse, getNfseStatus } from "../NotaasClient";
import {
  applyProviderStatus,
  idempotencyKeyFor,
  maskTakerDocument,
  processFiscalNoteEmission,
  reconcileFiscalNoteReplacements,
  replaceFiscalNote,
  requestFiscalNoteEmission,
  serializeFiscalNote
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

const REASON = "Substituição por correção de dados do tomador";

const paidInvoice = () =>
  fakeModel({
    id: 28,
    companyId: 9,
    status: "paid",
    value: "149.90",
    detail: "Plano Pro",
    competencia: "2026-11",
    paidAt: new Date(),
    company: { id: 9, slug: "cliente-exemplo" }
  });

const issuedNote = (overrides: Record<string, any> = {}) =>
  fakeModel({
    id: 1,
    invoiceId: 28,
    companyId: 9,
    status: "issued",
    number: "12345",
    providerInvoiceId: "inv-1",
    emissionAttempt: 1,
    replacementPending: false,
    ...overrides
  });

describe("correct fiscal data and reissue the note (simulated provider)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NOTAAS_ENABLED = "true";
    process.env.NOTAAS_API_KEY = "test-key";
    delete process.env.NOTAAS_AUTO_EMIT_ENABLED;
    delete process.env.TENANT_RUNTIME_COMPANY_ID;
    (Invoices.findByPk as jest.Mock).mockResolvedValue(paidInvoice());
    (getFiscalProfile as jest.Mock).mockResolvedValue(
      completeProfile({ companyId: 9, email: "novo@example.com" })
    );
    (FiscalNote.max as jest.Mock).mockResolvedValue(1);
    (FiscalNote.create as jest.Mock).mockImplementation(async data =>
      fakeModel({ id: 2, ...data })
    );
  });

  it("cancels the current note and marks it for reissue", async () => {
    const note = issuedNote();
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(note);
    await replaceFiscalNote(28, REASON, 3);
    expect(cancelNfse).toHaveBeenCalledWith("inv-1", REASON);
    expect(note).toMatchObject({
      status: "cancelling",
      replacementPending: true,
      cancelReason: REASON,
      cancelStatusDetail: null
    });
    expect(note.replacementRequestedAt).toBeInstanceOf(Date);
    expect(serializeFiscalNote(note)).toMatchObject({
      status: "cancelling",
      replacementPending: true
    });
  });

  it("checks the fiscal data before cancelling anything", async () => {
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(issuedNote());
    (getFiscalProfile as jest.Mock).mockResolvedValue(null);
    await expect(replaceFiscalNote(28, REASON)).rejects.toMatchObject({
      message: "ERR_FISCAL_DATA_INCOMPLETE",
      statusCode: 422
    });
    expect(cancelNfse).not.toHaveBeenCalled();
  });

  it("only corrects an issued note and validates the reason", async () => {
    await expect(replaceFiscalNote(28, "curto")).rejects.toMatchObject({
      message: "ERR_FISCAL_CANCEL_REASON"
    });
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(
      issuedNote({ status: "processing" })
    );
    await expect(replaceFiscalNote(28, REASON)).rejects.toMatchObject({
      message: "ERR_FISCAL_NOTE_NOT_CANCELLABLE",
      statusCode: 409
    });
    expect(cancelNfse).not.toHaveBeenCalled();
  });

  it("reissues with the current data and a new idempotency key once the cancellation is confirmed", async () => {
    const old = issuedNote({ status: "cancelling", replacementPending: true });
    const created: any[] = [];
    (FiscalNote.create as jest.Mock).mockImplementation(async data => {
      const note = fakeModel({ id: 2, ...data });
      created.push(note);
      return note;
    });
    (FiscalNote.findOne as jest.Mock).mockImplementation(
      async () => created[0] || old
    );

    await applyProviderStatus(old, { status: "cancelled" });

    expect(old.status).toBe("cancelled");
    expect(FiscalNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 28,
        emissionAttempt: 2,
        trigger: "replace",
        replacesNumber: "12345",
        status: "queued"
      })
    );
    expect(idempotencyKeyFor(created[0])).toBe("ew-invoice-28-r2");
    expect(enqueueFiscalNoteEmission).toHaveBeenCalledWith(created[0]);
    expect(old.replacementPending).toBe(false);
    expect(serializeFiscalNote(created[0]).replacesNumber).toBe("12345");
  });

  it("does not reissue when the cancellation is rejected or under analysis", async () => {
    const rejected = issuedNote({
      status: "cancelling",
      replacementPending: true
    });
    await applyProviderStatus(rejected, {
      status: "issued",
      cancelOutcome: "rejected"
    });
    expect(rejected).toMatchObject({
      status: "issued",
      replacementPending: false,
      cancelStatusDetail: "CANCEL_REJECTED"
    });

    const analysis = issuedNote({
      status: "cancelling",
      replacementPending: true
    });
    await applyProviderStatus(analysis, {
      status: "issued",
      cancelOutcome: "pending_analysis"
    });
    expect(analysis).toMatchObject({
      status: "issued",
      replacementPending: false,
      cancelStatusDetail: "CANCEL_PENDING_ANALYSIS"
    });
    expect(FiscalNote.create).not.toHaveBeenCalled();
  });

  it("follows the cancellation every minute without the webhook and reissues", async () => {
    const old = issuedNote({
      status: "cancelling",
      replacementPending: true,
      replacementRequestedAt: new Date()
    });
    const created: any[] = [];
    (FiscalNote.create as jest.Mock).mockImplementation(async data => {
      const note = fakeModel({ id: 2, ...data });
      created.push(note);
      return note;
    });
    (FiscalNote.findOne as jest.Mock).mockImplementation(
      async () => created[0] || old
    );
    (FiscalNote.findAll as jest.Mock)
      .mockResolvedValueOnce([old])
      .mockResolvedValueOnce([]);
    (getNfseStatus as jest.Mock).mockResolvedValue({
      status: "cancelled",
      cancelOutcome: "approved"
    });

    await reconcileFiscalNoteReplacements();

    expect(getNfseStatus).toHaveBeenCalledWith("inv-1", undefined);
    expect(old.status).toBe("cancelled");
    expect(created).toHaveLength(1);
    expect(old.replacementPending).toBe(false);
  });

  it("retries a confirmed cancellation that is still without a new note", async () => {
    const old = issuedNote({ status: "cancelled", replacementPending: true });
    (FiscalNote.findAll as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([old]);
    const created: any[] = [];
    (FiscalNote.create as jest.Mock).mockImplementation(async data => {
      const note = fakeModel({ id: 2, ...data });
      created.push(note);
      return note;
    });
    (FiscalNote.findOne as jest.Mock).mockImplementation(
      async () => created[0] || old
    );
    await reconcileFiscalNoteReplacements();
    expect(created).toHaveLength(1);
    expect(old.replacementPending).toBe(false);
  });

  it("lets the billing console emit a new note for a cancelled one, but not during a pending reissue", async () => {
    (FiscalNote.findOne as jest.Mock).mockResolvedValue(
      issuedNote({ status: "cancelled", replacementPending: false })
    );
    const note = await requestFiscalNoteEmission({
      invoiceId: 28,
      trigger: "manual"
    });
    expect(note).toMatchObject({
      emissionAttempt: 2,
      status: "queued",
      replacesNumber: null
    });
    expect(idempotencyKeyFor(note)).toBe("ew-invoice-28-r2");

    (FiscalNote.findOne as jest.Mock).mockResolvedValue(
      issuedNote({ status: "cancelled", replacementPending: true })
    );
    await expect(
      requestFiscalNoteEmission({ invoiceId: 28, trigger: "manual" })
    ).rejects.toMatchObject({
      message: "ERR_FISCAL_NOTE_EXISTS",
      statusCode: 409
    });
  });

  it("stores and shows the taker data used in the note, masked", async () => {
    const note = fakeModel({
      id: 2,
      invoiceId: 28,
      companyId: 9,
      status: "queued",
      emissionAttempt: 2
    });
    (FiscalNote.findByPk as jest.Mock).mockResolvedValue(note);
    (emitNfse as jest.Mock).mockResolvedValue({
      invoiceId: "inv-2",
      status: "queued"
    });

    await processFiscalNoteEmission(2, { finalAttempt: false });

    const [, key] = (emitNfse as jest.Mock).mock.calls[0];
    expect(key).toBe("ew-invoice-28-r2");
    expect(note).toMatchObject({
      takerName: "Empresa Exemplo Ltda",
      takerDocumentType: "cnpj",
      takerDocumentMasked: "**.***.***/0001-81",
      takerEmail: "novo@example.com"
    });
    expect(serializeFiscalNote(note, "client")).toMatchObject({
      tomador: {
        name: "Empresa Exemplo Ltda",
        documentType: "cnpj",
        documentMasked: "**.***.***/0001-81",
        email: "novo@example.com"
      },
      replacementPending: false,
      cancelStatusDetail: null
    });
    expect(JSON.stringify(serializeFiscalNote(note))).not.toContain(
      "11222333000181"
    );
    expect(maskTakerDocument("cpf", "52998224725")).toBe("***.***.*47-25");
    expect(serializeFiscalNote(issuedNote()).tomador).toBeNull();
  });
});
