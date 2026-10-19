import { Request, Response } from "express";
import { SUPER_MANAGED_SETTING_KEYS, update } from "../SettingController";
import UpdateSettingService from "../../services/SettingServices/UpdateSettingService";

jest.mock("../../services/SettingServices/UpdateSettingService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/SettingServices/ListSettingsService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/SettingServices/GetPublicSettingService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/SettingServices/GetSettingService", () => ({
  __esModule: true,
  GetSettingService: jest.fn()
}));
jest.mock("../../helpers/brandingFiles", () => ({
  __esModule: true,
  default: jest.fn()
}));

const request = (key: string, isSuper: boolean) =>
  ({
    params: { settingKey: key },
    body: { value: "true" },
    user: { id: "1", companyId: 7, profile: "admin", isSuper }
  }) as unknown as Request;
const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

describe("SettingController.update super-managed keys", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("lists emailChannelEnabled as super-managed", () => {
    expect(SUPER_MANAGED_SETTING_KEYS).toEqual(["emailChannelEnabled"]);
  });

  it("rejects PUT /settings/emailChannelEnabled from a non-super admin with ERR_NO_PERMISSION 403", async () => {
    await expect(
      update(request("emailChannelEnabled", false), response())
    ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
    expect(UpdateSettingService).not.toHaveBeenCalled();
  });

  it("lets a super user update emailChannelEnabled", async () => {
    (UpdateSettingService as jest.Mock).mockResolvedValue({ key: "x" });
    const res = response();
    await update(request("emailChannelEnabled", true), res);
    expect(UpdateSettingService).toHaveBeenCalledWith({
      key: "emailChannelEnabled",
      value: "true",
      companyId: 7
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("still lets a non-super admin update ordinary keys", async () => {
    (UpdateSettingService as jest.Mock).mockResolvedValue({ key: "x" });
    await update(request("userRating", false), response());
    expect(UpdateSettingService).toHaveBeenCalled();
  });

  it("still blocks underscore keys for non-super users", async () => {
    await expect(
      update(request("_internal", false), response())
    ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
  });
});
