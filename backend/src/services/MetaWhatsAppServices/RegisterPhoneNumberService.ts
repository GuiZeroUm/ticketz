import { getMetaGraphApiClient, withAuth } from "./MetaGraphApiClient";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

// Registra o numero para uso na Cloud API (POST /{phoneNumberId}/register).
// Se o numero ja estiver registrado (comum apos o proprio Embedded Signup ja
// ter feito isso), a Graph API responde com um erro que tratamos como sucesso
// idempotente em vez de falhar a conexao.
const RegisterPhoneNumberService = async (
  phoneNumberId: string,
  accessToken: string,
  pin?: string
): Promise<void> => {
  const client = getMetaGraphApiClient();

  try {
    await client.post(
      `/${phoneNumberId}/register`,
      {
        messaging_product: "whatsapp",
        ...(pin ? { pin } : {})
      },
      withAuth(accessToken)
    );
  } catch (err) {
    const alreadyRegistered =
      err?.graphCode === 133010 || err?.graphCode === 133000;
    if (alreadyRegistered) {
      logger.info(
        { phoneNumberId },
        "Meta phone number already registered, continuing"
      );
      return;
    }
    logger.error(
      { err, phoneNumberId },
      "Failed to register Meta phone number"
    );
    throw new AppError("ERR_META_PHONE_REGISTER_FAILED", 502);
  }
};

export default RegisterPhoneNumberService;
