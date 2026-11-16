import User from "../../models/User";
import { decodeRefreshToken } from "../../helpers/DecodeRefreshToken";
import { impersonate, backToSuper } from "../SessionController";

jest.mock("../../models/User", () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: jest.fn() }
}));
jest.mock("../../models/Company", () => ({
  __esModule: true,
  default: class MockCompany {}
}));
jest.mock("../../models/Setting", () => ({
  __esModule: true,
  default: class MockSetting {}
}));
jest.mock("../../models/Translation", () => ({
  __esModule: true,
  default: class MockTranslation {}
}));
jest.mock("../../libs/socket", () => ({
  getIO: () => ({ to: () => ({ emit: jest.fn() }) })
}));
jest.mock("../../services/UserServices/AuthUserService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/AuthServices/RefreshTokenService", () => ({
  RefreshTokenService: jest.fn()
}));
jest.mock("../../services/AuthServices/FindUserFromToken", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/UserServices/LoginFlowService", () => ({
  identifyLogin: jest.fn(),
  inspectActivation: jest.fn(),
  setupInitialPassword: jest.fn()
}));
jest.mock("../../helpers/SendRefreshToken", () => ({
  SendRefreshToken: jest.fn()
}));
jest.mock("../../helpers/CreateTokens", () => ({
  createAccessToken: jest.fn(() => "access"),
  createRefreshToken: jest.fn(() => "refresh")
}));
jest.mock("../../helpers/SerializeUser", () => ({
  SerializeUser: jest.fn(async user => ({
    id: user.id,
    companyId: user.companyId
  }))
}));
jest.mock("../../helpers/DecodeRefreshToken", () => ({
  decodeRefreshToken: jest.fn()
}));

const findByPk = User.findByPk as jest.Mock;
const findOne = User.findOne as jest.Mock;
const decode = decodeRefreshToken as jest.Mock;

const response = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  } as Record<string, jest.Mock>;
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const request = (userId: number, companyId: number) =>
  ({
    cookies: { jrt: "refresh-cookie" },
    params: { companyId: "7" },
    user: { id: String(userId), companyId, profile: "admin" }
  }) as never;

describe("SessionController: personificacao", () => {
  beforeEach(() => {
    delete process.env.MASTER_COMPANY_ID;
    findByPk.mockReset();
    findOne.mockReset();
    decode.mockReset();
    decode.mockReturnValue({ impersonated: false });
  });

  it("recusa admin de empresa cliente", async () => {
    findByPk.mockResolvedValue({
      id: 30,
      profile: "admin",
      super: false,
      companyId: 7
    });
    await expect(
      impersonate(request(30, 7), response() as never)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findOne).not.toHaveBeenCalled();
  });

  it("recusa usuario super de empresa cliente", async () => {
    findByPk.mockResolvedValue({
      id: 40,
      profile: "admin",
      super: true,
      companyId: 8
    });
    await expect(
      impersonate(request(40, 8), response() as never)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("permite ao super da empresa master entrar na empresa", async () => {
    findByPk.mockResolvedValue({
      id: 1,
      profile: "admin",
      super: true,
      companyId: 1
    });
    findOne.mockResolvedValue({ id: 20, companyId: 7, profile: "admin" });
    const res = response();
    await impersonate(request(1, 1), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "access",
        user: expect.objectContaining({ companyId: 7 })
      })
    );
  });

  it("volta ao super da empresa master", async () => {
    decode.mockReturnValue({ impersonated: true, originalUserId: 1 });
    findByPk.mockResolvedValue({ id: 1, super: true, companyId: 1 });
    const res = response();
    await backToSuper(request(20, 7), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("nao volta para usuario super de empresa cliente", async () => {
    decode.mockReturnValue({ impersonated: true, originalUserId: 40 });
    findByPk.mockResolvedValue({ id: 40, super: true, companyId: 8 });
    await expect(
      backToSuper(request(20, 7), response() as never)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
