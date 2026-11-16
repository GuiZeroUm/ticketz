import { sign } from "jsonwebtoken";
import isAuth from "../../middleware/isAuth";

jest.mock("../../config/auth", () => ({
  __esModule: true,
  default: { secret: "segredo-de-teste", expiresIn: "15m" }
}));
jest.mock("../../models/Company", () => ({
  __esModule: true,
  default: {
    findByPk: jest
      .fn()
      .mockResolvedValue({ status: true, platformStatus: "ativo" })
  }
}));
jest.mock("../../helpers/tenantRuntime", () => ({
  assertRuntimeCompany: jest.fn()
}));
jest.mock("../../services/CompanyService/CompanyTimezoneService", () => ({
  initializeCompanyTimezone: jest.fn().mockResolvedValue(undefined)
}));

const authenticate = async (payload: Record<string, unknown>) => {
  const token = sign(payload, "segredo-de-teste");
  const req = {
    headers: { authorization: `Bearer ${token}` },
    get: () => undefined
  } as never as { user?: { isSuper: boolean } };
  await isAuth(req as never, {} as never, jest.fn());
  return req.user;
};

describe("isAuth: claim de super admin", () => {
  beforeEach(() => {
    delete process.env.MASTER_COMPANY_ID;
  });

  it("marca isSuper para o super da empresa master", async () => {
    const user = await authenticate({
      id: 1,
      profile: "admin",
      super: true,
      companyId: 1
    });
    expect(user?.isSuper).toBe(true);
  });

  it("nao marca isSuper para usuario super de empresa cliente", async () => {
    const user = await authenticate({
      id: 40,
      profile: "admin",
      super: true,
      companyId: 7
    });
    expect(user?.isSuper).toBe(false);
  });
});
