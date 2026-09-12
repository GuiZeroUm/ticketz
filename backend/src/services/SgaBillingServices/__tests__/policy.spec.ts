/* eslint-disable no-restricted-syntax -- Test cases exercise each invalid configuration. */
import { Bill } from "../../SgaServices/normalize";
import {
  defaults,
  OFFSETS,
  stageFor,
  inWindow,
  freshSnapshot,
  renderReminder,
  revalidateBill,
  parseConfig
} from "../policy";
import { DateTime } from "luxon";
const bill: Bill = {
  id: "123",
  number: "456",
  memberId: "m1",
  vehicleIds: ["v1", "v2"],
  due: "2026-09-14",
  amount: 99.5,
  status: "ABERTO",
  paid: false,
  countsAsDebt: true
};
const statuses = [
  { codigo_situacaoboleto: "2", pago: "NÃO", considerado_inadimplencia: "Y" }
];
const row = {
  codigo_boleto: "123",
  nosso_numero: "456",
  codigo_associado: "m1",
  codigo_situacao_boleto: "2",
  data_vencimento: "2026-09-14",
  valor_boleto: "99,50",
  data_pagamento: null
};
describe("AC Norte billing policy", () => {
  it.each(OFFSETS)("selects exactly D%+d", offset => {
    const day = DateTime.fromISO(bill.due).plus({ days: offset }).toISODate();
    expect(stageFor(bill, day)).toBe(offset);
  });
  it.each([-4, -2, -1, 2, 4, 6, 24, 26, 29, 31, 89, 91])(
    "does not backfill other days (%d)",
    offset => {
      expect(
        stageFor(
          bill,
          DateTime.fromISO(bill.due).plus({ days: offset }).toISODate()
        )
      ).toBeNull();
    }
  );
  it.each([
    { paid: true },
    { countsAsDebt: false },
    { amount: 0 },
    { due: "2026-02-30" },
    { number: "" }
  ])("ignores invalid or non-collectible bills %p", changes =>
    expect(stageFor({ ...bill, ...changes }, bill.due)).toBeNull()
  );
  it("uses Acre calendar days across UTC midnight", () => {
    const config = { ...defaults(), enabled: true };
    expect(inWindow(config, new Date("2026-09-14T13:59:59Z"))).toBe(false);
    expect(inWindow(config, new Date("2026-09-14T14:00:00Z"))).toBe(true);
    expect(inWindow(config, new Date("2026-09-14T21:59:59Z"))).toBe(true);
    expect(inWindow(config, new Date("2026-09-14T22:00:00Z"))).toBe(false);
    expect(inWindow(config, new Date("2026-09-13T15:00:00Z"))).toBe(false);
  });
  it("starts disabled and requires sender and reviewed late-stage language", () => {
    expect(parseConfig(defaults()).enabled).toBe(false);
    expect(() => parseConfig({ ...defaults(), enabled: true })).toThrow();
    expect(() =>
      parseConfig({ ...defaults(), enabled: true, whatsappId: 10 })
    ).toThrow();
    expect(
      parseConfig({
        ...defaults(),
        enabled: true,
        whatsappId: 10,
        termsReviewed: true
      }).enabled
    ).toBe(true);
  });
  it.each([
    { startHour: 18 },
    { endHour: 8 },
    { weekdays: [] },
    { weekdays: [1, 1] },
    { dailyLimit: 1000 },
    { timezone: "UTC" },
    { extra: true }
  ])("rejects unsafe settings %p", changes =>
    expect(() => parseConfig({ ...defaults(), ...changes })).toThrow()
  );
  it("rejects duplicate stages, missing required documents and unknown variables", () => {
    for (const change of [
      { offset: 0 },
      { attachPdf: false },
      { body: "Olá [senha]" }
    ]) {
      const config = defaults();
      Object.assign(config.steps[0], change);
      expect(() => parseConfig(config)).toThrow();
    }
  });
  it("personalizes every stage and attaches a PDF only before/on due date", () => {
    defaults().steps.forEach(step => {
      const body = renderReminder(
        step,
        "Guilherme Santos",
        bill,
        "https://short.hinova.com.br/v2/TEST.pdf"
      );
      expect(body).toContain("Olá, Guilherme Santos.");
      expect(body).not.toContain("[nome]");
      expect(body).not.toContain("_Boleto_");
      expect(body).toContain("Boleto: https://short.hinova.com.br/v2/TEST.pdf");
      expect(step.attachPdf).toBe(step.offset <= 0);
    });
  });
  it("interpolates once and does not duplicate an explicit boleto variable", () => {
    const body = renderReminder(
      { ...defaults().steps[0], body: "[nome] [valor] [vencimento] [boleto]" },
      "Nome [valor]",
      bill,
      "https://short.hinova.com.br/v2/T.pdf"
    );
    expect(body).toContain("Nome [valor]");
    expect(body).toContain("99,50");
    expect(body).toContain("14/09/2026");
    expect(body.match(/https:/g)).toHaveLength(1);
  });
  it("fails closed when the synchronization is missing, old or failed", () => {
    const now = new Date("2026-09-14T15:00:00Z");
    expect(
      freshSnapshot({ status: "ready", syncedAt: "2026-09-14T14:00:00Z" }, now)
    ).toBe(true);
    for (const stored of [
      { status: "error", syncedAt: now },
      { status: "syncing", syncedAt: now },
      { status: "ready", syncedAt: null },
      { status: "ready", syncedAt: "2026-09-14T13:30:00Z" }
    ])
      expect(freshSnapshot(stored, now)).toBe(false);
  });
  it("validates the fresh SGA debt status and all ownership identifiers", () =>
    expect(revalidateBill(bill, row, statuses, bill.due)).toMatchObject({
      id: bill.id,
      paid: false
    }));
  it.each([
    { codigo_associado: "other" },
    { codigo_boleto: "other" },
    { nosso_numero: "other" },
    { codigo_situacao_boleto: "1" },
    { codigo_situacao_boleto: "3" },
    { codigo_situacao_boleto: null },
    { data_pagamento: "2026-09-14" },
    { valor_pagamento: 10 },
    { parcela_paga: "SIM" },
    { data_vencimento: "2026-09-15" }
  ])("does not send after payment/cancellation/ownership change %p", changes =>
    expect(
      revalidateBill(bill, { ...row, ...changes }, statuses, bill.due)
    ).toBeNull()
  );
});
