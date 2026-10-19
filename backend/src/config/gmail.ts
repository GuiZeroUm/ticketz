// Dedicated Google OAuth client for connecting Gmail mailboxes. It is separate
// from the social login (Clerk): "Entrar com Google" never asks for mail scopes
// and this client never signs anyone in. See docs/email-channel.md.

// Exactly these two scopes (global constraint): no gmail.modify and no
// https://mail.google.com/. gmail.readonly is restricted, gmail.send sensitive.
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send"
] as const;

export type GmailConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  frontendUrl: string;
  pubsubTopic?: string;
  pubsubAudience?: string;
  pubsubServiceAccount?: string;
};

const env = (key: string): string => (process.env[key] || "").trim();
const optional = (key: string): string | undefined => env(key) || undefined;

// Read on every call so a deployment can be configured without code changes
// (and tests can switch it). `enabled` needs the three OAuth variables.
export const getGmailConfig = (): GmailConfig => {
  const clientId = env("GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = env("GMAIL_OAUTH_CLIENT_SECRET");
  const redirectUri = env("GMAIL_OAUTH_REDIRECT_URI");

  return {
    enabled: Boolean(clientId && clientSecret && redirectUri),
    clientId,
    clientSecret,
    redirectUri,
    frontendUrl: env("FRONTEND_URL").replace(/\/+$/, ""),
    pubsubTopic: optional("GMAIL_PUBSUB_TOPIC"),
    pubsubAudience: optional("GMAIL_PUBSUB_AUDIENCE"),
    pubsubServiceAccount: optional("GMAIL_PUBSUB_SERVICE_ACCOUNT")
  };
};
