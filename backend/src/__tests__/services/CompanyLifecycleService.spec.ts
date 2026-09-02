import fs from "fs";
import Company from "../../models/Company";
import Setting from "../../models/Setting";
import User from "../../models/User";
import CreateCompanyService from "../../services/CompanyService/CreateCompanyService";
import DeleteCompanyService from "../../services/CompanyService/DeleteCompanyService";

jest.mock("../../models/Company");
jest.mock("../../models/Setting");
jest.mock("../../models/User");
jest.mock("../../helpers/replicateMasterSuperAdmins", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../../helpers/GetPublicPath", () => ({
  getPublicPath: jest.fn(() => "/srv/public")
}));
jest.mock("fs", () => ({
  __esModule: true,
  default: {
    rmSync: jest.fn()
  }
}));

const companyFindOne = Company.findOne as jest.MockedFunction<
  typeof Company.findOne
>;
const companyCreate = Company.create as jest.MockedFunction<
  typeof Company.create
>;
const userFindOrCreate = User.findOrCreate as jest.MockedFunction<
  typeof User.findOrCreate
>;
const settingFindOrCreate = Setting.findOrCreate as jest.MockedFunction<
  typeof Setting.findOrCreate
>;
const rmSync = fs.rmSync as jest.MockedFunction<typeof fs.rmSync>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("CreateCompanyService", () => {
  it("creates an immediately active tenant with a usable initial period", async () => {
    const company = { id: 42 } as Company;
    const user = { update: jest.fn() } as unknown as User;

    companyFindOne.mockResolvedValue(null);
    companyCreate.mockResolvedValue(company);
    userFindOrCreate.mockResolvedValue([user, true]);
    settingFindOrCreate.mockResolvedValue([{} as Setting, true]);

    await CreateCompanyService({
      name: "Tenant Novo",
      email: "tenant@example.com",
      slug: "tenant-novo",
      planId: 1
    });

    expect(companyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: true,
        dueDate: "2026-09-05",
        recurrence: "MENSAL",
        platformStatus: "ativo",
        platformBilling: "sistema"
      }),
      { transaction: undefined }
    );
  });
});

describe("DeleteCompanyService", () => {
  it("allows deleting a tenant that never created a media directory", async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    companyFindOne.mockResolvedValue({ destroy } as unknown as Company);

    await DeleteCompanyService("42");

    expect(rmSync).toHaveBeenCalledWith("/srv/public/media/42", {
      recursive: true,
      force: true
    });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(rmSync.mock.invocationCallOrder[0]).toBeLessThan(
      destroy.mock.invocationCallOrder[0]
    );
  });
});
