// The Google OAuth callback redirects to /connections?email=pending&handle=...
// (or /connections?email=error&code=ERR_...) with a full page load. On that
// load the auth state is not restored yet, so the private route redirects
// through /login to "/" and the query is lost.
// - captureEmailOAuthReturn() runs before the app renders (src/index.js),
//   strips the query from the URL at once (a refresh never replays it) and
//   keeps the result;
// - the logged-in layout peeks at it and sends the user back to /connections
//   once (markEmailOAuthReturnRedirected);
// - the Connections page consumes it: a pending result is finished with
//   POST /email/oauth/google/finish, then the toast is shown.
//
// The handle is a single-use secret: it lives only in this module's memory
// (the redirects above are client-side, so it survives them), is handed out
// once by consumeEmailOAuthReturn() and is never logged nor written to any
// storage. sessionStorage only keeps the non-secret part (result, error code,
// timestamp), so the layout redirect still happens.
// `email=connected` is no longer sent by the backend; it is still accepted.

const STORAGE_KEY = "emailOAuthReturn";
const MAX_AGE_MS = 10 * 60 * 1000;
const RESULTS = ["pending", "connected", "error"];
// The backend handle is 32 random bytes in base64url (43 characters).
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

let pendingHandle = null;

const read = () => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const valid =
      RESULTS.includes(parsed?.result) &&
      typeof parsed.at === "number" &&
      Date.now() - parsed.at < MAX_AGE_MS;
    if (!valid) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
};

const write = value => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (_) {
    // storage unavailable: the toast is simply not shown
  }
};

export const captureEmailOAuthReturn = () => {
  try {
    if (!/^\/connections\/?$/.test(window.location.pathname)) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("email");
    if (!result) return;
    if (RESULTS.includes(result)) {
      const handle = params.get("handle");
      pendingHandle =
        result === "pending" && handle && HANDLE_PATTERN.test(handle)
          ? handle
          : null;
      write({
        result,
        code: result === "error" ? params.get("code") || null : null,
        at: Date.now(),
        redirected: false
      });
    }
    params.delete("email");
    params.delete("code");
    params.delete("handle");
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${
        window.location.hash
      }`
    );
  } catch (_) {
    // history unavailable: nothing to strip
  }
};

// Pending result without consuming it; null when there is none.
export const peekEmailOAuthReturn = () => read();

// The layout redirects to /connections at most once per result, so a user
// who cannot open Connections is not sent there on every load.
export const markEmailOAuthReturnRedirected = () => {
  const current = read();
  if (current) write({ ...current, redirected: true });
};

// Hands the result out once: { result, code, handle }. A "pending" result
// whose handle is gone (e.g. the page was reloaded before it was finished)
// comes back with handle null.
export const consumeEmailOAuthReturn = () => {
  const current = read();
  const handle = pendingHandle;
  pendingHandle = null;
  if (!current) return null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // ignore
  }
  return {
    result: current.result,
    code: current.code,
    handle: current.result === "pending" ? handle : null
  };
};
