import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import { StartWhatsAppSession } from "./StartWhatsAppSession";

export const StartAllWhatsAppsSessions = async (
  companyId: number
): Promise<void> => {
  if (process.env.WHATSAPP_AUTOSTART_ENABLED?.toLowerCase() === "false") {
    logger.info(
      { companyId },
      "Automatic WhatsApp session startup is disabled"
    );
    return;
  }

  try {
    const whatsapps = await Whatsapp.findAll({ where: { companyId } });
    if (whatsapps.length > 0) {
      whatsapps.forEach(whatsapp => {
        if (whatsapp.channel === "whatsapp") {
          StartWhatsAppSession(whatsapp, companyId);
        }
      });
    }
  } catch (e) {
    logger.error(
      { message: e.message, stack: e.stack },
      "Error starting WhatsApp sessions"
    );
  }
};
