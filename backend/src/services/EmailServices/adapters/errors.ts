// None of these errors carries server text, credentials or message content:
// callers store `message`/`code` on the account (lastError) and log them.

// Credential refused by the provider: the account needs re-authentication.
export class EmailAuthError extends Error {
  constructor(message = "ERR_EMAIL_AUTH_FAILED") {
    super(message);
    this.name = "EmailAuthError";
  }
}

// Failure before anything was sent (or while reading mail); safe to retry.
export class EmailTransientError extends Error {
  // Short, secret-free technical reason (e.g. "ECONNREFUSED"), for diagnostics.
  public reason?: string;

  constructor(message = "ERR_EMAIL_TRANSIENT", reason?: string) {
    super(message);
    this.name = "EmailTransientError";
    this.reason = reason;
  }
}

// Definitive refusal: the message was not and will not be accepted.
// `code` is one of a fixed set (ERR_EMAIL_REJECTED, ERR_EMAIL_INVALID_MESSAGE,
// and for the Gmail API ERR_GMAIL_SEND_400 / ERR_GMAIL_SEND_403); `reason`
// carries the numeric SMTP/HTTP code or a short local tag, never server text.
export class EmailSendRejectedError extends Error {
  constructor(
    public code: string,
    public reason?: string
  ) {
    super(code);
    this.name = "EmailSendRejectedError";
  }
}

// The message may have left already (failure after DATA): never send again.
export class EmailSendAmbiguousError extends Error {
  constructor(message = "ERR_EMAIL_SEND_AMBIGUOUS") {
    super(message);
    this.name = "EmailSendAmbiguousError";
  }
}
