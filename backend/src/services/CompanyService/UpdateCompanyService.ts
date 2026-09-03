import { Op, Transaction } from "sequelize";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Invoices from "../../models/Invoices";
import Setting from "../../models/Setting";
import normalizeSlug from "../../helpers/normalizeSlug";
import { revokeCompanyMcpGrants } from "../McpServices/RevokeMcpGrantsService";
import { assertVoiceCompanyAllowlisted } from "../VoiceServices/VoiceAccessService";
import { disableCompanyVoiceConnections } from "../VoiceServices/VoiceService";

interface CompanyData {
  name: string;
  id?: number | string;
  phone?: string;
  email?: string;
  status?: boolean;
  planId?: number;
  campaignsEnabled?: boolean;
  voiceCallsEnabled?: boolean;
  dueDate?: string | null;
  recurrence?: string;
  language?: string;
  slug?: string;
  partnerId?: number | null;
  saleValue?: number | null;
  introValue?: number | null;
  introMonths?: number | null;
  platformCost?: number | null;
}

const UpdateCompanyService = async (
  companyData: CompanyData,
  options: { transaction?: Transaction } = {}
): Promise<Company> => {
  const { transaction } = options;
  const company = await Company.findByPk(companyData.id, { transaction });
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
  const wasActive = company.status;
  const previousDueDate = company.dueDate;
  const previousSaleValue = company.saleValue;
  const previousIntroValue = company.introValue;
  const previousIntroMonths = company.introMonths;

  const hasPartnerId = companyData.partnerId !== undefined;
  const hasSaleValue = companyData.saleValue !== undefined;
  const hasIntroValue = companyData.introValue !== undefined;
  const hasIntroMonths = companyData.introMonths !== undefined;
  const hasPlatformCost = companyData.platformCost !== undefined;

  const hasSlug = companyData.slug !== undefined;
  const slug = hasSlug ? normalizeSlug(companyData.slug) : undefined;

  if (slug) {
    const companyWithSameSlug = await Company.findOne({
      where: { slug, id: { [Op.ne]: company.id } },
      transaction
    });

    if (companyWithSameSlug) {
      throw new AppError("ERR_COMPANY_SLUG_ALREADY_EXISTS");
    }
  }

  await company.update(
    {
      name,
      phone,
      email,
      status,
      planId,
      dueDate,
      recurrence,
      language,
      ...(hasSlug ? { slug: slug || null } : {}),
      ...(hasPartnerId ? { partnerId: companyData.partnerId || null } : {}),
      ...(hasSaleValue ? { saleValue: companyData.saleValue ?? null } : {}),
      ...(hasIntroValue ? { introValue: companyData.introValue ?? null } : {}),
      ...(hasIntroMonths
        ? { introMonths: companyData.introMonths ?? null }
        : {}),
      ...(hasPlatformCost
        ? { platformCost: companyData.platformCost ?? null }
        : {})
    },
    { transaction }
  );

  if (
    (wasActive !== false && status === false) ||
    (dueDate !== undefined && dueDate !== previousDueDate)
  ) {
    if (!transaction) {
      await revokeCompanyMcpGrants(company.id);
    }
  }

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
      },
      transaction
    });
    if (!created) {
      await setting.update({ value: `${campaignsEnabled}` }, { transaction });
    }
  }

  if (companyData.voiceCallsEnabled !== undefined) {
    if (companyData.voiceCallsEnabled) {
      assertVoiceCompanyAllowlisted(company.id);
    }
    const [setting, created] = await Setting.findOrCreate({
      where: {
        companyId: company.id,
        key: "voiceCallsEnabled"
      },
      defaults: {
        companyId: company.id,
        key: "voiceCallsEnabled",
        value: `${companyData.voiceCallsEnabled}`
      },
      transaction
    });
    if (!created) {
      await setting.update(
        { value: `${companyData.voiceCallsEnabled}` },
        { transaction }
      );
    }
    if (!companyData.voiceCallsEnabled) {
      if (transaction) {
        transaction.afterCommit(() =>
          disableCompanyVoiceConnections(company.id)
        );
      } else {
        await disableCompanyVoiceConnections(company.id);
      }
    }
  }

  if (dueDate && new Date(dueDate) > new Date()) {
    await Invoices.destroy({
      where: {
        companyId: company.id,
        status: "open",
        dueDate: { [Op.lte]: dueDate },
        origem: { [Op.ne]: "plataforma" },
        externalRef: null
      },
      transaction
    });
  }

  // Sem isso a mudanca de preco so valeria no ciclo seguinte: a fatura em
  // aberto ja teria nascido com o valor antigo. Vale para os tres campos que
  // determinam o preco do ciclo — mensalidade, valor do periodo inicial e
  // duracao dele —, senao um periodo inicial recem-definido nasceria atrasado.
  const priceChanged =
    (hasSaleValue && (companyData.saleValue ?? null) !== previousSaleValue) ||
    (hasIntroValue &&
      (companyData.introValue ?? null) !== previousIntroValue) ||
    (hasIntroMonths &&
      (companyData.introMonths ?? null) !== previousIntroMonths);

  if (priceChanged) {
    await Invoices.destroy({
      where: {
        companyId: company.id,
        status: "open",
        origem: { [Op.ne]: "plataforma" },
        externalRef: null
      },
      transaction
    });
  }

  if (planId && previousPlanId !== planId) {
    await Invoices.destroy({
      where: {
        companyId: company.id,
        status: "open",
        origem: { [Op.ne]: "plataforma" },
        externalRef: null
      },
      transaction
    });
  }

  return company;
};

export default UpdateCompanyService;
