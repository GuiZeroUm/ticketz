/* eslint-disable @typescript-eslint/no-explicit-any -- Small in-memory SQL adapter for worker fault injection. */
import sequelize from "../../../database";
import Whatsapp from "../../../models/Whatsapp";
import Contact from "../../../models/Contact";
import { loadSga, sgaEnabled } from "../../SgaServices/service";
import { sgaRequest } from "../../SgaServices/client";
import { defaults } from "../policy";
import { processBilling, runBillingTest, saveBillingConfig } from "../service";
import { sendBillingMessage, fetchBoletoPdf } from "../transport";
jest.mock("../../../database", () => ({
  __esModule: true,
  default: { query: jest.fn(), transaction: jest.fn() }
}));
jest.mock("../../../models/Whatsapp", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn() }
}));
jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../SgaServices/service", () => ({
  assertSgaTenant: jest.fn(),
  sgaEnabled: jest.fn(),
  loadSga: jest.fn()
}));
jest.mock("../../SgaServices/client", () => ({ sgaRequest: jest.fn() }));
jest.mock("../transport", () => ({
  boletoUrl: jest.fn(u => u),
  fetchBoletoPdf: jest.fn(),
  sendBillingMessage: jest.fn(),
  testPdf: jest.fn(() => Buffer.from("%PDF-test"))
}));
const now = new Date("2026-09-14T15:00:00Z");
const bill = {
  id: "b1",
  number: "123",
  memberId: "m1",
  vehicleIds: ["v1", "v2"],
  due: "2026-09-17",
  amount: 100,
  status: "ABERTO",
  paid: false,
  countsAsDebt: true
};
const contact = {
  id: 42,
  name: "Guilherme Santos",
  number: "5568992081954",
  channel: "whatsapp"
};
const member = { id: "m1", name: "Guilherme Santos", contact };
const apiBill = {
  codigo_boleto: "b1",
  nosso_numero: "123",
  codigo_associado: "m1",
  codigo_situacao_boleto: "2",
  data_vencimento: "2026-09-17",
  valor_boleto: 100,
  link_boleto: "https://short.hinova.com.br/v2/example.pdf"
};
let config = defaults();
let ledger: any[] = [];
let source: any;
let locked = true;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(now);
  jest.clearAllMocks();
  process.env.ACNORTE_BILLING_SEND_ENABLED = "true";
  process.env.ACNORTE_BILLING_TEST_NUMBER = "5568992081954";
  delete process.env.ACNORTE_BILLING_TEST_BILL_NUMBER;
  delete process.env.ACNORTE_BILLING_TEST_MEMBER_ID;
  config = {
    ...defaults(),
    enabled: true,
    whatsappId: 10,
    termsReviewed: true
  };
  ledger = [];
  locked = true;
  source = {
    stored: {
      status: "ready",
      syncedAt: now,
      data: {
        bills: [{ ...bill }],
        billStatuses: [
          {
            codigo_situacaoboleto: "2",
            pago: "NÃO",
            considerado_inadimplencia: "Y"
          }
        ]
      }
    },
    members: [{ ...member }],
    vehicles: []
  };
  (sgaEnabled as jest.Mock).mockResolvedValue(true);
  (loadSga as jest.Mock).mockImplementation(async () => source);
  (Whatsapp.findOne as jest.Mock).mockResolvedValue({
    id: 10,
    companyId: 9,
    status: "CONNECTED"
  });
  (Contact.findOne as jest.Mock).mockResolvedValue(contact);
  (sgaRequest as jest.Mock).mockResolvedValue({ ...apiBill });
  (fetchBoletoPdf as jest.Mock).mockResolvedValue(Buffer.from("%PDF-demo"));
  (sendBillingMessage as jest.Mock).mockResolvedValue("wamid.123");
  (sequelize.transaction as jest.Mock).mockImplementation(async callback =>
    callback({ lockTransaction: true })
  );
  (sequelize.query as jest.Mock).mockImplementation(async (sql, options) => {
    const p = options?.replacements || {};
    if (sql.includes("pg_try_advisory")) return [{ locked }];
    if (sql.startsWith("SELECT config")) return [{ config }];
    if (sql.startsWith("SELECT COUNT"))
      return [
        {
          count: ledger.filter(
            d =>
              d.mode === (p.mode || "live") &&
              ["SENT", "UNCERTAIN", "SENDING"].includes(d.status)
          ).length
        }
      ];
    if (sql.startsWith('SELECT "dedupeKey"'))
      return ledger.filter(d => d.mode === "live");
    if (sql.startsWith("SELECT *"))
      return ledger.filter(d => d.dedupeKey === p.key);
    if (sql.startsWith('INSERT INTO "SgaBillingDeliveries"')) {
      if (ledger.some(d => d.dedupeKey === p.key)) return [];
      const record = {
        id: String(ledger.length + 1),
        dedupeKey: p.key,
        mode: p.mode || "live",
        status: p.status || "PREPARING"
      };
      ledger.push(record);
      return [record];
    }
    if (sql.startsWith('UPDATE "SgaBillingDeliveries" SET status=:status')) {
      Object.assign(
        ledger.find(d => d.id === p.id),
        p
      );
      return [];
    }
    return [];
  });
});
afterEach(() => {
  jest.useRealTimers();
  delete process.env.ACNORTE_BILLING_SEND_ENABLED;
  delete process.env.ACNORTE_BILLING_TEST_NUMBER;
  delete process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS;
});
it("sends only once per boleto/stage regardless of multiple vehicles or repeated ticks", async () => {
  await processBilling(9);
  await processBilling(9);
  expect(sendBillingMessage).toHaveBeenCalledTimes(1);
  expect(ledger).toHaveLength(1);
  expect(ledger[0]).toMatchObject({ status: "SENT", messageId: "wamid.123" });
  expect(sendBillingMessage).toHaveBeenCalledWith(
    expect.anything(),
    contact.number,
    expect.stringContaining("Olá, Guilherme Santos"),
    expect.any(Buffer)
  );
  const sending = (sequelize.query as jest.Mock).mock.calls.find(
    ([sql, o]) =>
      sql.includes("SET status=:status") && o.replacements.status === "SENDING"
  );
  expect(sending[1].transaction).toBeUndefined();
});
it.each([
  "disabled",
  "unowned",
  "wrongTenant",
  "paused",
  "outsideWindow",
  "stale",
  "ambiguous",
  "optout",
  "locked",
  "limit"
])("does not contact customers when %s", async condition => {
  if (condition === "disabled")
    process.env.ACNORTE_BILLING_SEND_ENABLED = "false";
  if (condition === "unowned")
    process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS = "9";
  if (condition === "wrongTenant")
    (sgaEnabled as jest.Mock).mockResolvedValue(false);
  if (condition === "paused") config.enabled = false;
  if (condition === "outsideWindow")
    jest.setSystemTime(new Date("2026-09-14T23:00:00Z"));
  if (condition === "stale") source.stored.status = "error";
  if (condition === "ambiguous")
    source.members = [{ ...member, contact: null }];
  if (condition === "optout") config.excludedContactIds = [42];
  if (condition === "locked") locked = false;
  if (condition === "limit") {
    config.dailyLimit = 1;
    ledger.push({ dedupeKey: "other", mode: "live", status: "SENT" });
  }
  await processBilling(9);
  expect(sendBillingMessage).not.toHaveBeenCalled();
});
it.each([
  { data_pagamento: "2026-09-14" },
  { codigo_situacao_boleto: "3" },
  { codigo_associado: "another" },
  { data_vencimento: "2026-09-18" }
])("rechecks SGA immediately before dispatch and skips %p", async changes => {
  (sgaRequest as jest.Mock).mockResolvedValue({ ...apiBill, ...changes });
  await processBilling(9);
  expect(sendBillingMessage).not.toHaveBeenCalled();
  expect(ledger[0].status).toBe("SKIPPED");
});
it("does not send debt details to a number changed after preview", async () => {
  (Contact.findOne as jest.Mock).mockResolvedValue({
    ...contact,
    number: "5568999999999"
  });
  await processBilling(9);
  expect(sendBillingMessage).not.toHaveBeenCalled();
  expect(ledger[0].reason).toBe("CONTACT_CHANGED");
});
it("cancels a payment received while preparing the PDF", async () => {
  (sgaRequest as jest.Mock)
    .mockResolvedValueOnce({ ...apiBill })
    .mockResolvedValueOnce({ ...apiBill, data_pagamento: "2026-09-14" });
  await processBilling(9);
  expect(fetchBoletoPdf).toHaveBeenCalled();
  expect(sendBillingMessage).not.toHaveBeenCalled();
  expect(ledger[0].reason).toBe("NO_LONGER_ELIGIBLE");
});
it("does not send a partial message when PDF fetch fails", async () => {
  (fetchBoletoPdf as jest.Mock).mockRejectedValue(new Error("unavailable"));
  await processBilling(9);
  expect(sendBillingMessage).not.toHaveBeenCalled();
  expect(ledger[0].status).toBe("FAILED");
});
it("records an ambiguous WhatsApp error without retrying it", async () => {
  (sendBillingMessage as jest.Mock).mockRejectedValue(
    new Error("socket timeout secret")
  );
  await processBilling(9);
  await processBilling(9);
  expect(sendBillingMessage).toHaveBeenCalledTimes(1);
  expect(ledger[0]).toMatchObject({
    status: "UNCERTAIN",
    reason: "ERR_BILLING_FAILED"
  });
});
it("does not claim inactivation when the live SGA contract is active", async () => {
  source.stored.data.bills = [{ ...bill, due: "2026-08-15" }];
  (sgaRequest as jest.Mock).mockResolvedValue({
    ...apiBill,
    data_vencimento: "2026-08-15",
    descricao_situacao_associado: "ATIVO"
  });
  await processBilling(9);
  expect(sendBillingMessage).not.toHaveBeenCalled();
  expect(ledger[0].reason).toBe("CONTRACT_NOT_INACTIVE");
});
it("simulates without a connection or any WhatsApp call", async () => {
  config.enabled = false;
  config.whatsappId = null;
  (Whatsapp.findOne as jest.Mock).mockResolvedValue(null);
  const result = await runBillingTest(
    9,
    1,
    -3,
    "simulation",
    "test_1234567890123456"
  );
  expect(result.status).toBe("SIMULATED");
  expect(result.body).toContain("TESTE — SEM COBRANÇA REAL");
  expect(sendBillingMessage).not.toHaveBeenCalled();
  expect(result.attachPdf).toBe(true);
});
it("real test uses only the server allowlisted number and deduplicates request ID", async () => {
  config.enabled = false;
  await runBillingTest(9, 1, 0, "test", "test_1234567890123456");
  await runBillingTest(9, 1, 0, "test", "test_1234567890123456");
  expect(sendBillingMessage).toHaveBeenCalledTimes(1);
  expect(sendBillingMessage).toHaveBeenCalledWith(
    expect.anything(),
    "5568992081954",
    expect.stringContaining("Guilherme Santos"),
    expect.any(Buffer)
  );
});
describe("authorized real boleto tests", () => {
  beforeEach(() => {
    process.env.ACNORTE_BILLING_TEST_BILL_NUMBER = "123";
    process.env.ACNORTE_BILLING_TEST_MEMBER_ID = "7";
    source.members[0].id = "7";
    source.members[0].name = "Authorized Member";
    source.stored.data.bills[0].memberId = "7";
    (sgaRequest as jest.Mock).mockResolvedValue({
      ...apiBill,
      codigo_associado: "7"
    });
    config.enabled = false;
  });
  it("fetches the exact API PDF and sends only to the test allowlist, without links", async () => {
    const result = await runBillingTest(
      9,
      1,
      0,
      "test",
      "test_1234567890123456"
    );
    expect(sgaRequest).toHaveBeenCalledWith("buscar/boleto/123");
    expect(fetchBoletoPdf).toHaveBeenCalledWith(apiBill.link_boleto);
    expect(result).toMatchObject({
      realBill: true,
      billNumber: "123",
      memberName: "Authorized Member"
    });
    expect(result.body).toContain("BOLETO REAL");
    expect(result.body).not.toContain("https://");
    expect(sendBillingMessage).toHaveBeenCalledWith(
      expect.anything(),
      "5568992081954",
      result.body,
      Buffer.from("%PDF-demo")
    );
    await runBillingTest(9, 1, 0, "test", "test_1234567890123456");
    expect(sendBillingMessage).toHaveBeenCalledTimes(1);
  });
  it("does not attach a PDF to the later reminder stages", async () => {
    await runBillingTest(9, 1, 30, "test", "test_1234567890123456");
    expect(fetchBoletoPdf).not.toHaveBeenCalled();
    expect(sendBillingMessage).toHaveBeenCalledWith(
      expect.anything(),
      "5568992081954",
      expect.stringContaining("BOLETO REAL"),
      undefined
    );
  });
  it.each([
    { codigo_associado: "other" },
    { codigo_boleto: "other" },
    { nosso_numero: "other" },
    { codigo_situacao_boleto: "unknown" },
    { valor_pagamento: 100 },
    { data_vencimento: "2026-10-01" }
  ])("rejects a changed or paid API bill: %o", async change => {
    (sgaRequest as jest.Mock).mockResolvedValue({
      ...apiBill,
      codigo_associado: "7",
      ...change
    });
    await expect(
      runBillingTest(9, 1, 0, "test", "test_1234567890123456")
    ).rejects.toMatchObject({ message: "ERR_BILLING_TEST_BILL" });
    expect(sendBillingMessage).not.toHaveBeenCalled();
  });
  it("never falls back to a fake PDF on API download failure", async () => {
    (fetchBoletoPdf as jest.Mock).mockRejectedValue(new Error("unavailable"));
    await expect(
      runBillingTest(9, 1, 0, "test", "test_1234567890123456")
    ).rejects.toThrow("unavailable");
    expect(sendBillingMessage).not.toHaveBeenCalled();
    expect(ledger).toHaveLength(0);
  });
  it("rejects incomplete real-bill authorization instead of silently using fake data", async () => {
    delete process.env.ACNORTE_BILLING_TEST_MEMBER_ID;
    await expect(
      runBillingTest(9, 1, 0, "test", "test_1234567890123456")
    ).rejects.toMatchObject({ message: "ERR_BILLING_TEST_BILL" });
    expect(sendBillingMessage).not.toHaveBeenCalled();
  });
});
it("refuses a real test without a connected dev session", async () => {
  (Whatsapp.findOne as jest.Mock).mockResolvedValue({ status: "DISCONNECTED" });
  await expect(
    runBillingTest(9, 1, 0, "test", "test_1234567890123456")
  ).rejects.toMatchObject({ message: "ERR_BILLING_CONNECTION" });
  expect(sendBillingMessage).not.toHaveBeenCalled();
});
it("activation cannot bypass the environment's validation-only gate", async () => {
  process.env.ACNORTE_BILLING_SEND_ENABLED = "false";
  await expect(saveBillingConfig(9, 1, config)).rejects.toMatchObject({
    message: "ERR_BILLING_SEND_DISABLED"
  });
});
