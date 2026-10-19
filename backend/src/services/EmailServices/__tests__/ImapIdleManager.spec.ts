/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from "events";
// imapflow's own capability parsing/lookup, so the fixtures cannot drift from
// the casing the real client stores (e.g. "IMAP4rev2", not "IMAP4REV2").
import { hasCapability, updateCapabilities } from "imapflow/lib/tools";
import { inspect } from "util";
import EmailAccount from "../../../models/EmailAccount";
import {
  enqueueAccountSync,
  markSyncDirtyIfActive
} from "../../../queues/email";
import { logger } from "../../../utils/logger";
import { RELEASE_SCRIPT } from "../accountLock";
import { EmailAuthError, EmailTransientError } from "../adapters/errors";
import { openImapIdleClient } from "../adapters/ImapSmtpAdapter";
import { emailEnabledForCompany } from "../EmailAccessService";
import emailRedis from "../emailRedis";
import ImapIdleManager, {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  LEASE_RENEW_MS,
  LEASE_TTL_MS,
  STOP_TIMEOUT_MS,
  TOMBSTONE_TTL_MS,
  idleLeaseKey
} from "../ImapIdleManager";

jest.mock("../../../utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));
jest.mock("../../../models/EmailAccount", () => ({
  __esModule: true,
  default: { scope: jest.fn() }
}));
jest.mock("../EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn()
}));
jest.mock("../../../queues/email", () => ({
  enqueueAccountSync: jest.fn(),
  markSyncDirtyIfActive: jest.fn()
}));
jest.mock("../adapters/ImapSmtpAdapter", () => ({
  openImapIdleClient: jest.fn()
}));
jest.mock("../emailRedis", () => ({ __esModule: true, default: jest.fn() }));

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

// Capabilities as imapflow builds them from a CAPABILITY response.
const capsOf = (...names: string[]) =>
  updateCapabilities(names.map(value => ({ value }) as any));

class FakeClient extends EventEmitter {
  usable = true;

  capabilities: Map<string, boolean | number> = capsOf("IMAP4rev1", "IDLE");

  // extensions switched on with ENABLE (e.g. IMAP4REV2)
  enabled = new Set<string>();

  resolvers: Array<(v?: unknown) => void> = [];

  mailboxOpen = jest.fn(async () => ({}));

  idle = jest.fn(
    () =>
      new Promise(resolve => {
        this.resolvers.push(resolve);
      })
  );

  close = jest.fn(() => this.drop());

  logout = jest.fn(async () => this.drop());

  drop() {
    if (!this.usable) return;
    this.usable = false;
    this.resolvers.forEach(r => r());
    this.emit("close");
  }
}

type Row = Record<string, any>;
const row = (id: number, over: Row = {}): Row => ({
  id,
  companyId: 1,
  provider: "imap_smtp",
  status: "active",
  address: `box${id}@empresa.com`,
  imapHost: "imap.empresa.com",
  imapPort: 993,
  imapSecure: true,
  credentials: `cipher-${id}`,
  ...over
});

let rows: Row[];
let redis: ReturnType<typeof fakeRedis>;
let clients: FakeClient[];
const findAll = jest.fn();
const findByPk = jest.fn();
// R23: IDLE code must never write the EmailAccount row.
const accountWrites = jest.fn();

const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
  }
};

// @types/jest predates the async variant (it exists in jest 29.7 itself).
const advance = (ms: number): Promise<void> =>
  (jest as any).advanceTimersByTimeAsync(ms);

const fakeTimers = () =>
  (jest as any).useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });

const connectMock = openImapIdleClient as jest.Mock;
const lastClient = () => clients[clients.length - 1];

const startManager = async () => {
  await ImapIdleManager.start();
  await flush();
};

