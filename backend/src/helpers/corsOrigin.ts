// Canonical form of a configured URL ("https://app.com/" -> "https://app.com").
const configuredOrigin = (value: string | undefined): string | null => {
  if (!value || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

/**
 * The single source of truth for "is this one of our frontends": FRONTEND_URL,
 * any FRONTEND_CUSTOM_URL entry, or a FRONTEND_URL_REGEX match. Used by CORS
 * and by redirects back to the frontend (Gmail OAuth callback), so it only
 * accepts an exact, canonical http(s) origin: no path, query, fragment,
 * userinfo or trailing slash. That also keeps a loose regex from being
 * satisfied by "https://evil.com/.example.com" or "https://x.example.com@evil.com".
 * Reads the environment on every call.
 */
export const isAllowedFrontendOrigin = (origin: unknown): boolean => {
  if (typeof origin !== "string" || !origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.origin !== origin
  ) {
    return false;
  }

  const allowed = [
    process.env.FRONTEND_URL,
    ...(process.env.FRONTEND_CUSTOM_URL || "").split(",")
  ].map(configuredOrigin);
  if (allowed.includes(origin)) return true;

  // Full-match semantics (ruling R26): the regex must match the WHOLE origin,
  // so an unanchored "^https://.*\.example\.com" does not accept
  // "https://x.example.com.evil.com".
  if (process.env.FRONTEND_URL_REGEX) {
    try {
      const match = origin.match(new RegExp(process.env.FRONTEND_URL_REGEX));
      return Boolean(match) && match.index === 0 && match[0] === origin;
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Determines allowed CORS origins based on environment variables.
 *
 * Environment variables:
 * - `FRONTEND_CUSTOM_URL`: Comma-separated list of additional allowed origins for CORS.
 *   Each URL is trimmed and added to the set of allowed origins.
 *   Example: `https://app.example.com,https://admin.example.com`
 * - `FRONTEND_URL_REGEX`: Regular expression pattern to match allowed origins dynamically.
 *   The WHOLE origin must match it (full match, ruling R26).
 *   Example: `^https:\/\/.*\.example\.com$`
 *
 * Both variables are used to determine if a request's origin is permitted by the CORS policy,
 * in addition to `FRONTEND_URL`.
 *
 * @param {string} origin - The request's origin header.
 * @param {(err: Error, allow?: boolean) => void} callback - Callback to indicate if the origin is allowed.
 */
export const corsOrigin =
  process.env.FRONTEND_CUSTOM_URL || process.env.FRONTEND_URL_REGEX
    ? (origin: string, callback: (arg0: Error, arg1?: boolean) => void) => {
        if (!origin || isAllowedFrontendOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} is not allowed by CORS`));
        }
      }
    : process.env.FRONTEND_URL;
