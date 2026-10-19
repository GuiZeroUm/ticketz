// Reading Google (gaxios / google-auth-library) failures without ever keeping
// the error object: a GaxiosError carries the request config (refresh token,
// client secret, Authorization header) and Google's response text. Only
// statuses, fixed machine reasons and system codes come out of here.
// Shared by GmailAuthClient (OAuth refresh/exchange) and the Gmail API adapter.

export type HttpFailure = {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  stack?: unknown;
  cause?: unknown;
  error?: unknown;
  response?: { status?: unknown; data?: unknown };
};

const asFailure = (err: unknown): HttpFailure => (err || {}) as HttpFailure;

// Short, secret-free reason for logs/diagnostics.
export const gmailFailureReason = (err: unknown): string => {
  const failure = asFailure(err);
  if (typeof failure.response?.status === "number") {
    return `HTTP_${failure.response.status}`;
  }
  if (
    typeof failure.code === "string" &&
    /^[A-Z][A-Z0-9_]{1,40}$/.test(failure.code)
  ) {
    return failure.code;
  }
  return err instanceof Error ? err.name.slice(0, 40) : "UNKNOWN";
};

// HTTP status only when Google actually answered.
export const gmailStatusOf = (err: unknown): number | undefined => {
  const status = asFailure(err).response?.status;
  return typeof status === "number" ? status : undefined;
};

// OAuth token endpoint error ("invalid_grant", "invalid_client"...).
export const oauthErrorOf = (err: unknown): string | undefined => {
  const data = asFailure(err).response?.data as { error?: unknown } | undefined;
  return data && typeof data.error === "string" ? data.error : undefined;
};

// The refresh token was revoked/expired: only a new consent fixes it.
export const isInvalidGrant = (err: unknown): boolean =>
  oauthErrorOf(err) === "invalid_grant" ||
  asFailure(err).message === "invalid_grant";

// Machine reasons of a Google API error body (error.status, errors[].reason,
// details[].reason). Never the message text.
export const gmailReasonsOf = (err: unknown): string[] => {
  const data = asFailure(err).response?.data as { error?: unknown } | undefined;
  const body = data?.error as
    | {
        status?: unknown;
        errors?: { reason?: unknown }[];
        details?: { reason?: unknown }[];
      }
    | string
    | undefined;
  if (!body || typeof body !== "object") return [];
  const found = [
    body.status,
    ...(Array.isArray(body.errors) ? body.errors.map(e => e?.reason) : []),
    ...(Array.isArray(body.details) ? body.details.map(d => d?.reason) : [])
  ];
  return found.filter((r): r is string => typeof r === "string");
};

// Walks the error and its causes (gaxios wraps the fetch error).
const someInChain = (
  err: unknown,
  test: (failure: HttpFailure) => boolean
): HttpFailure | undefined => {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const failure = current as HttpFailure;
    if (test(failure)) return failure;
    current = failure.cause || failure.error;
  }
  return undefined;
};

const SYSTEM_CODE_RE = /^[A-Z][A-Z0-9_]{1,40}$/;

// System error code of a network failure (ECONNRESET, ENOTFOUND...).
export const networkCodeOf = (err: unknown): string | undefined => {
  const found = someInChain(
    err,
    f => typeof f.code === "string" && SYSTEM_CODE_RE.test(f.code)
  );
  return found ? (found.code as string) : undefined;
};

// A timeout/abort (gaxios timeout signal): the request may have been sent.
export const isAbortFailure = (err: unknown): boolean =>
  Boolean(
    someInChain(err, f =>
      ["AbortError", "TimeoutError"].some(n => f.name === n || f.code === n)
    )
  );
