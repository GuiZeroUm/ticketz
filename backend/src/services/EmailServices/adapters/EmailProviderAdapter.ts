import type EmailAccount from "../../../models/EmailAccount";
import type { NormalizedEmail, OutgoingEmail } from "../types";

export type EmailCursor = Record<string, unknown>;

export interface EmailProviderAdapter {
  fetchChanges(account: EmailAccount): Promise<{
    emails: NormalizedEmail[];
    cursor: EmailCursor;
    hasMore: boolean;
  }>;
  send(
    account: EmailAccount,
    mail: OutgoingEmail
  ): Promise<{
    providerMessageId?: string;
    providerThreadId?: string;
    // Recipients the server refused while accepting the message for others
    // (count only, never the addresses).
    rejectedCount?: number;
  }>;
}
