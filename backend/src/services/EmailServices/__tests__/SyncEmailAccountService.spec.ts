/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConnectionRefusedError, TimeoutError } from "sequelize";
import EmailAccount from "../../../models/EmailAccount";
import { logger } from "../../../utils/logger";
import { getIO } from "../../../libs/socket";
import { EmailAuthError, EmailTransientError } from "../adapters/errors";
import { getAdapter } from "../adapters";
import { emailEnabledForCompany } from "../EmailAccessService";
import IngestEmailService from "../IngestEmailService";
import SyncEmailAccountService from "../SyncEmailAccountService";

jest.mock("../../../utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../adapters", () => ({
  ...jest.requireActual("../adapters/errors"),
  getAdapter: jest.fn()
}));
jest.mock("../EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn()
}));
jest.mock("../IngestEmailService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../../models/EmailAccount", () => {
  const model: any = {
    scope: jest.fn(),
    findByPk: jest.fn(),
    update: jest.fn()
  };
  model.scope.mockReturnValue(model);
  return { __esModule: true, default: model };
});
// In-memory stand-in for the Redis lock: held ids, released in `finally`.
// `__lockState.lost` simulates a lock that expired during the round.
jest.mock("../accountLock", () => {
  const held = new Set<number>();
  const state = { lost: false };
  return {
    __lockState: state,
    withAccountLock: async (
      id: number,
      fn: (ctx: unknown) => Promise<unknown>
    ) => {
      if (held.has(id)) return { acquired: false };
      held.add(id);
      try {
        return {
          acquired: true,
          result: await fn({
            isLost: () => state.lost,
            stillHeld: async () => !state.lost
          })
        };
      } finally {
        held.delete(id);
      }
    }
  };
});

