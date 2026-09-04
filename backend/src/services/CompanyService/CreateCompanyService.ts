import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import User from "../../models/User";
import Setting from "../../models/Setting";
import normalizeSlug from "../../helpers/normalizeSlug";
import replicateMasterSuperAdmins from "../../helpers/replicateMasterSuperAdmins";
import { Transaction } from "sequelize";
import moment from "moment";
import {
  assertDueDay,
  assertTrialDays
} from "../BillingServices/BillingConfigService";
import {
  firstBillableDueDate,
  resolveTrialEndsAt
} from "../BillingServices/BillingDateService";

interface CompanyData {
  name: string;
  phone?: string;
  email?: string;
  password?: string;
  status?: boolean;
  planId?: number;
  campaignsEnabled?: boolean;
  dueDate?: string | null;
  trialDays?: number;
  dueDay?: number;
  recurrence?: string;
  language?: string;
  slug?: string;
  partnerId?: number | null;
  saleValue?: number | null;
  introValue?: number | null;
  introMonths?: number | null;
  platformCost?: number | null;
  passwordConfigured?: boolean;
}

const CreateCompanyService = async (
  companyData: CompanyData,
  options: { transaction?: Transaction } = {}
): Promise<Company> => {
  const { transaction } = options;
  const {
    name,
    phone,
    email,
    status,
    planId,
    password,
    campaignsEnabled,
    dueDate,
    recurrence,
    language
  } = companyData;

  const slug = normalizeSlug(companyData.slug);
  const defaultDueDate = new Date();
  defaultDueDate.setUTCDate(defaultDueDate.getUTCDate() + 3);

  // Tenants created from the administrative screen used to be persisted with
  // no due date. That makes the compliance check fail immediately and leaves
  // a newly-created tenant unable to use tickets or messages. Keep the same
  // three-day initial period already used by public signup when no date was
  // supplied explicitly.
  const effectiveDueDate = dueDate || defaultDueDate.toISOString().slice(0, 10);
  const trialDays = assertTrialDays(companyData.trialDays ?? 0);
  const dueDay = assertDueDay(
    companyData.dueDay ?? moment.utc(effectiveDueDate).date()
  );
  const anchor = moment.utc().format("YYYY-MM-DD");
  const trialEndsAt = resolveTrialEndsAt(anchor, trialDays);
  const billableDueDate =
    trialDays > 0
      ? firstBillableDueDate(trialEndsAt, dueDay)
      : effectiveDueDate;

  const companySchema = Yup.object().shape({
    name: Yup.string()
      .min(2, "ERR_COMPANY_INVALID_NAME")
      .required("ERR_COMPANY_INVALID_NAME")
      .test(
        "Check-unique-name",
        "ERR_COMPANY_NAME_ALREADY_EXISTS",
        async value => {
          if (value) {
            const companyWithSameName = await Company.findOne({
              where: { name: value },
              transaction
            });

            return !companyWithSameName;
          }
          return false;
        }
      ),
    slug: Yup.string().test(
      "Check-unique-slug",
      "ERR_COMPANY_SLUG_ALREADY_EXISTS",
      async value => {
        if (value) {
          const companyWithSameSlug = await Company.findOne({
            where: { slug: value },
            transaction
          });

          return !companyWithSameSlug;
        }
        return true;
      }
    )
  });

  try {
    await companySchema.validate({ name, slug });
  } catch (err) {
    throw new AppError(
      err instanceof Error ? err.message : "ERR_COMPANY_INVALID"
    );
  }

  const company = await Company.create(
    {
      name,
      phone,
      email,
      status: status !== false,
      planId,
      dueDate: billableDueDate,
      trialDays,
      trialEndsAt,
      dueDay,
      recurrence: recurrence || "MENSAL",
      language,
      slug: slug || null,
      // Do not rely solely on database defaults for access-critical fields.
      // This also prevents schema drift from creating an already-suspended
      // tenant. Platform-created tenants can still change these values in the
      // same transaction immediately after creation.
      platformStatus: "ativo",
      platformBilling: "sistema",
      partnerId: companyData.partnerId || null,
      saleValue: companyData.saleValue ?? null,
      introValue: companyData.introValue ?? null,
      introMonths: companyData.introMonths ?? null,
      platformCost: companyData.platformCost ?? null
    },
    { transaction }
  );
  const [user, created] = await User.findOrCreate({
    where: { email, companyId: company.id },
    defaults: {
      name,
      email,
      password: password || "123456",
      passwordConfigured: companyData.passwordConfigured !== false,
      profile: "admin",
      companyId: company.id
    },
    transaction
  });

  if (!created) {
    await user.update({ companyId: company.id }, { transaction });
  }

  // Replica o(s) super admin(s) da empresa master para a nova empresa, para
  // que o dono da plataforma consiga logar no subdominio de qualquer tenant.
  await replicateMasterSuperAdmins(company.id, transaction);

  await Setting.findOrCreate({
    where: {
      companyId: company.id,
      key: "asaas"
    },
    defaults: {
      companyId: company.id,
      key: "asaas",
      value: ""
    },
    transaction
  });

  // CheckMsgIsGroup
  await Setting.findOrCreate({
    where: {
      companyId: company.id,
      key: "CheckMsgIsGroup"
    },
    defaults: {
      companyId: company.id,
      key: "enabled",
      value: ""
    },
    transaction
  });

  // CheckMsgIsGroup
  await Setting.findOrCreate({
    where: {
      companyId: company.id,
      key: ""
    },
    defaults: {
      companyId: company.id,
      key: "call",
      value: "disabled"
    },
    transaction
  });

  // scheduleType
  await Setting.findOrCreate({
    where: {
      companyId: company.id,
      key: "scheduleType"
    },
    defaults: {
      companyId: company.id,
      key: "scheduleType",
      value: "disabled"
    },
    transaction
  });

  // userRating
  await Setting.findOrCreate({
    where: {
      companyId: company.id,
      key: "userRating"
    },
    defaults: {
      companyId: company.id,
      key: "userRating",
      value: "disabled"
    },
    transaction
  });

  if (companyData.campaignsEnabled !== undefined) {
    const [setting, settingCreated] = await Setting.findOrCreate({
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
    if (!settingCreated) {
      await setting.update({ value: `${campaignsEnabled}` }, { transaction });
    }
  }

  await Setting.findOrCreate({
    where: {
      companyId: company.id,
      key: "voiceCallsEnabled"
    },
    defaults: {
      companyId: company.id,
      key: "voiceCallsEnabled",
      value: "false"
    },
    transaction
  });

  return company;
};

export default CreateCompanyService;
