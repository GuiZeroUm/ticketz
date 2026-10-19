// The Google OAuth callback redirects to /connections?email=connected or
// /connections?email=error&code=ERR_... with a full page load. On that load
// the auth state is not restored yet, so the private route redirects through
// /login and the query is lost. captureEmailOAuthReturn() runs before the app
// renders, keeps the result in sessionStorage and strips it from the URL; the
// Connections page consumes it and shows the toast.

const STORAGE_KEY = "emailOAuthReturn";

export const captureEmailOAuthReturn = () => {
  try {
    if (!/^\/connections\/?$/.test(window.location.pathname)) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("email");
    if (!result) return;
    const code = params.get("code");
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ result, code: code || null })
    );
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
    // storage or history unavailable: the toast is simply not shown
  }
};

export const consumeEmailOAuthReturn = () => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (parsed?.result !== "connected" && parsed?.result !== "error")
      return null;
    return parsed;
  } catch (_) {
    return null;
  }
};
