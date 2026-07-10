import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Invoices from "../../models/Invoices";
import Setting from "../../models/Setting";
import normalizeSlug from "../../helpers/normalizeSlug";

interface CompanyData {
  name: string;
  id?: number | string;
  phone?: string;
  email?: string;
  status?: boolean;
  planId?: number;
  campaignsEnabled?: boolean;
  dueDate?: string;
  recurrence?: string;
  language?: string;
  slug?: string;
}

const UpdateCompanyService = async (
  companyData: CompanyData
): Promise<Company> => {
  const company = await Company.findByPk(companyData.id);
  const {
    name,
    phone,
    email,
    status,
    planId,
    campaignsEnabled,
    dueDate,
    recurrence,
    language
  } = companyData;

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  const previousPlanId = company.planId;

  const hasSlug = companyData.slug !== undefined;
  const slug = hasSlug ? normalizeSlug(companyData.slug) : undefined;

  if (slug) {
    const companyWithSameSlug = await Company.findOne({
      where: { slug, id: { [Op.ne]: company.id } }
    });

    if (companyWithSameSlug) {
      throw new AppError("ERR_COMPANY_SLUG_ALREADY_EXISTS");
    }
  }

  await company.update({
    name,
    phone,
    email,
    status,
    planId,
    dueDate,
    recurrence,
    language,
    ...(hasSlug ? { slug: slug || null } : {})
  });

  if (companyData.campaignsEnabled !== undefined) {
    const [setting, created] = await Setting.findOrCreate({
      where: {
        companyId: company.id,
        key: "campaignsEnabled"
      },
      defaults: {
        companyId: company.id,
        key: "campaignsEnabled",
        value: `${campaignsEnabled}`
      }
    });
    if (!created) {
      await setting.update({ value: `${campaignsEnabled}` });
    }
  }

  if (dueDate && new Date(dueDate) > new Date()) {
    await Invoices.destroy({
      where: {
        companyId: company.id,
        status: "open",
        dueDate: {
          [Op.lte]: dueDate
        }
      }
    });
  }

  if (planId && previousPlanId !== planId) {
    await Invoices.destroy({
      where: {
        companyId: company.id,
        status: "open"
      }
    });
  }

  return company;
};

export default UpdateCompanyService;
