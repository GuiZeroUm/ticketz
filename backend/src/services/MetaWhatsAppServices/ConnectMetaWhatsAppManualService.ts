import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import RegisterPhoneNumberService from "./RegisterPhoneNumberService";
import { SubscribeWabaWebhookService } from "./SubscribeWabaWebhookService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";

interface Request {
  whatsappId: number;
  companyId: number;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  businessId?: string;
  pin?: string;
}

// Bypass temporario do Embedded Signup: recebe as credenciais da Cloud API
// ja prontas (App proprio do cliente, fora de um Provedor de Tecnologia) em
// vez de trocar um "code" - usado so enquanto a verificacao de negocio pra
// virar Tech Provider nao sai. Isso quebra deliberadamente a regra "nunca
// token colado manualmente" do Embedded Signup; por isso fica atras de
// isSuper, nao isAdmin.
const ConnectMetaWhatsAppManualService = async ({
  whatsappId,
  companyId,
  wabaId,
  phoneNumberId,
  accessToken,
  businessId,
  pin
}: Request): Promise<Whatsapp> => {
  const whatsapp = await Whatsapp.findOne({
    where: { id: whatsappId, companyId }
  });

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  if (whatsapp.apiMode !== "official") {
    throw new AppError("ERR_WAPP_NOT_OFFICIAL_MODE", 400);
  }

  await RegisterPhoneNumberService(phoneNumberId, accessToken, pin);
  await SubscribeWabaWebhookService(wabaId, accessToken);

  await whatsapp.update({
    metaWabaId: wabaId,
    metaPhoneNumberId: phoneNumberId,
    metaBusinessId: businessId || null,
    metaAccessToken: accessToken,
    metaTokenExpiresAt: null,
    metaWebhookVerifiedAt: new Date(),
    status: "CONNECTED"
  });

  const sanitized = await ShowWhatsAppService(whatsapp.id);

  const io = getIO();
  io.to(`company-${companyId}-admin`).emit(
    `company-${companyId}-whatsappSession`,
    { action: "update", session: sanitized }
  );

  return sanitized;
};

export default ConnectMetaWhatsAppManualService;
