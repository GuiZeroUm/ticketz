import CreateCompanyService from "../../services/CompanyService/CreateCompanyService";
import User from "../../models/User";

jest.mock("../../models/Company", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 50 })
  }
}));
jest.mock("../../models/User", () => ({
  __esModule: true,
  default: {
    findOrCreate: jest.fn().mockResolvedValue([{ update: jest.fn() }, true]),
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn()
  }
}));
jest.mock("../../models/Setting", () => ({
  __esModule: true,
  default: {
    findOrCreate: jest.fn().mockResolvedValue([{ update: jest.fn() }, true])
  }
}));

describe("CreateCompanyService", () => {
  it("cria apenas o admin da empresa, sem copiar usuarios super", async () => {
    await CreateCompanyService({
      name: "Empresa Nova",
      email: "admin@example.com",
      password: "senha-de-teste"
    });

    const findOrCreate = User.findOrCreate as jest.Mock;
    expect(findOrCreate).toHaveBeenCalledTimes(1);
    expect(findOrCreate.mock.calls[0][0].defaults).toEqual(
      expect.objectContaining({ profile: "admin", companyId: 50 })
    );
    expect(findOrCreate.mock.calls[0][0].defaults).not.toHaveProperty("super");
    expect(User.findAll).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });
});
