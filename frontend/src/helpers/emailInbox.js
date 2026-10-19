import { i18n } from "../translate/i18n";
import toastError from "../errors/toastError";

// Mirrors MAX_OUTBOUND_ATTACHMENTS_BYTES on the backend (EmailServices/limits.ts).
export const MAX_OUTBOUND_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

// Account states that cannot send: the composer shows the reconnect warning.
export const EMAIL_ACCOUNT_BLOCKED_STATUSES = ["reauth_required", "disabled"];

export const isEmailTicket = ticket => ticket?.channel === "email";

export const ti = (key, options) =>
  i18n.t(`emailChannel.inbox.${key}`, options);

export const tiCount = (key, count) =>
  ti(`${key}.${count === 1 ? "one" : "other"}`, { count });

const asAddress = value => {
  if (!value) return null;
  if (typeof value === "string") return { address: value };
  if (typeof value === "object" && value.address) return value;
  return null;
};

// Thread entries carry addresses as { address, name? } objects; be lenient and
// also accept plain strings or arrays.
export const addressList = value =>
  (Array.isArray(value) ? value : [value]).map(asAddress).filter(Boolean);

export const firstAddress = value => addressList(value)[0] || null;

export const addressLabel = value => {
  const item = asAddress(value);
  if (!item) return "";
  return item.name || item.address;
};

export const joinAddresses = list =>
  addressList(list)
    .map(item => item.address)
    .join(", ");

const sameAddress = (a, b) =>
  String(a || "")
    .trim()
    .toLowerCase() ===
  String(b || "")
    .trim()
    .toLowerCase();

const locale = () => {
  const language = String(i18n.language || "pt").replace("_", "-");
  return language === "pt" ? "pt-BR" : language;
};

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// "Hoje, 17:40" / "Ontem, 09:20" / "15 out., 10:12", as in the design board.
export const formatEmailDate = value => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  let time;
  let day;
  try {
    time = date.toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit"
    });
    day = date.toLocaleDateString(locale(), {
      day: "numeric",
      month: "short",
      ...(date.getFullYear() !== new Date().getFullYear()
        ? { year: "numeric" }
        : {})
    });
  } catch (_) {
    time = date.toTimeString().slice(0, 5);
    day = date.toDateString();
  }
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, today)) return `${ti("thread.today")}, ${time}`;
  if (isSameDay(date, yesterday)) return `${ti("thread.yesterday")}, ${time}`;
  return `${day}, ${time}`;
};

export const formatFileSize = bytes => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toLocaleString(locale(), {
    maximumFractionDigits: digits
  })} ${units[unit]}`;
};

const PREFIX_PATTERN = /^\s*(re|res|fw|fwd|enc)\s*:\s*/i;

// Same rule as replySubject on the backend: add the prefix once, never stack.
export const replySubject = (subject, mode) => {
  const base = String(subject || "").trim();
  const prefix = ti(
    mode === "forward" ? "composer.forwardPrefix" : "composer.replyPrefix"
  );
  const wanted = mode === "forward" ? /^(fw|fwd|enc)$/i : /^(re|res)$/i;
  const match = base.match(PREFIX_PATTERN);
  if (match && wanted.test(match[1])) return base;
  return base ? `${prefix} ${base}` : prefix;
};

const lastInbound = messages => {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.direction === "in") return list[i];
  }
  return list[list.length - 1] || null;
};

// Recipients shown in the composer for each mode, following the backend
// defaults: reply → Reply-To/From of the last inbound email; reply all → that
// plus its To/Cc without the account address and duplicates; forward → empty.
export const defaultRecipients = (thread, mode) => {
  if (mode === "forward") return { to: "", cc: "" };
  const own = thread?.account?.address;
  const last = lastInbound(thread?.messages);
  if (!last) return { to: "", cc: "" };
  const replyTo = firstAddress(last.replyTo) || firstAddress(last.from);
  const to = replyTo && !sameAddress(replyTo.address, own) ? [replyTo] : [];
  if (mode !== "replyAll") return { to: joinAddresses(to), cc: "" };
  const seen = new Set(to.map(item => item.address.toLowerCase()));
  if (own) seen.add(own.toLowerCase());
  const cc = [...addressList(last.to), ...addressList(last.cc)].filter(item => {
    const key = item.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { to: joinAddresses(to), cc: joinAddresses(cc) };
};

// Error codes stay as keys on the API. Known ones live in backendErrors; SMTP
// and Gmail rejections carry the server status in the code itself.
export const translateEmailSendError = code => {
  if (!code) return ti("status.failed");
  if (i18n.exists(`backendErrors.${code}`))
    return i18n.t(`backendErrors.${code}`);
  const smtp = /^ERR_EMAIL_REJECTED_(\w+)$/.exec(code);
  if (smtp) return ti("errors.rejected", { code: smtp[1] });
  const gmail = /^ERR_GMAIL_SEND_(\w+)$/.exec(code);
  if (gmail) return ti("errors.gmailRejected", { code: gmail[1] });
  return ti("errors.unknownCode", { code });
};

// Blob responses (attachment downloads) hide the JSON error body.
export const toastEmailRequestError = async err => {
  const data = err?.response?.data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.error) {
        toastError(parsed.error);
        return;
      }
    } catch (_) {
      // not JSON
    }
  }
  toastError(err);
};
