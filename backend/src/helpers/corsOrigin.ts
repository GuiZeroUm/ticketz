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
 * Redirect targets back to the frontend (Gmail OAuth callback): FRONTEND_URL,
 * any FRONTEND_CUSTOM_URL entry, or a FRONTEND_URL_REGEX match. Only an exact,
 * canonical http(s) origin is accepted: no path, query, fragment, userinfo or
 * trailing slash, which keeps a loose regex from being satisfied by
 * "https://evil.com/.example.com" or "https://x.example.com@evil.com".
 * Stricter than CORS on purpose (ruling R26b): CORS keeps its historical
 * partial-match semantics, a redirect needs a full match.
 * Reads the environment on every call.
 */
export const isAllowedRedirectOrigin = (origin: unknown): boolean => {
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

  // Full-match semantics (rulings R26/R26b): the regex must match the WHOLE
  // origin, so an unanchored "^https://.*\.example\.com" does not accept
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
 *   If the incoming origin matches this regex, it is allowed by CORS.
 *   Example: `^https:\/\/.*\.example\.com$`
 *
 * Both variables are used to determine if a request's origin is permitted by the CORS policy,
 * in addition to `FRONTEND_URL`.
 *
 * Unchanged since before the email channel (ruling R26b): existing tenants'
 * regexes keep working exactly as they did. Redirect validation is separate
 * (isAllowedRedirectOrigin).
 *
 * @param {string} origin - The request's origin header.
 * @param {(err: Error, allow?: boolean) => void} callback - Callback to indicate if the origin is allowed.
 */
export const corsOrigin =
  process.env.FRONTEND_CUSTOM_URL || process.env.FRONTEND_URL_REGEX
    ? (origin: string, callback: (arg0: Error, arg1?: boolean) => void) => {
        const allowedOrigins = [process.env.FRONTEND_URL];

        if (process.env.FRONTEND_CUSTOM_URL) {
          const customUrls = process.env.FRONTEND_CUSTOM_URL.split(",");
          customUrls.forEach(url => allowedOrigins.push(url.trim()));
        }

        if (process.env.FRONTEND_URL_REGEX) {
          const regex = new RegExp(process.env.FRONTEND_URL_REGEX);
          if (regex.test(origin)) {
            allowedOrigins.push(origin);
          }
        }

        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} is not allowed by CORS`));
        }
      }
    : process.env.FRONTEND_URL;
