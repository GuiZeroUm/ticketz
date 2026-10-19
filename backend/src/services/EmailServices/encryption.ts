import AppError from "../../errors/AppError";
import { EmailTransientError } from "./adapters/errors";

// Mailbox credentials are stored with encryptSecret, which needs
// ENCRYPTION_KEY. Without it the email channel answers its own code instead
// of a generic 500 on save, or a misleading "reconnect the mailbox" on sync.
// Only the email services use this; the Meta path is unchanged.
export const ENCRYPTION_NOT_CONFIGURED = "ERR_EMAIL_ENCRYPTION_NOT_CONFIGURED";

export const isEncryptionConfigured = (): boolean =>
  Boolean(process.env.ENCRYPTION_KEY);

// Before saving credentials (API request): 503, the server is misconfigured.
export const assertEncryptionConfigured = (): void => {
  if (!isEncryptionConfigured()) {
    throw new AppError(ENCRYPTION_NOT_CONFIGURED, 503);
  }
};

// When stored credentials cannot be read (sync, IDLE, send): a missing key is
// not an auth problem, so the account is never marked reauth_required for it.
export const assertCredentialsReadable = (): void => {
  if (!isEncryptionConfigured()) {
    throw new EmailTransientError(ENCRYPTION_NOT_CONFIGURED);
  }
};
