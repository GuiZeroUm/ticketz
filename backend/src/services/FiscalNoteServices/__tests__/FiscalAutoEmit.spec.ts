/* eslint-disable @typescript-eslint/no-explicit-any */
import { autoEmitAppliesTo, fiscalNoteSettings } from "../FiscalNoteService";
import { serializeBillingInvoice } from "../../BillingAdminServices/SerializeBillingInvoice";

jest.mock("../../../models/FiscalNote", () => ({
  __esModule: true,
  default: {}
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
jest.mock("../../../models/FiscalNoteWebhookDelivery", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/User", () => ({ __esModule: true, default: {} }));
jest.mock("../fiscalNoteQueue", () => ({
  enqueueFiscalNoteEmission: jest.fn()
}));
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../PaymentGatewayServices/PaymentGatewayServices", () => ({
  payGatewayReceiptUrl: () => null
}));
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const SINCE = "2026-11-24T00:00:00.000Z";
const client = { id: 7, slug: "cliente-exemplo" };
const open = (overrides: Record<string, any> = {}) =>
  ({
    status: "open",
    value: "99.90",
    paidAt: null,
    company: client,
    ...overrides
  }) as any;

describe("automatic fiscal note flag for the billing console", () => {
  beforeEach(() => {
    process.env.NOTAAS_ENABLED = "true";
    process.env.NOTAAS_API_KEY = "test-key";
    process.env.NOTAAS_AUTO_EMIT_ENABLED = "true";
    process.env.NOTAAS_AUTO_EMIT_SINCE = SINCE;
    delete process.env.TENANT_RUNTIME_COMPANY_ID;
    delete process.env.QUEUE_PREFIX;
  });

  it("is false with the automatic mode off (production default)", () => {
    delete process.env.NOTAAS_AUTO_EMIT_ENABLED;
    expect(autoEmitAppliesTo(open())).toBe(false);
    expect(fiscalNoteSettings()).toEqual({
      enabled: true,
      autoEmitEnabled: false,
      autoEmitSince: null
    });
  });

  it("is false without a valid start date or with emission off", () => {
    delete process.env.NOTAAS_AUTO_EMIT_SINCE;
    expect(autoEmitAppliesTo(open())).toBe(false);
    process.env.NOTAAS_AUTO_EMIT_SINCE = SINCE;
    process.env.NOTAAS_ENABLED = "false";
    expect(autoEmitAppliesTo(open())).toBe(false);
    expect(fiscalNoteSettings().enabled).toBe(false);
  });

  it("is true for an open invoice and for one paid since the start date", () => {
    expect(autoEmitAppliesTo(open())).toBe(true);
    expect(
      autoEmitAppliesTo(
        open({ status: "paid", paidAt: new Date("2026-11-25T10:00:00Z") })
      )
    ).toBe(true);
    expect(fiscalNoteSettings()).toEqual({
      enabled: true,
      autoEmitEnabled: true,
      autoEmitSince: SINCE
    });
  });

  it("is false for invoices paid before the start date, cancelled, free or of the platform", () => {
    expect(
      autoEmitAppliesTo(
        open({ status: "paid", paidAt: new Date("2026-11-20T10:00:00Z") })
      )
    ).toBe(false);
    expect(autoEmitAppliesTo(open({ status: "cancelled" }))).toBe(false);
    expect(autoEmitAppliesTo(open({ value: "0" }))).toBe(false);
    expect(autoEmitAppliesTo(open({ company: { id: 1, slug: "teste" } }))).toBe(
      false
    );
  });

  it("is false in a dedicated runtime, which never emits", () => {
    process.env.TENANT_RUNTIME_COMPANY_ID = "9";
    process.env.QUEUE_PREFIX = "dedicado";
    expect(autoEmitAppliesTo(open())).toBe(false);
    expect(fiscalNoteSettings().enabled).toBe(false);
  });

  it("travels in the serialized invoice, false when absent", () => {
    const invoice = {
      id: 28,
      companyId: 7,
      value: "99.90",
      status: "paid"
    } as any;
    expect(
      serializeBillingInvoice(invoice, { fiscalAutoEmit: true }).fiscalAutoEmit
    ).toBe(true);
    expect(serializeBillingInvoice(invoice).fiscalAutoEmit).toBe(false);
  });
});
