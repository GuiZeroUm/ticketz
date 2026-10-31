import Setting from "../../models/Setting";
import {
  GetCompanySetting,
  clearCompanySettingCache,
  invalidateCompanySetting
} from "../CheckSettings";

jest.mock("../../models/Setting", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));

describe("GetCompanySetting cache", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    clearCompanySettingCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads the database once within the ttl", async () => {
    (Setting.findOne as jest.Mock).mockResolvedValue({ value: "a" });
    await GetCompanySetting(9, "k", "d");
    await GetCompanySetting(9, "k", "d");
    expect(Setting.findOne).toHaveBeenCalledTimes(1);
  });

  it("expires after the ttl", async () => {
    (Setting.findOne as jest.Mock).mockResolvedValue({ value: "a" });
    await GetCompanySetting(9, "k", "d");
    jest.advanceTimersByTime(30001);
    await GetCompanySetting(9, "k", "d");
    expect(Setting.findOne).toHaveBeenCalledTimes(2);
  });

  it("does not share values between companies", async () => {
    (Setting.findOne as jest.Mock)
      .mockResolvedValueOnce({ value: "a" })
      .mockResolvedValueOnce({ value: "b" });
    expect(await GetCompanySetting(9, "k", "d")).toBe("a");
    expect(await GetCompanySetting(10, "k", "d")).toBe("b");
  });

  it("caches a missing setting and still applies each caller default", async () => {
    (Setting.findOne as jest.Mock).mockResolvedValue(null);
    expect(await GetCompanySetting(9, "k", "x")).toBe("x");
    expect(await GetCompanySetting(9, "k", "y")).toBe("y");
    expect(Setting.findOne).toHaveBeenCalledTimes(1);
  });

  it("still throws for a missing setting without default", async () => {
    (Setting.findOne as jest.Mock).mockResolvedValue(null);
    await expect(GetCompanySetting(9, "k")).rejects.toMatchObject({
      message: "ERR_NO_SETTING_FOUND",
      statusCode: 404
    });
  });

  it("reads again after invalidation", async () => {
    (Setting.findOne as jest.Mock).mockResolvedValue({ value: "a" });
    await GetCompanySetting(9, "k", "d");
    invalidateCompanySetting(9, "k");
    await GetCompanySetting(9, "k", "d");
    expect(Setting.findOne).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed lookup", async () => {
    (Setting.findOne as jest.Mock)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ value: "a" });
    await expect(GetCompanySetting(9, "k", "d")).rejects.toThrow("db down");
    expect(await GetCompanySetting(9, "k", "d")).toBe("a");
  });

  it("clears everything when the cache grows past the limit", async () => {
    (Setting.findOne as jest.Mock).mockResolvedValue({ value: "a" });
    await GetCompanySetting(1, "first", "d");
    for (let i = 0; i < 5000; i += 1) {
      await GetCompanySetting(2, `k${i}`, "d");
    }
    (Setting.findOne as jest.Mock).mockClear();
    await GetCompanySetting(1, "first", "d");
    expect(Setting.findOne).toHaveBeenCalledTimes(1);
  });
});
