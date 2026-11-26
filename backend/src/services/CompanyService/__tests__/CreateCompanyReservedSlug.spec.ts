/* eslint-disable @typescript-eslint/no-explicit-any */
import CreateCompanyService from "../CreateCompanyService";
import Company from "../../../models/Company";

jest.mock("../../../database", () => ({
  __esModule: true,
  default: { transaction: jest.fn() }
}));
jest.mock("../../../models/Company", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() }
}));

describe("company creation (admin screen, public signup, partner and platform API)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BILLING_CONSOLE_SLUGS = "somosespaco";
  });

  it.each(["teste", "somosespaco", "admin", "cobranca"])(
    "refuses the reserved slug %s before touching the database",
    async slug => {
      await expect(
        CreateCompanyService({
          name: "Empresa Exemplo",
          email: "contato@example.com",
          slug,
          whatsappMode: "normal"
        } as any)
      ).rejects.toMatchObject({ message: "ERR_COMPANY_SLUG_RESERVED" });
      expect(Company.findOne).not.toHaveBeenCalled();
      expect(Company.create).not.toHaveBeenCalled();
    }
  );
});