beforeEach(() => {
  rows = [row(1)];
  redis = fakeRedis();
  clients = [];
  (emailRedis as jest.Mock).mockReturnValue(redis);
  findAll.mockReset();
  // mimics the where clause the manager sends
  findAll.mockImplementation(async () =>
    rows.filter(r => r.status === "active" && r.provider === "imap_smtp")
  );
  findByPk.mockReset();
  accountWrites.mockReset();
  findByPk.mockImplementation(async (id: number) => {
    const found = rows.find(r => r.id === id);
    return found
      ? {
          ...found,
          getCredentials: () => ({ password: "x" }),
          save: accountWrites,
          update: accountWrites,
          set: accountWrites,
          setCredentials: accountWrites
        }
      : null;
  });
  (EmailAccount.scope as jest.Mock).mockReset();
  (EmailAccount.scope as jest.Mock).mockReturnValue({ findAll, findByPk });
  (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
  (enqueueAccountSync as jest.Mock).mockReset();
  (enqueueAccountSync as jest.Mock).mockResolvedValue(undefined);
  (markSyncDirtyIfActive as jest.Mock).mockReset();
  (markSyncDirtyIfActive as jest.Mock).mockResolvedValue(undefined);
  connectMock.mockReset();
  connectMock.mockImplementation(async () => {
    const client = new FakeClient();
    clients.push(client);
    return client;
  });
  jest.spyOn(Math, "random").mockReturnValue(0);
  delete process.env.EMAIL_IMAP_IDLE_MAX;
});

afterEach(async () => {
  await ImapIdleManager.stop();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("ImapIdleManager", () => {
  it("opens one IDLE connection per eligible account and enqueues sync on exists", async () => {
    rows = [row(1), row(2, { companyId: 2 })];
    await startManager();

    expect(connectMock).toHaveBeenCalledTimes(2);
    // secrets are only loaded through the withSecrets scope
    expect(EmailAccount.scope).toHaveBeenCalledWith("withSecrets");
    clients.forEach(client => {
      expect(client.mailboxOpen).toHaveBeenCalledWith("INBOX", {
        readOnly: true
      });
      expect(client.idle).toHaveBeenCalledTimes(1);
    });
    expect(enqueueAccountSync).not.toHaveBeenCalled();

    clients[0].emit("exists", { path: "INBOX", count: 5, prevCount: 4 });
    await flush();
    expect(enqueueAccountSync).toHaveBeenCalledTimes(1);
    expect(enqueueAccountSync).toHaveBeenCalledWith(1);

    clients[1].emit("exists", { path: "INBOX", count: 9, prevCount: 3 });
    await flush();
    expect(enqueueAccountSync).toHaveBeenLastCalledWith(2);
  });

  it("ignores exists events that are not new mail", async () => {
    await startManager();
    lastClient().emit("exists", { path: "INBOX", count: 3, prevCount: 4 });
    await flush();
    expect(enqueueAccountSync).not.toHaveBeenCalled();
  });

  it("does not break when the sync enqueue fails", async () => {
    (enqueueAccountSync as jest.Mock).mockRejectedValue(new Error("redis"));
    await startManager();
    lastClient().emit("exists", { path: "INBOX", count: 2, prevCount: 1 });
    await flush();
    expect(enqueueAccountSync).toHaveBeenCalledTimes(1);
    expect(lastClient().usable).toBe(true);
  });

  it("does not use IDLE when the capability is missing, and does not reconnect", async () => {
    connectMock.mockImplementation(async () => {
      const client = new FakeClient();
      client.capabilities.delete("IDLE");
      clients.push(client);
      return client;
    });
    await startManager();

    expect(clients).toHaveLength(1);
    expect(clients[0].idle).not.toHaveBeenCalled();
    expect(clients[0].usable).toBe(false);
    // later refreshes leave the account to polling
    await ImapIdleManager.refresh();
    await flush();
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(redis.store.has(idleLeaseKey(1))).toBe(false);
  });

  it("only watches imap_smtp accounts that are active and whose company has the channel on", async () => {
    rows = [
      row(1),
      row(2, { status: "reauth_required" }),
      row(3, { status: "disabled" }),
      row(4, { companyId: 4 }),
      row(5, { provider: "gmail_api" })
    ];
    (emailEnabledForCompany as jest.Mock).mockImplementation(
      async (companyId: number) => companyId !== 4
    );
    await startManager();

    expect(connectMock).toHaveBeenCalledTimes(1);
    // the query itself filters (Sequelize operators are symbols, so inspect)
    const where = inspect(findAll.mock.calls[0][0].where, { depth: 6 });
    expect(where).toContain("provider: 'imap_smtp'");
    expect(where).toContain("status: 'active'");
  });

  it("closes connections for disabled companies on refresh and releases the lease", async () => {
    await startManager();
    expect(redis.store.has(idleLeaseKey(1))).toBe(true);

    (emailEnabledForCompany as jest.Mock).mockResolvedValue(false);
    await ImapIdleManager.refresh();
    await flush();

    expect(clients[0].usable).toBe(false);
    expect(redis.store.has(idleLeaseKey(1))).toBe(false);
    // and it does not come back by itself
    await flush();
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it("closes the connection when the account leaves active (reauth_required, disabled)", async () => {
    rows = [row(1), row(2)];
    await startManager();
    rows[0].status = "reauth_required";
    rows[1].status = "disabled";
    await ImapIdleManager.refresh();
    await flush();
    expect(clients.every(c => !c.usable)).toBe(true);
    expect(redis.store.size).toBe(0);
  });

  it("starts IDLE for accounts that become eligible later", async () => {
    rows = [row(1, { status: "connecting" })];
    await startManager();
    expect(connectMock).not.toHaveBeenCalled();
    rows[0].status = "active";
    await ImapIdleManager.refresh();
    await flush();
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it("reconnects the account when its connection settings or credentials change, not on every refresh", async () => {
    await startManager();
    await ImapIdleManager.refresh();
    await flush();
    expect(connectMock).toHaveBeenCalledTimes(1);

    rows[0].credentials = "cipher-1-rotated";
    await ImapIdleManager.refresh();
    await flush();
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(clients[0].usable).toBe(false);
    expect(clients[1].usable).toBe(true);

    rows[0].imapHost = "imap.other.com";
    await ImapIdleManager.refresh();
    await flush();
    expect(connectMock).toHaveBeenCalledTimes(3);
  });

  it("ignores updatedAt churn: a sync round rewriting the row does not restart IDLE", async () => {
    await startManager();
    rows[0].updatedAt = new Date();
    rows[0].lastSyncAt = new Date();
    await ImapIdleManager.refresh();
    await flush();
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(clients[0].usable).toBe(true);
  });

  it("never writes the EmailAccount row (R23)", async () => {
    await startManager();
    lastClient().emit("exists", { path: "INBOX", count: 2, prevCount: 1 });
    clients[0].drop();
    await flush();
    await ImapIdleManager.stop();
    expect(accountWrites).not.toHaveBeenCalled();
  });

  it("never stores or logs credentials or addresses", async () => {
    await startManager();
    connectMock.mockRejectedValueOnce(new EmailTransientError());
    clients[0].drop();
    await flush();
    const logged = JSON.stringify([
      ...(logger.warn as jest.Mock).mock.calls,
      ...(logger.info as jest.Mock).mock.calls,
      ...(logger.error as jest.Mock).mock.calls
    ]);
    expect(logged).not.toContain("cipher-1");
    expect(logged).not.toContain("box1@empresa.com");
    expect(logged).not.toContain("imap.empresa.com");
    // the lease value is a random token, not derived from the account secrets
    expect(JSON.stringify([...redis.store.values()])).not.toContain("cipher");
  });

  describe("reconnect", () => {
    beforeEach(() => {
      fakeTimers();
    });

    it("reconnects after a drop with a bounded exponential backoff", async () => {
      connectMock.mockImplementation(async () => {
        const client = new FakeClient();
        clients.push(client);
        if (clients.length > 1) throw new EmailTransientError();
        return client;
      });
      await startManager();
      expect(clients).toHaveLength(1);

      clients[0].drop();
      await flush();
      // first retry only after the minimum backoff
      expect(connectMock).toHaveBeenCalledTimes(1);
      await advance(BACKOFF_MIN_MS - 1);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(1);
      await advance(1);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(2);

      // keeps failing: 5s, 10s, 20s ... capped at 5 min
      const waits: number[] = [];
      let wait = BACKOFF_MIN_MS;
      for (let i = 0; i < 10; i += 1) {
        wait = Math.min(wait * 2, BACKOFF_MAX_MS);
        waits.push(wait);
        const before = connectMock.mock.calls.length;
        await advance(wait - 1);
        await flush();
        expect(connectMock.mock.calls.length).toBe(before);
        await advance(1);
        await flush();
        expect(connectMock.mock.calls.length).toBe(before + 1);
      }
      expect(Math.max(...waits)).toBe(BACKOFF_MAX_MS);
      expect(BACKOFF_MAX_MS).toBe(5 * 60 * 1000);
      expect(BACKOFF_MIN_MS).toBe(5000);
    });

    it("resets the backoff after a connection that stayed up", async () => {
      await startManager();
      await advance(5 * 60 * 1000);
      clients[0].drop();
      await flush();
      await advance(BACKOFF_MIN_MS);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(2);
    });

    it("stops reconnecting after an auth failure and leaves the status to polling", async () => {
      connectMock.mockRejectedValue(new EmailAuthError());
      await startManager();
      expect(connectMock).toHaveBeenCalledTimes(1);

      await advance(BACKOFF_MAX_MS * 3);
      await flush();
      await ImapIdleManager.refresh();
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(1);
      // R23: IDLE code never writes the account row
      expect(accountWrites).not.toHaveBeenCalled();
      expect(redis.store.has(idleLeaseKey(1))).toBe(false);

      // new credentials give it another chance
      rows[0].credentials = "cipher-1-new";
      connectMock.mockImplementation(async () => {
        const client = new FakeClient();
        clients.push(client);
        return client;
      });
      await ImapIdleManager.refresh();
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(2);
    });

    it("stops reconnecting once the account is no longer eligible", async () => {
      await startManager();
      clients[0].drop();
      await flush();
      rows[0].status = "disabled";
      await advance(BACKOFF_MIN_MS);
      await flush();
      // the reconnect re-checks the row and gives up
      expect(connectMock).toHaveBeenCalledTimes(1);
      expect(redis.store.size).toBe(0);
    });
  });

  it("respects EMAIL_IMAP_IDLE_MAX", async () => {
    process.env.EMAIL_IMAP_IDLE_MAX = "2";
    rows = [row(1), row(2), row(3), row(4)];
    await startManager();
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(redis.store.size).toBe(2);

    // a slot freed by an account that left goes to one that was waiting
    rows[0].status = "disabled";
    await ImapIdleManager.refresh();
    await flush();
    expect(connectMock).toHaveBeenCalledTimes(3);
    expect(redis.store.size).toBe(2);
  });

  it("defaults the cap to 200 and survives a bad EMAIL_IMAP_IDLE_MAX", async () => {
    process.env.EMAIL_IMAP_IDLE_MAX = "banana";
    rows = Array.from({ length: 205 }, (_, i) => row(i + 1));
    await startManager();
    expect(connectMock).toHaveBeenCalledTimes(200);
  });

  describe("per-account Redis lease (multi-process)", () => {
    it("does not run IDLE for an account whose lease another process holds", async () => {
      redis.store.set(idleLeaseKey(1), "other-process-token");
      rows = [row(1), row(2)];
      await startManager();
      expect(connectMock).toHaveBeenCalledTimes(1);
      expect(redis.store.get(idleLeaseKey(1))).toBe("other-process-token");
      expect(redis.store.has(idleLeaseKey(2))).toBe(true);

      // the other process goes away: the next refresh takes over
      redis.store.delete(idleLeaseKey(1));
      await ImapIdleManager.refresh();
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(2);
    });

    it("takes the lease with SET NX PX and a ttl", async () => {
      await startManager();
      expect(redis.set).toHaveBeenCalledWith(
        idleLeaseKey(1),
        expect.any(String),
        "PX",
        LEASE_TTL_MS,
        "NX"
      );
    });

    it("renews the lease while running", async () => {
      fakeTimers();
      await startManager();
      redis.eval.mockClear();
      await advance(LEASE_TTL_MS);
      await flush();
      expect(redis.eval).toHaveBeenCalled();
      expect(clients[0].usable).toBe(true);
    });

    it("stops IDLE when the lease is lost to another process", async () => {
      fakeTimers();
      await startManager();
      redis.store.set(idleLeaseKey(1), "stolen");
      await advance(LEASE_TTL_MS);
      await flush();
      expect(clients[0].usable).toBe(false);
      // and it is not reconnected here; the new owner's token is untouched
      await advance(BACKOFF_MAX_MS);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(1);
      expect(redis.store.get(idleLeaseKey(1))).toBe("stolen");
    });

    it("does not watch anything while Redis is unavailable, and refresh still resolves", async () => {
      redis.set.mockRejectedValue(new Error("redis down"));
      await expect(ImapIdleManager.start()).resolves.toBeUndefined();
      await flush();
      expect(connectMock).not.toHaveBeenCalled();
    });
  });

  describe("hardening round", () => {
    it("flags the account as dirty after enqueueing, so a running round is followed by another", async () => {
      await startManager();
      lastClient().emit("exists", { path: "INBOX", count: 2, prevCount: 1 });
      await flush();
      expect(enqueueAccountSync).toHaveBeenCalledWith(1);
      expect(markSyncDirtyIfActive).toHaveBeenCalledWith(1);
      const order = [
        (enqueueAccountSync as jest.Mock).mock.invocationCallOrder[0],
        (markSyncDirtyIfActive as jest.Mock).mock.invocationCallOrder[0]
      ];
      expect(order[0]).toBeLessThan(order[1]);

      // a failure of the flag never breaks the connection
      (markSyncDirtyIfActive as jest.Mock).mockRejectedValue(new Error("x"));
      lastClient().emit("exists", { path: "INBOX", count: 3, prevCount: 2 });
      await flush();
      expect(lastClient().usable).toBe(true);
    });

    describe("IDLE capability (same rule as imapflow)", () => {
      const connectWith = (
        capabilities: Map<string, boolean | number>,
        enabled: string[] = []
      ) =>
        connectMock.mockImplementation(async () => {
          const client = new FakeClient();
          client.capabilities = capabilities;
          client.enabled = new Set(enabled);
          clients.push(client);
          return client;
        });

      it("uses IDLE on a rev2-only server, which does not list IDLE (imapflow stores it as IMAP4rev2)", async () => {
        const caps = capsOf("IMAP4rev2");
        expect(caps.has("IMAP4rev2")).toBe(true);
        expect(caps.has("IDLE")).toBe(false);
        connectWith(caps);
        await startManager();
        expect(clients[0].idle).toHaveBeenCalledTimes(1);
        expect(clients[0].usable).toBe(true);
      });

      it("uses IDLE when IMAP4REV2 was enabled with ENABLE, even without the IDLE capability", async () => {
        connectWith(capsOf("IMAP4rev1", "IMAP4rev2", "ENABLE"), ["IMAP4REV2"]);
        await startManager();
        expect(clients[0].idle).toHaveBeenCalledTimes(1);
      });

      it("treats a rev1+rev2 server without IDLE (and without ENABLE) as having no IDLE", async () => {
        connectWith(capsOf("IMAP4rev1", "IMAP4rev2", "UIDPLUS"));
        await startManager();
        expect(clients[0].idle).not.toHaveBeenCalled();
        expect(clients[0].usable).toBe(false);
        await ImapIdleManager.refresh();
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(1);
      });

      it("a lowercase look-alike of the old key is not enough", async () => {
        connectWith(capsOf("IMAP4rev1", "NAMESPACE"));
        await startManager();
        expect(clients[0].idle).not.toHaveBeenCalled();
      });

      it("agrees with imapflow's own hasCapability(IDLE) for every combination", async () => {
        const combos: Array<[string[], string[]]> = [
          [["IMAP4rev1", "IDLE"], []],
          [["IMAP4rev1"], []],
          [["IMAP4rev2"], []],
          [["IMAP4rev1", "IMAP4rev2"], []],
          [["IMAP4rev1", "IMAP4rev2"], ["IMAP4REV2"]],
          [["IMAP4rev1", "IMAP4rev2", "IDLE"], []],
          [[], []]
        ];
        // eslint-disable-next-line no-restricted-syntax
        for (const [names, enabled] of combos) {
          await ImapIdleManager.stop();
          clients = [];
          connectMock.mockClear();
          connectWith(capsOf(...names), enabled);

          await startManager();
          const expected = hasCapability(
            {
              capabilities: capsOf(...names),
              enabled: new Set(enabled)
            } as any,
            "IDLE"
          );
          expect(clients[0].idle.mock.calls.length > 0).toBe(expected);
        }
      });
    });

    describe("lease renewal errors", () => {
      beforeEach(() => fakeTimers());

      it("stops IDLE once the TTL passed without a successful renewal (eval rejecting)", async () => {
        await startManager();
        redis.eval.mockRejectedValue(new Error("redis down"));

        // three failed renewals (20s, 40s, 60s): still inside the safe window
        await advance(LEASE_RENEW_MS * 3);
        await flush();
        expect(clients[0].usable).toBe(true);

        // stops one renewal interval BEFORE the lease can expire, so no other
        // process can have taken it while this one is still connected
        await advance(LEASE_RENEW_MS);
        await flush();
        expect(clients[0].usable).toBe(false);
        expect(LEASE_RENEW_MS * 4).toBeLessThan(LEASE_TTL_MS);
        // not reconnected here while Redis is unusable
        await advance(BACKOFF_MAX_MS);
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(1);
      });

      it("a success in between resets the clock", async () => {
        await startManager();
        redis.eval.mockRejectedValueOnce(new Error("blip"));
        await advance(LEASE_RENEW_MS);
        await flush();
        // later renewals succeed (default fake), the lease is fine for long
        await advance(LEASE_TTL_MS * 3);
        await flush();
        expect(clients[0].usable).toBe(true);
      });

      it("stops IDLE when renewals hang instead of failing", async () => {
        await startManager();
        (redis.eval as jest.Mock).mockImplementation(
          () => new Promise(() => undefined)
        );
        // stopped by the time the lease would expire, not after
        await advance(LEASE_TTL_MS - 1);
        await flush();
        expect(clients[0].usable).toBe(false);
      });
    });

    describe("tombstone expiry", () => {
      beforeEach(() => fakeTimers());

      it("retries an auth_failed account after the tombstone TTL", async () => {
        connectMock.mockRejectedValue(new EmailAuthError());
        await startManager();
        expect(connectMock).toHaveBeenCalledTimes(1);

        await advance(TOMBSTONE_TTL_MS - 1);
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(1);

        await advance(1);
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(2);
      });

      it("retries a no_idle account after the tombstone TTL", async () => {
        connectMock.mockImplementation(async () => {
          const client = new FakeClient();
          client.capabilities.delete("IDLE");
          clients.push(client);
          return client;
        });
        await startManager();
        const logoutsAfterStart = clients[0].logout.mock.calls.length;
        expect(logoutsAfterStart).toBe(1);
        await advance(TOMBSTONE_TTL_MS - 1);
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(1);
        await advance(1);
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(2);
        // the expired tombstone does not close the already closed client again
        expect(clients[0].logout).toHaveBeenCalledTimes(logoutsAfterStart);
      });

      it("a tombstone is still cleared when the account leaves and comes back active", async () => {
        connectMock.mockRejectedValueOnce(new EmailAuthError());
        await startManager();
        expect(connectMock).toHaveBeenCalledTimes(1);

        rows[0].status = "reauth_required";
        await ImapIdleManager.refresh();
        await flush();
        rows[0].status = "active";
        await ImapIdleManager.refresh();
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(2);
        expect(clients[0].usable).toBe(true);
      });
    });

    describe("bounded shutdown", () => {
      it("stop does not wait forever for a hung refresh, and the refresh cannot start anything afterwards", async () => {
        await startManager();
        expect(connectMock).toHaveBeenCalledTimes(1);
        fakeTimers();

        let release: (value: Row[]) => void = () => undefined;
        findAll.mockImplementation(
          () =>
            new Promise<Row[]>(resolve => {
              release = resolve;
            })
        );
        rows.push(row(2));
        const hung = ImapIdleManager.refresh();
        await flush();

        const stopping = ImapIdleManager.stop();
        await flush();
        // current connections are closed right away
        expect(clients[0].usable).toBe(false);
        await advance(STOP_TIMEOUT_MS);
        await expect(stopping).resolves.toBeUndefined();

        // the late refresh finishes: it must not open or lease anything
        release(rows);
        await hung;
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(1);
        expect(redis.store.size).toBe(0);
      });

      it("stop closes entries a refresh added while it was waiting for that refresh", async () => {
        await ImapIdleManager.start();
        await flush();
        expect(connectMock).toHaveBeenCalledTimes(1);

        let release: (value: Row[]) => void = () => undefined;
        findAll.mockImplementation(
          () =>
            new Promise<Row[]>(resolve => {
              release = resolve;
            })
        );
        const inFlight = ImapIdleManager.refresh();
        await flush();
        const stopping = ImapIdleManager.stop();
        release([row(1)]);
        await Promise.all([stopping, inFlight]);
        await flush();
        expect(clients.every(c => !c.usable)).toBe(true);
        expect(redis.store.size).toBe(0);
      });
    });
  });

  describe("lifecycle", () => {
    it("refresh before start is a no-op (EMAIL_IMAP_IDLE=false keeps IDLE off)", async () => {
      await ImapIdleManager.refresh();
      await flush();
      expect(findAll).not.toHaveBeenCalled();
      expect(connectMock).not.toHaveBeenCalled();
    });

    it("refresh never rejects, even when the database fails", async () => {
      await startManager();
      findAll.mockRejectedValue(new Error("db down"));
      await expect(ImapIdleManager.refresh()).resolves.toBeUndefined();
      // existing connections are kept when the eligible set is unknown
      expect(clients[0].usable).toBe(true);
    });

    it("stop closes every connection, releases every lease and ends the loops", async () => {
      rows = [row(1), row(2), row(3)];
      await startManager();
      expect(redis.store.size).toBe(3);

      await ImapIdleManager.stop();
      expect(clients.every(c => !c.usable)).toBe(true);
      expect(redis.store.size).toBe(0);

      // nothing comes back after stop
      await ImapIdleManager.refresh();
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(3);
    });

    it("stop while a connection is still being opened closes it when it lands", async () => {
      let release: (c: FakeClient) => void = () => undefined;
      connectMock.mockImplementation(
        () =>
          new Promise<FakeClient>(resolve => {
            release = resolve;
          })
      );
      await startManager();
      const stopping = ImapIdleManager.stop();
      const late = new FakeClient();
      release(late);
      await stopping;
      await flush();
      expect(late.usable).toBe(false);
      expect(late.idle).not.toHaveBeenCalled();
    });

    it("start twice does not duplicate connections", async () => {
      await startManager();
      await startManager();
      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it("two overlapping refreshes do not open the same account twice", async () => {
      await ImapIdleManager.start();
      await Promise.all([
        ImapIdleManager.refresh(),
        ImapIdleManager.refresh(),
        ImapIdleManager.refresh()
      ]);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(1);
    });
  });
});
