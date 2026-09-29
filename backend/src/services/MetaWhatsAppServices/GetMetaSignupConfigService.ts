import AppError from "../../errors/AppError";

export const getMetaSignupConfig = () => ({
  appId: process.env.META_APP_ID?.trim() || null,
  configId: process.env.META_CONFIG_ID?.trim() || null,
  graphApiVersion: process.env.META_GRAPH_API_VERSION?.trim() || "v21.0",
  billingMode: "direct" as const
});

export const assertMetaSignupConfigured = (): void => {
  const { appId, configId, graphApiVersion } = getMetaSignupConfig();
  if (
    !appId ||
    !/^\d+$/.test(appId) ||
    !configId ||
    !/^\d+$/.test(configId) ||
    !/^v\d+\.\d+$/.test(graphApiVersion) ||
    !process.env.META_APP_SECRET ||
    !process.env.ENCRYPTION_KEY
  ) {
    throw new AppError("ERR_META_APP_NOT_CONFIGURED", 503);
  }
};
