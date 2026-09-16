import { getMetaGraphApiClient, withAuth } from "./MetaGraphApiClient";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

// POST /{wabaId}/subscribed_apps - a partir daqui a Meta comeca a mandar
// eventos desse WABA para o webhook configurado no App.
export const SubscribeWabaWebhookService = async (
  wabaId: string,
  accessToken: string
): Promise<void> => {
  const client = getMetaGraphApiClient();

  try {
    await client.post(`/${wabaId}/subscribed_apps`, {}, withAuth(accessToken));
  } catch (err) {
    logger.error({ err, wabaId }, "Failed to subscribe Meta WABA webhook");
    throw new AppError("ERR_META_WEBHOOK_SUBSCRIBE_FAILED", 502);
  }
};

// DELETE /{wabaId}/subscribed_apps - usado ao desconectar uma conexao
// oficial (equivalente ao "logout" do Baileys pra esse modo).
export const UnsubscribeWabaWebhookService = async (
  wabaId: string,
  accessToken: string
): Promise<void> => {
  const client = getMetaGraphApiClient();

  try {
    await client.delete(`/${wabaId}/subscribed_apps`, withAuth(accessToken));
  } catch (err) {
    logger.warn(
      { err, wabaId },
      "Failed to unsubscribe Meta WABA webhook (continuing disconnect anyway)"
    );
  }
};
