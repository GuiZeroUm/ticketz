import sequelize from "../../../database";
import Company from "../../../models/Company";
import Contact from "../../../models/Contact";
import { assertSgaTenant, syncSga, setSgaLink } from "../service";
import { sgaRequest, sgaPages } from "../client";
jest.mock("../../../database", () => ({
  __esModule: true,
  default: { query: jest.fn(), transaction: jest.fn() }
}));
jest.mock("../../../models/Company", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/ContactCustomField", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn() }
}));
jest.mock("../client");
const query = sequelize.query as jest.Mock;
const company = Company.findByPk as jest.Mock;
describe("SGA tenant isolation and atomic synchronization", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.ACNORTE_SGA_ENABLED = "true";
    process.env.ACNORTE_SGA_COMPANY_ID = "9";
    company.mockResolvedValue({ slug: "acnorte" });
  });
  afterAll(() => {
    delete process.env.ACNORTE_SGA_ENABLED;
    delete process.env.ACNORTE_SGA_COMPANY_ID;
  });
  it("requires both configured tenant id and AC Norte slug", async () => {
    await expect(assertSgaTenant(8)).rejects.toMatchObject({ statusCode: 404 });
    company.mockResolvedValueOnce({ slug: "another-tenant" });
    await expect(assertSgaTenant(9)).rejects.toMatchObject({ statusCode: 404 });
    process.env.ACNORTE_SGA_ENABLED = "false";
    await expect(assertSgaTenant(9)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("rejects manually linking a contact outside the current tenant", async () => {
    query.mockResolvedValueOnce([{ data: { members: [{ id: "4" }] } }]);
    (Contact.findOne as jest.Mock).mockResolvedValueOnce(null);
    await expect(setSgaLink(9, "4", 200, 1)).rejects.toMatchObject({
      message: "ERR_SGA_CONTACT_INVALID"
    });
    expect(Contact.findOne).toHaveBeenCalledWith({
      where: { id: 200, companyId: 9, isGroup: false }
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("retains the previous snapshot when a later upstream page fails", async () => {
    (sequelize.transaction as jest.Mock).mockImplementation(fn =>
      fn({ id: "transaction" })
    );
    query.mockImplementation(sql =>
      String(sql).includes("pg_try_advisory") ? [{ locked: true }] : []
    );
    (sgaRequest as jest.Mock)
      .mockResolvedValueOnce([
        { codigo_situacao: "1", descricao_situacao: "ATIVO" }
      ])
      .mockResolvedValueOnce([
        { codigo_situacaoboleto: "2", considerado_inadimplencia: "Y" }
      ]);
    (sgaPages as jest.Mock)
      .mockResolvedValueOnce([{ codigo_associado: "1" }])
      .mockRejectedValueOnce(new Error("upstream failed"));
    await syncSga(9);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("SET data ="))
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("status = 'error'"))
    ).toBe(true);
  });
  it("does not start duplicate sync when another worker owns the lock", async () => {
    (sequelize.transaction as jest.Mock).mockImplementation(fn => fn({}));
    query.mockResolvedValueOnce([{ locked: false }]);
    await syncSga(9);
    expect(sgaRequest).not.toHaveBeenCalled();
  });
});
