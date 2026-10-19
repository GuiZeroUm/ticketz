import { messages } from ".";

const LANGUAGES = ["pt", "pt_PT", "en", "es", "fr", "de", "it", "id"];

// Codes the email backend can return in an API error, an account lastError
// or a message sendError, added with the Gmail finish step (Task 22).
const CODES = [
  "ERR_EMAIL_MESSAGE_SKIPPED",
  "ERR_EMAIL_ACCOUNT_NOT_FOUND",
  "ERR_EMAIL_ACCOUNT_EXISTS",
  "ERR_EMAIL_INVALID_ACCOUNT",
  "ERR_EMAIL_SEND_FAILED",
  "ERR_INVALID_CHANNEL",
  "ERR_EMAIL_EMPTY_MESSAGE",
  "ERR_EMAIL_INVALID_MODE",
  "ERR_EMAIL_INVALID_TICKET",
  "ERR_EMAIL_INVALID_IDEMPOTENCY_KEY",
  "ERR_EMAIL_IDEMPOTENCY_CONFLICT",
  "ERR_EMAIL_SYNC_ENQUEUE_FAILED",
  "ERR_EMAIL_SYNC_FAILED",
  "ERR_GMAIL_OAUTH_FAILED",
  "ERR_GMAIL_NOT_CONFIGURED",
  "ERR_GMAIL_ACCOUNT_MISMATCH"
];

describe("email channel translations", () => {
  it.each(LANGUAGES)("%s translates the new error codes and notices", lng => {
    const { translations } = messages[lng];
    CODES.forEach(code => {
      expect(typeof translations.backendErrors[code]).toBe("string");
      expect(translations.backendErrors[code]).not.toMatch(/ERR_/);
    });
    const { thread } = translations.emailChannel.inbox;
    expect(thread.replyTo).toContain("{{list}}");
    expect(typeof thread.oversize).toBe("string");
  });
});
