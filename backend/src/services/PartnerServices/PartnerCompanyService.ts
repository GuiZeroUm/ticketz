import moment from "moment";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import Invoices from "../../models/Invoices";
import CreateCompanyService from "../CompanyService/CreateCompanyService";
import UpdateCompanyService from "../CompanyService/UpdateCompanyService";

// Piso global, usado quando o plano nao define um minimo proprio.
export const DEFAULT_MIN_VALUE = 197;

// Trial das empresas criadas por parceiro. Expira sozinho pelo
// checkCompanyCompliant se a primeira fatura nao for paga.
const TRIAL_DAYS = 3;

const parseSaleValue = (value: any): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError("ERR_INVALID_SALE_VALUE", 400);
  }
  return Math.round(parsed * 100) / 100;
};

/**
 * Valida o preco de venda contra o piso do plano.
 *
 * Esta e a trava comercial do canal de revenda: o parceiro define o preco,
 * mas nunca abaixo do minimo que sustenta a plataforma.
 */
const assertAboveFloor = async (
  planId: number,
  saleValue: number
): Promise<Plan> => {
  const plan = await Plan.findByPk(planId);

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  const floor = Number(plan.minValue) || DEFAULT_MIN_VALUE;

  if (saleValue < floor) {
    throw new AppError("ERR_SALE_VALUE_BELOW_MINIMUM", 400);
  }

  return plan;
};

export interface PartnerCompanyListItem {
  company: Company;
  openInvoice: Invoices | null;
}

/**
 * Clientes do parceiro com a fatura em aberto de cada um.
 *
 * `Company` nao tem associacao com `Invoices`, entao as faturas vem numa
 * consulta separada em vez de um include.
 */
export const ListPartnerCompanies = async (
  partnerId: number
): Promise<PartnerCompanyListItem[]> => {
  const companies = await Company.findAll({
    where: { partnerId },
    include: [{ model: Plan, as: "plan", attributes: ["id", "name", "value"] }],
    order: [["id", "DESC"]]
  });

  if (!companies.length) {
    return [];
  }

  const invoices = await Invoices.findAll({
    where: {
      companyId: companies.map(company => company.id),
      status: "open"
    },
    order: [["dueDate", "ASC"]]
  });

  return companies.map(company => ({
    company,
    openInvoice:
      invoices.find(invoice => invoice.companyId === company.id) || null
  }));
};

export const ShowPartnerCompany = async (
  partnerId: number,
  companyId: number | string
): Promise<Company> => {
  const company = await Company.findOne({
    where: { id: companyId, partnerId },
    include: [{ model: Plan, as: "plan" }]
  });

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  return company;
};

interface PartnerCompanyData {
  name: string;
  email: string;
  phone?: string;
  password?: string;
  planId: number;
  saleValue: number;
  recurrence?: string;
}

export const CreatePartnerCompany = async (
  partnerId: number,
  data: PartnerCompanyData
): Promise<Company> => {
  const saleValue = parseSaleValue(data.saleValue);
  await assertAboveFloor(data.planId, saleValue);

  return CreateCompanyService({
    name: data.name,
    email: data.email,
    phone: data.phone,
    password: data.password,
    planId: data.planId,
    status: true,
    recurrence: data.recurrence || "MENSAL",
    dueDate: moment().add(TRIAL_DAYS, "days").format("YYYY-MM-DD"),
    partnerId,
    saleValue
  });
};

export const UpdatePartnerCompany = async (
  partnerId: number,
  companyId: number | string,
  data: Partial<PartnerCompanyData>
): Promise<Company> => {
  const company = await ShowPartnerCompany(partnerId, companyId);

  const planId = data.planId || company.planId;
  let saleValue: number | undefined;

  if (data.saleValue !== undefined) {
    saleValue = parseSaleValue(data.saleValue);
    await assertAboveFloor(planId, saleValue);
  } else if (data.planId && data.planId !== company.planId) {
    // Trocar de plano pode deixar o preco atual abaixo do novo piso.
    await assertAboveFloor(planId, Number(company.saleValue) || 0);
  }

  // O parceiro nao mexe em status, vencimento nem slug: so no comercial.
  return UpdateCompanyService({
    id: company.id,
    name: data.name || company.name,
    email: data.email ?? company.email,
    phone: data.phone ?? company.phone,
    planId,
    ...(saleValue !== undefined ? { saleValue } : {})
  });
};
