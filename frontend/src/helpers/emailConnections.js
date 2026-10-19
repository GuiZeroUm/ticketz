import React from "react";
import { toast } from "react-toastify";

import api from "../services/api";
import toastError from "../errors/toastError";
import { i18n } from "../translate/i18n";

// Stroke icon paths taken from the "Conexões – Multicanal" design board.
export const CHANNEL_ICON_PATHS = {
  wa: "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2-5.3A8.5 8.5 0 1 1 21 11.5z",
  api: "M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z M9 12l2 2 4-4",
  mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M3 7l9 6 9-6",
  cloud: "M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z",
  at: "M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0z M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  all: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  key: "M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7z M16 8h.01",
  unplug:
    "M18 6 6 18 M7 7l-2 2a4 4 0 0 0 0 5.7l.3.3 M17 17l2-2a4 4 0 0 0 0-5.7l-.3-.3",
  retry: "M21 12a9 9 0 1 1-2.6-6.4L21 8 M21 3v5h-5",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 8h.01 M11 12h1v4h1",
  on: "M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16",
  off: "M2 20h.01M7 20v-4 M14 9l6 6M20 9l-6 6",
  warn: "M12 3 2 20h20z M12 10v4 M12 17h.01",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7v5l3 2",
  error: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M15 9l-6 6 M9 9l6 6"
};

// Provider colors from the design board. `labelKey` is under
// emailChannel.connections.providers.
export const CONNECTION_PROVIDERS = {
  wa: { labelKey: "whatsapp", color: "#1A7F37", tint: "#E9F6EC", icon: "wa" },
  waapi: {
    labelKey: "whatsappApi",
    color: "#1A7F37",
    tint: "#E9F6EC",
    icon: "api"
  },
  gmail: { labelKey: "gmail", color: "#C5221F", tint: "#FCEBEA", icon: "mail" },
  outlook: {
    labelKey: "outlook",
    color: "#0F6CBD",
    tint: "#E8F1FB",
    icon: "mail"
  },
  icloud: {
    labelKey: "icloud",
    color: "#2563C9",
    tint: "#EAF0FB",
    icon: "cloud"
  },
  custom: { labelKey: "custom", color: "#52525B", tint: "#F1F1F3", icon: "at" }
};

export const ChannelIcon = ({
  name,
  size = 18,
  strokeWidth = 1.9,
  style,
  className
}) => (
  <svg
    aria-hidden="true"
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: "none", ...style }}
  >
    <path d={CHANNEL_ICON_PATHS[name]} />
  </svg>
);

export const emailProviderKey = account => {
  if (account?.provider === "gmail_api" || account?.preset === "gmail")
    return "gmail";
  if (account?.preset === "icloud") return "icloud";
  return "custom";
};

export const emailErrorCode = err =>
  typeof err === "string"
    ? err
    : err?.response?.data?.error || err?.message || null;

export const translateEmailError = code => {
  const key = `emailChannel.connections.errors.${code}`;
  if (code && i18n.exists(key)) return i18n.t(key);
  return null;
};

// Error codes stay as keys on the API; this translates the email ones and
// falls back to the app-wide toastError for everything else.
export const toastEmailError = err => {
  const code = emailErrorCode(err);
  const message = translateEmailError(code);
  if (message) {
    toast.error(message, { toastId: code });
    return;
  }
  if (typeof err === "string") {
    toast.error(i18n.t("emailChannel.connections.errors.generic"));
    return;
  }
  toastError(err);
};

export const startGmailOAuth = async ({ name, queueId }) => {
  const body = { name };
  if (queueId) body.queueId = queueId;
  const { data } = await api.post("/email/oauth/google/start", body);
  if (!data?.url) throw new Error("ERR_GMAIL_STATE");
  window.location.assign(data.url);
};