// In-memory stand-in for the Redis failure counters.
jest.mock("../ingestFailures", () => {
  const actual = jest.requireActual("../ingestFailures");
  const counts = new Map<string, number>();
  return {
    ...actual,
    __counts: counts,
    recordIngestFailure: jest.fn(async (id: number, mid: string) => {
      const key = `${id}:${mid}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts.get(key);
    }),
    clearIngestFailure: jest.fn(async (id: number, mid: string) => {
      counts.delete(`${id}:${mid}`);
    })
  };
});

const Model = EmailAccount as any;
const lockState = jest.requireMock("../accountLock").__lockState;
const failureCounts: Map<string, number> =
  jest.requireMock("../ingestFailures").__counts;
const fetchChanges = jest.fn();
const emit = jest.fn();
const to = jest.fn();

const makeAccount = (over: Record<string, unknown> = {}) => {
  const account: any = {
    id: 5,
    companyId: 9,
    provider: "imap_smtp",
    preset: "custom",
    name: "Support",
    address: "support@example.com",
    status: "active",
    queueId: null,
    lastSyncAt: null,
    lastError: null,
    errorCount: 0,
    imapHost: "imap.example.com",
    imapPort: 993,
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    updatedAt: new Date(1000),
    // secrets that must never reach the socket payload
    credentials: "ENCRYPTED-CREDENTIALS",
    syncCursor: { folders: {} },
    ...over
  };
  account.set = jest.fn((values: Record<string, unknown>) =>
    Object.assign(account, values)
  );
  return account;
};

const email = (n: number) => ({ accountId: 5, providerMessageId: `m${n}` });

beforeEach(() => {
  jest.clearAllMocks();
  lockState.lost = false;
  failureCounts.clear();
  Model.scope.mockReturnValue(Model);
  Model.update.mockResolvedValue([1]);
  (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
  (getAdapter as jest.Mock).mockReturnValue({ fetchChanges });
  (IngestEmailService as jest.Mock).mockResolvedValue({ status: "created" });
  to.mockReturnValue({ emit });
  (getIO as jest.Mock).mockReturnValue({ to });
});

describe("SyncEmailAccountService", () => {
  it("loads the account with secrets", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockResolvedValue({ emails: [], cursor: {}, hasMore: false });
    await SyncEmailAccountService(5);
    expect(Model.scope).toHaveBeenCalledWith("withSecrets");
    expect(Model.findByPk).toHaveBeenCalledWith(5);
  });

  it("skips accounts of disabled companies and keeps cursor", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    (emailEnabledForCompany as jest.Mock).mockResolvedValue(false);

    await expect(SyncEmailAccountService(5)).resolves.toEqual({
      ingested: 0,
      hasMore: false
    });
    expect(emailEnabledForCompany).toHaveBeenCalledWith(9);
    expect(fetchChanges).not.toHaveBeenCalled();
    expect(IngestEmailService).not.toHaveBeenCalled();
    expect(Model.update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it.each(["disabled", "reauth_required", "connecting"])(
    "does not sync a %s account",
    async status => {
      Model.findByPk.mockResolvedValue(makeAccount({ status }));
      await SyncEmailAccountService(5);
      expect(fetchChanges).not.toHaveBeenCalled();
      expect(Model.update).not.toHaveBeenCalled();
    }
  );

  it("does nothing when the account does not exist", async () => {
    Model.findByPk.mockResolvedValue(null);
    await expect(SyncEmailAccountService(5)).resolves.toEqual({
      ingested: 0,
      hasMore: false
    });
    expect(fetchChanges).not.toHaveBeenCalled();
  });

  it("skips accounts of companies owned by another runtime", async () => {
    process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS = "9";
    try {
      Model.findByPk.mockResolvedValue(makeAccount());
      await SyncEmailAccountService(5);
      expect(fetchChanges).not.toHaveBeenCalled();
    } finally {
      delete process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS;
    }
  });

  it("saves cursor only after all emails are ingested, in order", async () => {
    const order: string[] = [];
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockResolvedValue({
      emails: [email(1), email(2), email(3)],
      cursor: { folders: { INBOX: { lastUid: 3 } } },
      hasMore: false
    });
    (IngestEmailService as jest.Mock).mockImplementation(async (_a, e) => {
      order.push(e.providerMessageId);
      return { status: e.providerMessageId === "m2" ? "ignored" : "created" };
    });
    Model.update.mockImplementation(async () => {
      order.push("save");
      return [1];
    });

    await expect(SyncEmailAccountService(5)).resolves.toEqual({
      ingested: 2,
      hasMore: false
    });
    expect(order).toEqual(["m1", "m2", "m3", "save"]);
    const [changes, options] = Model.update.mock.calls[0];
    expect(changes.syncCursor).toEqual({ folders: { INBOX: { lastUid: 3 } } });
    expect(changes.lastSyncAt).toBeInstanceOf(Date);
    expect(options.where.id).toBe(5);
  });

  it("does not save the cursor when an ingest fails, and counts the failure", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockResolvedValue({
      emails: [email(1), email(2), email(3)],
      cursor: { next: true },
      hasMore: true
    });
    (IngestEmailService as jest.Mock)
      .mockResolvedValueOnce({ status: "created" })
      .mockRejectedValueOnce(new Error("boom: secret@host body text"));

    await expect(SyncEmailAccountService(5)).resolves.toEqual({
      ingested: 0,
      hasMore: false
    });
    expect(IngestEmailService).toHaveBeenCalledTimes(2); // stops before m3
    expect(Model.update).toHaveBeenCalledTimes(1);
    const [changes] = Model.update.mock.calls[0];
    expect(changes).not.toHaveProperty("syncCursor");
    expect(changes).not.toHaveProperty("lastSyncAt");
    expect(changes.errorCount).toBe(1);
    expect(changes.lastError.code).toBe("ERR_EMAIL_SYNC_FAILED");
    expect(JSON.stringify(changes)).not.toContain("secret@host");
  });

  it("reports hasMore so the queue re-enqueues the account", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockResolvedValue({
      emails: [email(1)],
      cursor: { c: 1 },
      hasMore: true
    });
    await expect(SyncEmailAccountService(5)).resolves.toEqual({
      ingested: 1,
      hasMore: true
    });
  });

  it("sets reauth_required on EmailAuthError and emits the serialized account without credentials", async () => {
    const account = makeAccount();
    Model.findByPk.mockResolvedValue(account);
    fetchChanges.mockRejectedValue(new EmailAuthError());

    await SyncEmailAccountService(5);

    const [changes] = Model.update.mock.calls[0];
    expect(changes.status).toBe("reauth_required");
    expect(changes.lastError.code).toBe("ERR_EMAIL_AUTH");
    expect(typeof changes.lastError.at).toBe("string");
    expect(changes).not.toHaveProperty("syncCursor");

    expect(to).toHaveBeenCalledWith("company-9-admin");
    expect(emit).toHaveBeenCalledTimes(1);
    const [event, payload] = emit.mock.calls[0];
    expect(event).toBe("company-9-emailAccount");
    expect(payload.action).toBe("update");
    expect(payload.account).toMatchObject({
      id: 5,
      status: "reauth_required",
      lastError: { code: "ERR_EMAIL_AUTH" }
    });
    const wire = JSON.stringify(payload);
    expect(wire).not.toContain("ENCRYPTED-CREDENTIALS");
    expect(wire).not.toContain("syncCursor");
    expect(wire).not.toContain("credentials");
  });

  it("sets error after 3 consecutive failures and resets on success", async () => {
    const account = makeAccount();
    Model.findByPk.mockResolvedValue(account);
    fetchChanges.mockRejectedValue(
      new EmailTransientError("ERR_EMAIL_TRANSIENT", "ECONNREFUSED")
    );

    await SyncEmailAccountService(5);
    await SyncEmailAccountService(5);
    expect(account.status).toBe("active");
    expect(account.errorCount).toBe(2);
    expect(emit).not.toHaveBeenCalledWith(
      "company-9-emailAccount",
      expect.objectContaining({
        account: expect.objectContaining({ status: "error" })
      })
    );

    await SyncEmailAccountService(5);
    expect(account.errorCount).toBe(3);
    expect(account.status).toBe("error");
    expect(account.lastError.code).toBe("ERR_EMAIL_TRANSIENT");
    expect(JSON.stringify(account.lastError)).not.toContain("ECONNREFUSED");

    fetchChanges.mockResolvedValue({ emails: [], cursor: {}, hasMore: false });
    emit.mockClear();
    await SyncEmailAccountService(5);
    expect(account.status).toBe("active");
    expect(account.errorCount).toBe(0);
    expect(account.lastError).toBeNull();
    expect(emit.mock.calls[0][1].account.status).toBe("active");
  });

  it("does not emit on a routine successful round", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockResolvedValue({ emails: [], cursor: {}, hasMore: false });
    await SyncEmailAccountService(5);
    expect(Model.update).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it("only writes status to accounts that are still syncable", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockResolvedValue({ emails: [], cursor: {}, hasMore: false });
    Model.update.mockResolvedValue([0]); // disabled meanwhile
    await SyncEmailAccountService(5);
    const [, options] = Model.update.mock.calls[0];
    const status = options.where.status;
    expect(status[Object.getOwnPropertySymbols(status)[0]]).toEqual([
      "active",
      "error"
    ]);
    expect(emit).not.toHaveBeenCalled();
  });

  it("never runs two rounds of the same account at once", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    let release!: () => void;
    fetchChanges.mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve({ emails: [], cursor: {}, hasMore: false });
        })
    );

    const first = SyncEmailAccountService(5);
    await new Promise(resolve => setImmediate(resolve));
    const second = await SyncEmailAccountService(5);
    expect(second).toEqual({ ingested: 0, hasMore: false });
    expect(fetchChanges).toHaveBeenCalledTimes(1);

    release();
    await first;
    // lock released afterwards: a new round can start
    fetchChanges.mockResolvedValue({ emails: [], cursor: {}, hasMore: false });
    await SyncEmailAccountService(5);
    expect(fetchChanges).toHaveBeenCalledTimes(2);
  });

  it("releases the lock even when marking the failure throws", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockRejectedValue(new EmailAuthError());
    Model.update.mockRejectedValueOnce(new Error("db down"));
    await expect(SyncEmailAccountService(5)).rejects.toThrow("db down");
    Model.update.mockResolvedValue([1]);
    await SyncEmailAccountService(5);
    expect(fetchChanges).toHaveBeenCalledTimes(2);
  });

  describe("poison email skip policy (R22)", () => {
    const poison = new Error("constraint failed for secret@host");
    poison.name = "SequelizeDatabaseError";
    const setupRound = () => {
      fetchChanges.mockResolvedValue({
        emails: [email(1), email(2), email(3)],
        cursor: { next: true },
        hasMore: false
      });
      (IngestEmailService as jest.Mock).mockImplementation(async (_a, e) => {
        if (e.providerMessageId === "m2") throw poison;
        return { status: "created" };
      });
    };

    it("stops the round and keeps the cursor for the first two failures, skips on the third", async () => {
      Model.findByPk.mockImplementation(async () => makeAccount());
      setupRound();

      for (let round = 1; round <= 2; round += 1) {
        await SyncEmailAccountService(5);
        const [changes] = Model.update.mock.calls[round - 1];
        expect(changes).not.toHaveProperty("syncCursor");
        expect(changes.lastError.code).toBe("ERR_EMAIL_SYNC_FAILED");
        expect(failureCounts.get("5:m2")).toBe(round);
      }
      // rounds 1 and 2 stopped before m3
      expect(
        (IngestEmailService as jest.Mock).mock.calls.filter(
          c => c[1].providerMessageId === "m3"
        )
      ).toHaveLength(0);

      Model.update.mockClear();
      emit.mockClear();
      await expect(SyncEmailAccountService(5)).resolves.toEqual({
        ingested: 2,
        hasMore: false
      });
      // round 3: m3 was ingested after the skipped m2 and the cursor saved
      expect(
        (IngestEmailService as jest.Mock).mock.calls.filter(
          c => c[1].providerMessageId === "m3"
        )
      ).toHaveLength(1);
      expect(Model.update).toHaveBeenCalledTimes(1);
      const [changes] = Model.update.mock.calls[0];
      expect(changes.syncCursor).toEqual({ next: true });
      expect(changes.status).toBe("active");
      expect(changes.errorCount).toBe(0);
      expect(changes.lastError.code).toBe("ERR_EMAIL_MESSAGE_SKIPPED");
      expect(emit.mock.calls[0][1].account.lastError.code).toBe(
        "ERR_EMAIL_MESSAGE_SKIPPED"
      );
      const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
      expect(logged).toContain('"providerMessageId":"m2"');
      expect(logged).toContain("SequelizeDatabaseError");
      expect(logged).not.toContain("secret@host");
    });

    it.each([
      [
        "sequelize ConnectionError",
        () => new ConnectionRefusedError(new Error("x"))
      ],
      ["sequelize TimeoutError", () => new TimeoutError(new Error("x") as any)],
      [
        "redis error",
        () =>
          Object.assign(new Error("r"), { name: "MaxRetriesPerRequestError" })
      ],
      [
        "socket error",
        () => Object.assign(new Error("s"), { code: "ECONNRESET" })
      ]
    ])("never counts infrastructure failures (%s)", async (_n, make) => {
      Model.findByPk.mockImplementation(async () => makeAccount());
      fetchChanges.mockResolvedValue({
        emails: [email(1), email(2)],
        cursor: { next: true },
        hasMore: false
      });
      (IngestEmailService as jest.Mock).mockRejectedValue(make());
      for (let round = 0; round < 5; round += 1) {
        await SyncEmailAccountService(5);
      }
      expect(failureCounts.size).toBe(0);
      expect(IngestEmailService).toHaveBeenCalledTimes(5); // always stops at first
      const saved = Model.update.mock.calls.filter(([c]: any) => c.syncCursor);
      expect(saved).toHaveLength(0);
    });

    it("clears the counter after a successful ingest", async () => {
      Model.findByPk.mockImplementation(async () => makeAccount());
      setupRound();
      await SyncEmailAccountService(5);
      expect(failureCounts.get("5:m2")).toBe(1);
      (IngestEmailService as jest.Mock).mockResolvedValue({
        status: "created"
      });
      await SyncEmailAccountService(5);
      expect(failureCounts.has("5:m2")).toBe(false);
    });

    it("keeps skipping a message already at the limit if the cursor save was lost", async () => {
      Model.findByPk.mockImplementation(async () => makeAccount());
      failureCounts.set("5:m2", 3);
      setupRound();
      await SyncEmailAccountService(5);
      expect(Model.update.mock.calls[0][0].syncCursor).toEqual({ next: true });
    });
  });

  it("does not write the cursor when the lock was lost during the round", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockImplementation(async () => {
      lockState.lost = true; // heartbeat found the lock gone mid-round
      return { emails: [email(1)], cursor: { c: 1 }, hasMore: true };
    });
    await expect(SyncEmailAccountService(5)).resolves.toEqual({
      ingested: 1,
      hasMore: false
    });
    expect(Model.update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("guards the write with the updatedAt read at round start", async () => {
    const account = makeAccount();
    Model.findByPk.mockResolvedValue(account);
    fetchChanges.mockResolvedValue({
      emails: [],
      cursor: { c: 1 },
      hasMore: true
    });
    await SyncEmailAccountService(5);
    const [, options] = Model.update.mock.calls[0];
    expect(options.where.updatedAt).toEqual(new Date(1000));
  });

  it("drops the round's cursor when the account was reconnected meanwhile", async () => {
    Model.findByPk.mockResolvedValue(makeAccount());
    fetchChanges.mockResolvedValue({
      emails: [email(1)],
      cursor: { old: 1 },
      hasMore: true
    });
    Model.update.mockResolvedValue([0]); // updatedAt moved: reconnect/edit
    await expect(SyncEmailAccountService(5)).resolves.toEqual({
      ingested: 1,
      hasMore: false
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("does not flag a reconnected account with a stale auth error", async () => {
    const account = makeAccount();
    Model.findByPk.mockResolvedValue(account);
    fetchChanges.mockRejectedValue(new EmailAuthError());
    Model.update.mockResolvedValue([0]);
    await SyncEmailAccountService(5);
    expect(Model.update.mock.calls[0][1].where.updatedAt).toEqual(
      new Date(1000)
    );
    expect(account.status).toBe("active");
    expect(emit).not.toHaveBeenCalled();
  });
});
