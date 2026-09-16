import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import ExchangeEmbeddedSignupCodeService from "./ExchangeEmbeddedSignupCodeService";
import RegisterPhoneNumberService from "./RegisterPhoneNumberService";
import { SubscribeWabaWebhookService } from "./SubscribeWabaWebhookService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";

interface Request {
  whatsappId: number;
  companyId: number;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
}

// Orquestra o fluxo de Embedded Signup: troca o "code" por token, registra
// o numero na Cloud API e assina o webhook do WABA. So pode ser chamado numa
// conexao que ja pertence a uma empresa em modo "meta" (garantido pelo
// controller, que carrega a connection via ShowWhatsAppService e confere
// company.whatsappMode antes de chegar aqui).
const ConnectMetaWhatsAppService = async ({
  whatsappId,
  companyId,
  code,
  wabaId,
  phoneNumberId,
  businessId
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

  const { accessToken, expiresInSeconds } =
    await ExchangeEmbeddedSignupCodeService(code);

  await RegisterPhoneNumberService(phoneNumberId, accessToken);
  await SubscribeWabaWebhookService(wabaId, accessToken);

  await whatsapp.update({
    metaWabaId: wabaId,
    metaPhoneNumberId: phoneNumberId,
    metaBusinessId: businessId || null,
    metaAccessToken: accessToken,
    metaTokenExpiresAt: expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null,
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

export default ConnectMetaWhatsAppService;
