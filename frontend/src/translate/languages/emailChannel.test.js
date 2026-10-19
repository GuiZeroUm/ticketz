import { messages } from ".";
import { emailChannelMessages } from "./emailChannel";

const LANGUAGES = ["pt", "pt_PT", "en", "es", "fr", "de", "it", "id"];

// Every leaf of an object as [path, value].
const leaves = (value, path = []) =>
  value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) =>
        leaves(child, [...path, key])
      )
    : [[path.join("."), value]];

const get = (object, path) =>
  path.split(".").reduce((current, key) => current?.[key], object);

const placeholders = text => (String(text).match(/{{\w+}}/g) || []).sort();

const reference = leaves(emailChannelMessages.pt);

// Codes the email backend can return in an API error, an account lastError
// or a message sendError.
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
  "ERR_GMAIL_ACCOUNT_MISMATCH",
  "ERR_GMAIL_SEND_400",
  "ERR_GMAIL_SEND_403"
];

describe("email channel translations", () => {
  it("covers every language of the app", () => {
    expect(Object.keys(emailChannelMessages).sort()).toEqual(
      [...LANGUAGES].sort()
    );
  });

  it.each(LANGUAGES)("%s has every email key that pt has", lng => {
    const overlay = emailChannelMessages[lng];
    const missing = [];
    reference.forEach(([path, value]) => {
      const translated = get(overlay, path);
      if (typeof translated !== "string" || !translated.trim()) {
        missing.push(path);
        return;
      }
      expect([path, placeholders(translated)]).toEqual([
        path,
        placeholders(value)
      ]);
    });
    expect(missing).toEqual([]);
    // nothing extra that pt does not have
    const known = new Set(reference.map(([path]) => path));
    expect(leaves(overlay).filter(([path]) => !known.has(path))).toEqual([]);
  });

  it.each(LANGUAGES)("%s translates the email error codes", lng => {
    const { translations } = messages[lng];
    CODES.forEach(code => {
      expect(typeof translations.backendErrors[code]).toBe("string");
      expect(translations.backendErrors[code]).not.toMatch(/ERR_/);
    });
    [
      "ERR_GMAIL_STATE",
      "ERR_GMAIL_NO_REFRESH_TOKEN",
      "ERR_GMAIL_SCOPES_MISSING"
    ].forEach(code => {
      expect(typeof translations.emailChannel.connections.errors[code]).toBe(
        "string"
      );
    });
  });
});
