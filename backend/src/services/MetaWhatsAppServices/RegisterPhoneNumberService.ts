import { getMetaGraphApiClient, withAuth } from "./MetaGraphApiClient";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

// Registra o numero para uso na Cloud API (POST /{phoneNumberId}/register).
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
    logger.error(
      { err, phoneNumberId },
      "Failed to register Meta phone number"
    );
    throw new AppError("ERR_META_PHONE_REGISTER_FAILED", 502);
  }
};

export default RegisterPhoneNumberService;
