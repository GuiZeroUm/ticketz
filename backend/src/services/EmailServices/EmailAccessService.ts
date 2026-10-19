import AppError from "../../errors/AppError";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import Company from "../../models/Company";

export const EMAIL_SETTING_KEY = "emailChannelEnabled";

export const emailEnabledForCompany = async (
  companyId: number
): Promise<boolean> => {
  const value = await GetCompanySetting(companyId, EMAIL_SETTING_KEY, "false");
  if (value !== "true") {
    return false;
  }
  const company = await Company.findByPk(companyId, {
    attributes: ["id", "status"]
  });
  return Boolean(company?.status);
};

export const assertEmailEnabled = async (companyId: number): Promise<void> => {
  if (!(await emailEnabledForCompany(companyId))) {
    throw new AppError("ERR_EMAIL_CHANNEL_DISABLED", 403);
  }
};
