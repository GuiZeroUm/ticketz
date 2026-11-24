/* eslint-disable @typescript-eslint/no-explicit-any */
import Invoices from "../../../models/Invoices";
import Company from "../../../models/Company";
import { processInvoicePaid } from "../PaymentGatewayServices";
import { scheduleAutoFiscalNote } from "../../FiscalNoteServices/FiscalNoteService";

jest.mock("../../../database", () => ({
  __esModule: true,
  default: {
    transaction: async (fn: (t: any) => Promise<void>) =>
      fn({ LOCK: { UPDATE: "UPDATE" } })
  }
}));
jest.mock("../../../models/Invoices", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../../models/Company", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../AbacatePayServices", () => ({}));
jest.mock("../../SettingServices/GetSuperSettingService", () => jest.fn());
jest.mock("../../PartnerServices/AccrualPartnerPayoutService", () => jest.fn());
jest.mock("../../PartnerServices/SendPartnerPayoutsService", () => jest.fn());
jest.mock("../../PlatformServices/PlatformWebhookService", () => ({
  enqueueWebhook: jest.fn()
}));
jest.mock("../../FiscalNoteServices/FiscalNoteService", () => ({
  scheduleAutoFiscalNote: jest.fn()
}));
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

const company = () => ({
  id: 7,
  dueDay: 10,
  dueDate: "2026-11-10",
  recurrence: "MENSAL",
  partnerId: null,
  update: jest.fn(),
  reload: jest.fn()
});

describe("paid invoice triggers the fiscal note", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Company.findByPk as jest.Mock).mockResolvedValue(company());
  });

  it("schedules the note when the invoice becomes paid", async () => {
    const invoice: any = {
      id: 28,
      companyId: 7,
      status: "open",
      origem: "manual",
      billingType: "regular",
      update: jest.fn(async (changes: any) => Object.assign(invoice, changes))
    };
    (Invoices.findByPk as jest.Mock).mockResolvedValue(invoice);
    await processInvoicePaid(invoice);
    expect(invoice.status).toBe("paid");
    expect(scheduleAutoFiscalNote).toHaveBeenCalledWith(28);
  });

  it("does not schedule again when the gateway replays the payment", async () => {
    const invoice: any = {
      id: 28,
      companyId: 7,
      status: "paid",
      update: jest.fn()
    };
    (Invoices.findByPk as jest.Mock).mockResolvedValue(invoice);
    await processInvoicePaid(invoice);
    expect(invoice.update).not.toHaveBeenCalled();
    expect(scheduleAutoFiscalNote).not.toHaveBeenCalled();
  });
});
