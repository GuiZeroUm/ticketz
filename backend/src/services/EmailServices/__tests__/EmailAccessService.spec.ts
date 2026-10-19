import Company from "../../../models/Company";
import Setting from "../../../models/Setting";
import {
  EMAIL_SETTING_KEY,
  assertEmailEnabled,
  emailEnabledForCompany
} from "../EmailAccessService";

const mockSetting = (value: string) =>
  jest.spyOn(Setting, "findOne").mockResolvedValue({ value } as Setting);
const mockCompany = (company: { status: boolean } | null) =>
  jest.spyOn(Company, "findByPk").mockResolvedValue(company as Company);

describe("EmailAccessService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the emailChannelEnabled setting key", () => {
    expect(EMAIL_SETTING_KEY).toBe("emailChannelEnabled");
  });

  it("is disabled when the setting is missing", async () => {
    jest.spyOn(Setting, "findOne").mockResolvedValue(null);
    mockCompany({ status: true });
    await expect(emailEnabledForCompany(7)).resolves.toBe(false);
  });

  it("reads the setting scoped to the company and key", async () => {
    const findOne = mockSetting("true");
    mockCompany({ status: true });
    await emailEnabledForCompany(7);
    expect(findOne).toHaveBeenCalledWith({
      where: { companyId: 7, key: "emailChannelEnabled" }
    });
  });

  it("is enabled only for value 'true' on an active company", async () => {
    mockSetting("true");
    mockCompany({ status: true });
    await expect(emailEnabledForCompany(7)).resolves.toBe(true);
  });

  it.each(["false", "1", "yes", "TRUE", ""])(
    "is disabled for setting value %p",
    async value => {
      mockSetting(value);
      mockCompany({ status: true });
      await expect(emailEnabledForCompany(7)).resolves.toBe(false);
    }
  );

  it("is disabled when the setting is on but the company is inactive", async () => {
    mockSetting("true");
    mockCompany({ status: false });
    await expect(emailEnabledForCompany(7)).resolves.toBe(false);
  });

  it("is disabled when the company does not exist", async () => {
    mockSetting("true");
    mockCompany(null);
    await expect(emailEnabledForCompany(7)).resolves.toBe(false);
  });

  it("assertEmailEnabled throws ERR_EMAIL_CHANNEL_DISABLED with 403", async () => {
    mockSetting("false");
    mockCompany({ status: true });
    await expect(assertEmailEnabled(7)).rejects.toMatchObject({
      message: "ERR_EMAIL_CHANNEL_DISABLED",
      statusCode: 403
    });
  });

  it("assertEmailEnabled resolves when the channel is enabled", async () => {
    mockSetting("true");
    mockCompany({ status: true });
    await expect(assertEmailEnabled(7)).resolves.toBeUndefined();
  });
});
