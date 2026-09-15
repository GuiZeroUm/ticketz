import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import { logger } from "../../utils/logger";
import HandleMetaInboundMessageService from "./HandleMetaInboundMessageService";

const STATUS_TO_ACK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: -1
};

// Entrada unica pro POST do webhook, ja com a assinatura validada pelo
// controller. Roda fora do ciclo request/response (fire-and-forget a partir
// do controller) pra nao segurar a resposta 200 que a Meta exige rapido.
const ProcessMetaWebhookEventService = async (payload: any): Promise<void> => {
  const entries = payload?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (!phoneNumberId) continue;

      const whatsapp = await Whatsapp.findOne({
        where: { metaPhoneNumberId: phoneNumberId, apiMode: "official" }
      });

      if (!whatsapp) {
        logger.warn(
          { phoneNumberId },
          "Meta webhook event for unknown phoneNumberId, ignoring"
        );
        continue;
      }

      const contacts = value?.contacts || [];

      for (const message of value?.messages || []) {
        const metaContact = contacts.find((c: any) => c.wa_id === message.from);
        try {
          // eslint-disable-next-line no-await-in-loop
          await HandleMetaInboundMessageService(whatsapp, metaContact, message);
        } catch (err) {
          logger.error(
            { err, whatsappId: whatsapp.id, messageId: message.id },
            "Failed to process Meta inbound message"
          );
        }
      }

      for (const status of value?.statuses || []) {
        const ack = STATUS_TO_ACK[status.status];
        if (ack === undefined) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await Message.update(
            { ack },
            { where: { id: status.id } }
          );
        } catch (err) {
          logger.error(
            { err, wamid: status.id },
            "Failed to update Meta message delivery status"
          );
        }
      }
    }
  }
};

export default ProcessMetaWebhookEventService;
