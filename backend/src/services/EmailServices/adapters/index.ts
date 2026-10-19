import AppError from "../../../errors/AppError";
import type { EmailProvider } from "../../../models/EmailAccount";
import type { EmailProviderAdapter } from "./EmailProviderAdapter";
import ImapSmtpAdapter from "./ImapSmtpAdapter";

export * from "./errors";
export type { EmailCursor, EmailProviderAdapter } from "./EmailProviderAdapter";
export { testImapSmtp } from "./ImapSmtpAdapter";

const adapters: Partial<Record<EmailProvider, EmailProviderAdapter>> = {
  imap_smtp: new ImapSmtpAdapter()
};

// Lets later providers (Gmail API) plug in without this module importing them.
export const registerAdapter = (
  provider: EmailProvider,
  adapter: EmailProviderAdapter
): void => {
  adapters[provider] = adapter;
};

export const getAdapter = (provider: EmailProvider): EmailProviderAdapter => {
  const adapter = adapters[provider];
  if (!adapter) throw new AppError("ERR_EMAIL_PROVIDER_NOT_SUPPORTED", 400);
  return adapter;
};
