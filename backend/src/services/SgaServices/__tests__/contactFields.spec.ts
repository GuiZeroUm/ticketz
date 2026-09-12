import { Transaction } from "sequelize";
import sequelize from "../../../database";
import { desiredContactFields, reconcileContactFields } from "../contactFields";
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
