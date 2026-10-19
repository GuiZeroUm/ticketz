// The Google OAuth callback redirects to /connections?email=connected or
// /connections?email=error&code=ERR_... with a full page load. On that load
// the auth state is not restored yet, so the private route redirects through
// /login to "/" and the query is lost.
// - captureEmailOAuthReturn() runs before the app renders (src/index.js),
//   keeps the result in sessionStorage and strips it from the URL;
// - the logged-in layout peeks at it and sends the user back to /connections
//   once (markEmailOAuthReturnRedirected);
// - the Connections page consumes it and shows the toast.

const STORAGE_KEY = "emailOAuthReturn";
const MAX_AGE_MS = 10 * 60 * 1000;

const read = () => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const valid =
      (parsed?.result === "connected" || parsed?.result === "error") &&
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
    write({
      result,
      code: params.get("code") || null,
      at: Date.now(),
      redirected: false
    });
    params.delete("email");
    params.delete("code");
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

export const consumeEmailOAuthReturn = () => {
  const current = read();
  if (!current) return null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // ignore
  }
  return { result: current.result, code: current.code };
};
