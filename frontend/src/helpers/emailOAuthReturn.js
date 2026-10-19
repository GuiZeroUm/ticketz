// The Google OAuth callback redirects with a full page load to
// /connections#email=pending&handle=... (ruling R32; errors as
// #email=error&code=ERR_...). Older backends put the same parameters in the
// query string (?email=...), which is still read. On that load the auth state
// is not restored yet, so the private route redirects through /login to "/"
// and the URL would be lost.
// - captureEmailOAuthReturn() runs before the app renders (src/index.js),
//   takes the parameters off the URL (fragment and query) with replaceState,
//   so a refresh never replays them, and keeps the result;
// - the logged-in layout peeks at it and sends the user back to /connections
//   once (markEmailOAuthReturnRedirected);
// - the Connections page consumes it: a pending result is finished with
//   POST /email/oauth/google/finish, then the toast is shown.
//
// The handle is a single-use secret (5 min, bound to the user who started the
// flow). The fragment is never sent to any server nor in a Referer header. The
// legacy query form is visible to requests made before this module runs (the
// HTML document, its stylesheets and inline fetches); public/index.html and
// nginx set Referrer-Policy strict-origin-when-cross-origin so cross-origin
// requests only see the origin. Once captured, the handle lives only in this
// module's memory (the redirects above are client-side, so it survives them),
// is handed out once by consumeEmailOAuthReturn() and is never logged nor
// written to any storage. sessionStorage only keeps the non-secret part
// (result, error code, timestamp), so the layout redirect still happens; when
// sessionStorage is unavailable that marker is kept in memory instead.
// `email=connected` is no longer sent by the backend; it is still accepted.

const STORAGE_KEY = "emailOAuthReturn";
const MAX_AGE_MS = 10 * 60 * 1000;
const RESULTS = ["pending", "connected", "error"];
const PARAMS = ["email", "handle", "code"];
// The backend handle is 32 random bytes in base64url (43 characters).
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

let pendingHandle = null;
// Non-secret marker, used when sessionStorage throws.
let memoryMarker = null;

const isValid = value =>
  RESULTS.includes(value?.result) &&
  typeof value.at === "number" &&
  Date.now() - value.at < MAX_AGE_MS;

const storedMarker = () => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const clear = () => {
  memoryMarker = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // storage unavailable: the memory copy is gone already
  }
};

const read = () => {
  const current = storedMarker() || memoryMarker;
  if (!current) return null;
  if (!isValid(current)) {
    clear();
    return null;
  }
  return current;
};

const write = value => {
  memoryMarker = value;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (_) {
    // storage unavailable: the memory copy above is used for this page load
  }
};

const withoutParams = params => {
  PARAMS.forEach(name => params.delete(name));
  return params.toString();
};

export const captureEmailOAuthReturn = () => {
  try {
    if (!/^\/connections\/?$/.test(window.location.pathname)) return;
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    const queryParams = new URLSearchParams(window.location.search);
    const fromHash = hashParams.has("email");
    const params = fromHash ? hashParams : queryParams;
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
    // Strip both forms; an unrelated fragment is left as it was.
    const search = withoutParams(queryParams);
    let hash = window.location.hash;
    if (fromHash) {
      const rest = withoutParams(hashParams);
      hash = rest ? `#${rest}` : "";
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${hash}`
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
  clear();
  return {
    result: current.result,
    code: current.code,
    handle: current.result === "pending" ? handle : null
  };
};
