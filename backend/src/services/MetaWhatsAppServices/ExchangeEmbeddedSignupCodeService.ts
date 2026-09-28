import { getMetaGraphApiClient } from "./MetaGraphApiClient";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

interface Response {
  accessToken: string;
  expiresInSeconds: number | null;
}

// Troca o "code" de curta duracao devolvido pelo Embedded Signup (FB.login)
// por um access token, e imediatamente troca esse token por um de longa
// duracao. Nunca aceitamos token colado manualmente pelo cliente - o fluxo
// e sempre login dele via Facebook.
const ExchangeEmbeddedSignupCodeService = async (
  code: string
): Promise<Response> => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new AppError("ERR_META_APP_NOT_CONFIGURED", 500);
  }

  const client = getMetaGraphApiClient();

  try {
    const shortLived = await client.get("/oauth/access_token", {
      params: {
        client_id: appId,
        client_secret: appSecret,
        code
      }
    });

    const longLived = await client.get("/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLived.data.access_token
      }
    });

    return {
      accessToken: longLived.data.access_token,
      expiresInSeconds: longLived.data.expires_in ?? null
    };
  } catch (err) {
    logger.error({ err }, "Failed to exchange Meta Embedded Signup code");
    throw new AppError("ERR_META_CODE_EXCHANGE_FAILED", 502);
  }
};

export default ExchangeEmbeddedSignupCodeService;
