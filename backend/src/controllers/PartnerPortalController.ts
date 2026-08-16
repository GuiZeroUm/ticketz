import { Request, Response } from "express";
import Plan from "../models/Plan";
import FindPublicService from "../services/HelpGroupServices/FindPublicService";
import ShowPublicService from "../services/HelpGroupServices/ShowPublicService";
import {
  ListPartnerCompanies,
  CreatePartnerCompany,
  UpdatePartnerCompany,
  ShowPartnerCompany,
  DEFAULT_MIN_VALUE
} from "../services/PartnerServices/PartnerCompanyService";
import ListPartnerPayoutsService from "../services/PartnerServices/ListPartnerPayoutsService";
import UpdatePartnerSettingsService from "../services/PartnerServices/UpdatePartnerSettingsService";
import { getPartnerPixFee } from "../services/PaymentGatewayServices/AbacatePayServices";
import Partner from "../models/Partner";
import SerializePartner from "../helpers/SerializePartner";
import AppError from "../errors/AppError";

export const listCompanies = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companies = await ListPartnerCompanies(req.partner.id);

  return res.json(companies);
};

export const showCompany = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const company = await ShowPartnerCompany(req.partner.id, req.params.id);

  return res.json(company);
};

export const storeCompany = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const company = await CreatePartnerCompany(req.partner.id, req.body);

  return res.status(200).json(company);
};

export const updateCompany = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const company = await UpdatePartnerCompany(
    req.partner.id,
    req.params.id,
    req.body
  );

  return res.json(company);
};

/** Planos com o piso de preco, para a tela de cadastro de cliente. */
export const listPlans = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const plans = await Plan.findAll({ order: [["value", "ASC"]] });

  return res.json(
    plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      value: plan.value,
      minValue: plan.minValue || DEFAULT_MIN_VALUE,
      users: plan.users,
      connections: plan.connections,
      queues: plan.queues
    }))
  );
};

export const listPayouts = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { startDate, endDate, status } = req.query as Record<string, string>;

  const result = await ListPartnerPayoutsService({
    partnerId: req.partner.id,
    startDate,
    endDate,
    status
  });

  return res.json(result);
};

export const showSettings = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const partner = await Partner.findByPk(req.partner.id);

  if (!partner) {
    throw new AppError("ERR_NO_PARTNER_FOUND", 404);
  }

  return res.json({
    ...SerializePartner(partner),
    // A tela mostra a comparacao entre os modos com a tarifa real.
    pixFee: await getPartnerPixFee()
  });
};

export const updateSettings = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const partner = await UpdatePartnerSettingsService(req.partner.id, req.body);

  return res.json(SerializePartner(partner));
};

export const listHelps = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const groups = await FindPublicService("partner");

  return res.json(groups);
};

export const showHelpGroup = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const group = await ShowPublicService({
    groupId: req.params.id,
    audience: "partner"
  });

  return res.json(group);
};
