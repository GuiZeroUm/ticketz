import { ConnectionError, TimeoutError } from "sequelize";
import emailRedis from "./emailRedis";

// Bounded skip policy for an email whose ingestion keeps throwing: the round
// stops (cursor kept) for the first MAX_INGEST_FAILURES - 1 failures, and the
// email is skipped at the MAX_INGEST_FAILURES-th, so one poison message cannot
// block the mailbox forever. Counted per account and providerMessageId in a
// Redis hash that expires on its own.
export const MAX_INGEST_FAILURES = 3;
export const INGEST_FAILURES_TTL_SECONDS = 7 * 24 * 60 * 60;

export const ingestFailuresKey = (accountId: number): string =>
  `email:ingest-failures:${accountId}`;

export type FailureClient = Pick<
  ReturnType<typeof emailRedis>,
  "hincrby" | "expire" | "hdel"
>;

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN"
]);
// Disk full, quota, file-descriptor exhaustion, permissions, I/O: the
// attachment storage failed, not the email.
const SYSTEM_CODES = new Set([
  "ENOSPC",
  "EDQUOT",
  "EMFILE",
  "ENFILE",
  "EACCES",
  "EIO"
]);
// PostgreSQL SQLSTATE: 08 connection exception, 53 insufficient resources,
// 57 operator intervention (statement timeout, shutdown), plus serialization
// failure and deadlock (retryable by definition).
const SQLSTATE_RE = /^[0-9A-Z]{5}$/;
const INFRA_SQLSTATE_CLASSES = new Set(["08", "53", "57"]);
const RETRYABLE_SQLSTATES = new Set(["40001", "40P01"]);

const isInfraSqlState = (code: unknown): boolean =>
  typeof code === "string" &&
  SQLSTATE_RE.test(code) &&
  (INFRA_SQLSTATE_CLASSES.has(code.slice(0, 2)) ||
    RETRYABLE_SQLSTATES.has(code));

const REDIS_ERROR_NAMES = new Set([
  "ReplyError",
  "MaxRetriesPerRequestError",
  "AbortError",
  "ConnectionTimeoutError"
]);

// Errors that say nothing about the email itself (database or Redis down,
// timeouts, disk full, deadlocks): they always stop the round and are never
// counted against it, so the poison policy (R22) cannot skip good mail.
export const isInfrastructureError = (err: unknown): boolean => {
  if (err instanceof ConnectionError || err instanceof TimeoutError)
    return true;
  const { name, code, parent, original } = (err || {}) as {
    name?: string;
    code?: unknown;
    parent?: { code?: unknown };
    original?: { code?: unknown };
  };
  return (
    (typeof name === "string" && REDIS_ERROR_NAMES.has(name)) ||
    (typeof code === "string" &&
      (NETWORK_CODES.has(code) || SYSTEM_CODES.has(code))) ||
    // Sequelize keeps the driver error (with its SQLSTATE) in parent/original
    isInfraSqlState(code) ||
    isInfraSqlState(parent?.code) ||
    isInfraSqlState(original?.code)
  );
};

// Returns the failure count of this email including the current one.
export const recordIngestFailure = async (
  accountId: number,
  providerMessageId: string,
  client: FailureClient = emailRedis()
): Promise<number> => {
  const key = ingestFailuresKey(accountId);
  const count = await client.hincrby(key, providerMessageId, 1);
  await client.expire(key, INGEST_FAILURES_TTL_SECONDS);
  return count;
};

export const clearIngestFailure = async (
  accountId: number,
  providerMessageId: string,
  client: FailureClient = emailRedis()
): Promise<void> => {
  await client.hdel(ingestFailuresKey(accountId), providerMessageId);
};
