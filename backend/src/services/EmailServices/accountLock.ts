import { randomBytes } from "crypto";
import Redis from "ioredis";
import { REDIS_URI_CONNECTION } from "../../config/redis";
import { logger } from "../../utils/logger";

// Per-account mutual exclusion across processes. IngestEmailService looks a
// thread up before its transaction, so two concurrent rounds of the same
// account could split a message and its reply into two tickets. The sync
// service therefore only runs a round while holding this lock. The lock has a
// short TTL that a heartbeat keeps extending, so a crashed worker releases the
// account within LOCK_TTL_MS instead of blocking it forever.
export const LOCK_TTL_MS = 2 * 60 * 1000;
export const LOCK_RENEW_MS = 30 * 1000;

// Both scripts only act when the stored token is still ours: a lock that
// expired and was taken by someone else is never released or extended by us.
export const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
export const RENEW_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

export type LockClient = Pick<Redis, "set" | "eval">;

let connection: Redis | undefined;
const defaultClient = (): LockClient =>
  connection || (connection = new Redis(REDIS_URI_CONNECTION));

export const accountLockKey = (accountId: number): string =>
  `email:sync-lock:${accountId}`;

// Runs `fn` while holding the account lock. Returns { acquired: false } without
// running `fn` when another worker holds it.
export const withAccountLock = async <T>(
  accountId: number,
  fn: () => Promise<T>,
  client: LockClient = defaultClient()
): Promise<{ acquired: true; result: T } | { acquired: false }> => {
  const key = accountLockKey(accountId);
  const token = randomBytes(16).toString("hex");

  const taken = await client.set(key, token, "PX", LOCK_TTL_MS, "NX");
  if (taken !== "OK") return { acquired: false };

  const timer = setInterval(() => {
    Promise.resolve(
      client.eval(RENEW_SCRIPT, 1, key, token, LOCK_TTL_MS)
    ).catch(() =>
      logger.warn(
        { emailAccountId: accountId },
        "Could not extend email sync lock"
      )
    );
  }, LOCK_RENEW_MS);
  timer.unref?.();

  try {
    return { acquired: true, result: await fn() };
  } finally {
    clearInterval(timer);
    try {
      await client.eval(RELEASE_SCRIPT, 1, key, token);
    } catch {
      logger.warn(
        { emailAccountId: accountId },
        "Could not release email sync lock; it expires on its own"
      );
    }
  }
};
