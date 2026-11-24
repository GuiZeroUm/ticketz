/* eslint-disable @typescript-eslint/no-explicit-any */
import GetSuperSettingService from "../../SettingServices/GetSuperSettingService";
import { abacateWebhook } from "../AbacatePayServices";

jest.mock("../../SettingServices/GetSuperSettingService", () => jest.fn());
jest.mock("../../../models/Invoices", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../PaymentGatewayServices", () => ({
  processInvoicePaid: jest.fn(),
  processInvoiceExpired: jest.fn()
}));
jest.mock("../../PartnerServices/SettlePartnerPayoutBatchService", () => ({
  __esModule: true,
  default: jest.fn(),
  batchIdFromExternalId: jest.fn()
}));
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const request = (secret?: { header?: string; query?: string }) =>
  ({
    header: (name: string) =>
      name.toLowerCase() === "x-webhook-secret" ? secret?.header : undefined,
    query: secret?.query ? { webhookSecret: secret.query } : {},
    body: { event: "billing.created", data: {} }
  }) as any;

describe("AbacatePay payment webhook secret", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
  });

  it("fails closed when no secret is configured", async () => {
    (GetSuperSettingService as jest.Mock).mockResolvedValue("");
    const res = response();
    await abacateWebhook(request({ query: "anything" }), res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("rejects a wrong or missing secret", async () => {
    (GetSuperSettingService as jest.Mock).mockResolvedValue("expected-secret");
    const wrong = response();
    await abacateWebhook(request({ header: "other" }), wrong);
    expect(wrong.status).toHaveBeenCalledWith(401);
    const missing = response();
    await abacateWebhook(request(), missing);
    expect(missing.status).toHaveBeenCalledWith(401);
  });

  it("accepts the secret by header or by query string", async () => {
    process.env.ABACATEPAY_WEBHOOK_SECRET = "expected-secret";
    const byHeader = response();
    await abacateWebhook(request({ header: "expected-secret" }), byHeader);
    expect(byHeader.status).not.toHaveBeenCalled();
    expect(byHeader.json).toHaveBeenCalledWith({ ok: true });
    const byQuery = response();
    await abacateWebhook(request({ query: "expected-secret" }), byQuery);
    expect(byQuery.status).not.toHaveBeenCalled();
  });
});
