/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  LOCK_RENEW_MS,
  LOCK_TTL_MS,
  RELEASE_SCRIPT,
  RENEW_SCRIPT,
  accountLockKey,
  withAccountLock
} from "../accountLock";

jest.mock("../../../utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));
jest.mock("ioredis", () => ({ __esModule: true, default: jest.fn() }));

// Minimal Redis double: SET NX PX plus the two token-checked scripts.
const fakeRedis = () => {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (key: string, value: string, ...args: any[]) => {
      if (args.includes("NX") && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
    eval: jest.fn(
      async (script: string, _n: number, key: string, token: string) => {
        if (store.get(key) !== token) return 0;
        if (script === RELEASE_SCRIPT) store.delete(key);
        return 1;
      }
    )
  };
};

describe("withAccountLock", () => {
  afterEach(() => jest.useRealTimers());

  it("runs the function holding a per-account TTL lock and releases it", async () => {
    const redis = fakeRedis();
    const out = await withAccountLock(
      4,
      async () => {
        expect(redis.store.has(accountLockKey(4))).toBe(true);
        return 42;
      },
      redis as any
    );
    expect(out).toEqual({ acquired: true, result: 42 });
    expect(redis.set).toHaveBeenCalledWith(
      accountLockKey(4),
      expect.any(String),
      "PX",
      LOCK_TTL_MS,
      "NX"
    );
    expect(redis.store.size).toBe(0);
  });

  it("does not run when another holder has the lock, and leaves it alone", async () => {
    const redis = fakeRedis();
    redis.store.set(accountLockKey(4), "someone-else");
    const fn = jest.fn();
    await expect(withAccountLock(4, fn, redis as any)).resolves.toEqual({
      acquired: false
    });
    expect(fn).not.toHaveBeenCalled();
    expect(redis.store.get(accountLockKey(4))).toBe("someone-else");
  });

  it("locks different accounts independently", async () => {
    const redis = fakeRedis();
    let inner: any;
    await withAccountLock(
      1,
      async () => {
        inner = await withAccountLock(2, async () => "ok", redis as any);
      },
      redis as any
    );
    expect(inner).toEqual({ acquired: true, result: "ok" });
  });

  it("releases when the function throws", async () => {
    const redis = fakeRedis();
    await expect(
      withAccountLock(
        4,
        async () => {
          throw new Error("x");
        },
        redis as any
      )
    ).rejects.toThrow("x");
    expect(redis.store.size).toBe(0);
  });

  it("does not release a lock that expired and was taken by another worker", async () => {
    const redis = fakeRedis();
    await withAccountLock(
      4,
      async () => {
        redis.store.set(accountLockKey(4), "new-owner");
      },
      redis as any
    );
    expect(redis.store.get(accountLockKey(4))).toBe("new-owner");
  });

  it("extends the lock while the round is running", async () => {
    jest.useFakeTimers();
    const redis = fakeRedis();
    const run = withAccountLock(
      4,
      () =>
        new Promise<void>(resolve =>
          setTimeout(resolve, LOCK_RENEW_MS * 2 + 1)
        ),
      redis as any
    );
    for (let i = 0; i < 3; i += 1) {
      await Promise.resolve();
      jest.advanceTimersByTime(LOCK_RENEW_MS);
    }
    await run;
    const renews = redis.eval.mock.calls.filter(c => c[0] === RENEW_SCRIPT);
    expect(renews.length).toBeGreaterThanOrEqual(2);
    expect(renews[0].slice(2, 5)).toEqual([
      accountLockKey(4),
      expect.any(String),
      LOCK_TTL_MS
    ]);
  });

  it("reports the lock as lost when a heartbeat finds it gone, and stillHeld says no", async () => {
    jest.useFakeTimers();
    const redis = fakeRedis();
    let ctx: any;
    const run = withAccountLock(
      4,
      async lock => {
        ctx = lock;
        expect(lock.isLost()).toBe(false);
        expect(await lock.stillHeld()).toBe(true);
        redis.store.delete(accountLockKey(4)); // expired / taken over
        await new Promise<void>(resolve =>
          setTimeout(resolve, LOCK_RENEW_MS + 1)
        );
        return "done";
      },
      redis as any
    );
    for (let i = 0; i < 3; i += 1) {
      for (let tick = 0; tick < 20; tick += 1) {
        await Promise.resolve();
      }
      jest.advanceTimersByTime(LOCK_RENEW_MS);
    }
    await run;
    expect(ctx.isLost()).toBe(true);
    await expect(ctx.stillHeld()).resolves.toBe(false);
  });

  it("stillHeld re-verifies the token immediately, before any heartbeat", async () => {
    const redis = fakeRedis();
    await withAccountLock(
      4,
      async lock => {
        redis.store.set(accountLockKey(4), "new-owner");
        expect(lock.isLost()).toBe(false);
        expect(await lock.stillHeld()).toBe(false);
        expect(lock.isLost()).toBe(true);
      },
      redis as any
    );
  });

  it("stillHeld is false when Redis cannot be reached", async () => {
    const redis = fakeRedis();
    await withAccountLock(
      4,
      async lock => {
        redis.eval.mockRejectedValueOnce(new Error("down"));
        expect(await lock.stillHeld()).toBe(false);
      },
      redis as any
    );
  });
});
