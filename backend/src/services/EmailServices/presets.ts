export type EmailPresetEndpoint = {
  host: string;
  port: number;
  secure: boolean;
};

export type EmailPreset = {
  imap: EmailPresetEndpoint;
  smtp: EmailPresetEndpoint;
};

// Gmail uses OAuth (gmail_api) and "custom" is user supplied, so only
// providers that need fixed IMAP/SMTP settings are listed here.
export const EMAIL_PRESETS: { icloud: EmailPreset } = {
  icloud: {
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false }
  }
};
