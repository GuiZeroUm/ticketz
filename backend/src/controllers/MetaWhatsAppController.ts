import { Request, Response } from "express";
import AppError from "../errors/AppError";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import ConnectMetaWhatsAppService from "../services/MetaWhatsAppServices/ConnectMetaWhatsAppService";
import ConnectMetaWhatsAppManualService from "../services/MetaWhatsAppServices/ConnectMetaWhatsAppManualService";

// Retorna so IDs publicos (App ID / Embedded Signup Config ID), nunca o App
// Secret - usados pelo frontend pra montar o botao FB.login do Embedded
// Signup.
export const getConfig = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  return res.status(200).json({
    appId: process.env.META_APP_ID || null,
    configId: process.env.META_CONFIG_ID || null
  });
};

export const connect = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const { code, wabaId, phoneNumberId, businessId } = req.body;

  if (!code || !wabaId || !phoneNumberId) {
    throw new AppError("ERR_META_CONNECT_MISSING_FIELDS");
  }

  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  const updated = await ConnectMetaWhatsAppService({
    whatsappId: Number(whatsappId),
    companyId,
    code,
    wabaId,
    phoneNumberId,
    businessId
  });

  return res.status(200).json(updated);
};

// Bypass temporario do Embedded Signup (ver ConnectMetaWhatsAppManualService) -
// atras de isSuper na rota, nao isAdmin, porque aceita um accessToken bruto.
export const manualConnect = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const { wabaId, phoneNumberId, accessToken, businessId, pin } = req.body;

  if (!wabaId || !phoneNumberId || !accessToken) {
    throw new AppError("ERR_META_CONNECT_MISSING_FIELDS");
  }

  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  const updated = await ConnectMetaWhatsAppManualService({
    whatsappId: Number(whatsappId),
    companyId,
    wabaId,
    phoneNumberId,
    accessToken,
    businessId,
    pin
  });

  return res.status(200).json(updated);
};
