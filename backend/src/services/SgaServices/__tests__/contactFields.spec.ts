import { Transaction } from "sequelize";
import sequelize from "../../../database";
import {
  desiredContactFields,
  reconcileContactFields,
  desiredContactEmails,
  reconcileContactEmails
} from "../contactFields";
jest.mock("../../../database", () => ({
  __esModule: true,
  default: { query: jest.fn() }
}));

const member = (
  id = "1",
  contactId: number | null = 10,
  count = 0,
  amount = 0
) => ({
  id,
  match: { contactId },
  overdueCount: count,
  overdueAmount: amount
});
describe("SGA contact additional fields", () => {
  beforeEach(() => jest.clearAllMocks());
  it("formats CPF/CNPJ, deduplicates multiple memberships and omits missing documents", () => {
    const fields = desiredContactFields(
      [
        { ...member(), document: "12345678909" },
        { ...member("2"), document: "12345678909" },
        { ...member("3"), document: "12345678000195" },
        { ...member("4"), document: "123" },
        { ...member("5", null), document: "99999999999" }
      ],
      []
    );
    expect(fields.find(f => f.name === "CPF/CNPJ")).toEqual({
      contactId: 10,
      name: "CPF/CNPJ",
      value: "12.345.678/0001-95; 123.456.789-09"
    });
    expect(
      desiredContactFields([member()], []).some(f => f.name === "CPF/CNPJ")
    ).toBe(false);
  });
  it("projects only one unique usable source email per linked contact", () => {
    expect(
      desiredContactEmails([
        { ...member(), email: " USER@example.com " },
        { ...member("2"), email: "user@example.com" },
        { ...member("3", null), email: "other@example.com" }
      ])
    ).toEqual([{ contactId: 10, email: "user@example.com" }]);
    expect(
      desiredContactEmails([
        { ...member(), email: "one@example.com" },
        { ...member("2"), email: "two@example.com" }
      ])
    ).toEqual([]);
    expect(
      desiredContactEmails([
        { ...member(), email: "not-an-email" },
        { ...member("2"), email: "a@example.com;b@example.com" },
        member("3")
      ])
    ).toEqual([]);
  });
  it("reconciles native emails transactionally with tenant and ownership guards", async () => {
    const transaction = {} as Transaction;
    await reconcileContactEmails(9, [], transaction);
    const [sql, options] = (sequelize.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('c."companyId" = :companyId');
    expect(sql).toContain('c.email = c."sgaEmail"');
    expect(sql).toContain('NOT c."isGroup"');
    expect(options).toEqual({
      transaction,
      replacements: { companyId: 9, emails: "[]" }
    });
  });
  it("uses singular plate and explicitly reports no overdue bills", () => {
    expect(
      desiredContactFields([member()], [{ memberId: "1", plate: "ABC1D23" }])
    ).toEqual([
      { contactId: 10, name: "Com boletos vencidos", value: "Não" },
      { contactId: 10, name: "Placa", value: "ABC1D23" }
    ]);
  });
  it("sorts and deduplicates plates and never multiplies debt by vehicles", () => {
    const fields = desiredContactFields(
      [member("1", 10, 2, 1234.56)],
      [
        { memberId: "1", plate: "XYZ9A00" },
        { memberId: "1", plate: "ABC1D23" },
        { memberId: "1", plate: "ABC1D23" }
      ]
    );
    expect(fields.map(f => f.name)).toEqual([
      "Com boletos vencidos",
      "Placa 1",
      "Placa 2"
    ]);
    expect(fields[0].value).toMatch(/Sim — R\$\s1\.234,56/);
    expect(fields[1].value).toBe("ABC1D23");
  });
  it("updates paid debt, reduces multiple plates to one, and clears removed plates", () => {
    const before = desiredContactFields(
      [member("1", 10, 1, 90)],
      [{ memberId: "1", plate: "OLD" }]
    );
    const paid = desiredContactFields([member()], []);
    expect(before[0].value).toMatch(/90,00/);
    expect(paid).toEqual([
      { contactId: 10, name: "Com boletos vencidos", value: "Não" },
      { contactId: 10, name: "Placa", value: "Nenhuma placa vinculada no SGA" }
    ]);
  });
  it("does not project unmatched/ambiguous members and aggregates multiple memberships once", () => {
    const fields = desiredContactFields(
      [
        member("1", null, 1, 100),
        member("2", 10, 1, 20),
        member("3", 10, 1, 30),
        member("3", 10, 1, 30)
      ],
      []
    );
    expect(fields[0].value).toMatch(/50,00/);
    expect(desiredContactFields([member("1", null)], [])).toEqual([]);
  });
  it("scopes reconciliation to source+tenant and uses the publication transaction", async () => {
    const transaction = {} as Transaction;
    await reconcileContactFields(9, [], transaction);
    expect(sequelize.query).toHaveBeenCalledTimes(3);
    (sequelize.query as jest.Mock).mock.calls.forEach(([sql, options]) => {
      expect(sql).toContain('c."companyId" = :companyId');
      expect(sql).toContain('"managedBy"');
      expect(options.transaction).toBe(transaction);
      expect(options.replacements).toEqual({
        companyId: 9,
        source: "acnorte-sga",
        fields: "[]"
      });
    });
  });
});
