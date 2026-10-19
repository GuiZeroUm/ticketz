/* eslint-disable @typescript-eslint/no-explicit-any */
import EmailAccount from "../../models/EmailAccount";
import { emailEnabledForCompany } from "../../services/EmailServices/EmailAccessService";
import SyncEmailAccountService from "../../services/EmailServices/SyncEmailAccountService";
import ProcessEmailSendJob from "../../services/EmailServices/ProcessEmailSendJob";
import ImapIdleManager from "../../services/EmailServices/ImapIdleManager";
import emailRedis from "../../services/EmailServices/emailRedis";
import {
  backoffMs,
  emailQueue,
  markSyncDirtyIfActive,
  syncDirtyKey,
  emailSendQueue,
  enqueueAccountSync,
  enqueueEmailSend,
  handleSendJob,
  handleSyncAccountJob,
  handleSyncCompleted,
  runEmailSyncTick,
  startEmailQueue
} from "../email";

jest.mock("../../utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));
jest.mock("bull", () => {
  const queues: Record<string, unknown> = {};
  return {
    __esModule: true,
    default: jest.fn((name: string) => {
      queues[name] = queues[name] || {
        add: jest.fn().mockResolvedValue({}),
        getJob: jest.fn(),
        process: jest.fn(),
        on: jest.fn()
      };
      return queues[name];
    })
  };
});
jest.mock("../../models/EmailAccount", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../services/EmailServices/EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn()
}));
jest.mock("../../services/EmailServices/SyncEmailAccountService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/EmailServices/emailRedis", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/EmailServices/ImapIdleManager", () => ({
  __esModule: true,
  default: { start: jest.fn(), refresh: jest.fn(), stop: jest.fn() }
}));
jest.mock("../../services/EmailServices/ProcessEmailSendJob", () => ({
  __esModule: true,
  default: jest.fn()
}));

// clearMocks wipes call records between tests; capture the module-load call.
const queueCtorCalls = [...jest.requireMock("bull").default.mock.calls];
const Model = EmailAccount as any;
const queue = emailQueue as any;
const sendQueue = emailSendQueue as any;
const acct = (id: number, companyId: number, over: any = {}) => ({
  id,
  companyId,
  status: "active",
  errorCount: 0,
  lastError: null,
  ...over
});

const redisMock = {
  set: jest.fn(),
  eval: jest.fn()
};

beforeEach(() => {
  jest.clearAllMocks();
  redisMock.set.mockResolvedValue("OK");
  // no dirty flag unless a test sets one
  redisMock.eval.mockReset();
  redisMock.eval.mockResolvedValue(null);
  (emailRedis as jest.Mock).mockReturnValue(redisMock);
  queue.getJob.mockReset();
  (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
  queue.add.mockResolvedValue({});
  sendQueue.add.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS;
  delete process.env.TENANT_RUNTIME_COMPANY_ID;
  delete process.env.QUEUE_PREFIX;
});

describe("EmailSync queue", () => {
  it("is a Bull queue named EmailSync using the runtime prefix", () => {
    expect(queueCtorCalls).toEqual([
      ["EmailSync", expect.any(String), { prefix: "bull" }],
      ["EmailSend", expect.any(String), { prefix: "bull" }]
    ]);
    // sends never wait behind sync rounds
    expect(emailSendQueue).not.toBe(emailQueue);
  });

  it("dedupes sync jobs by account", async () => {
    await enqueueAccountSync(7);
    await enqueueAccountSync(7);
    await enqueueAccountSync(8);
    const calls = queue.add.mock.calls;
    expect(calls[0]).toEqual([
      "EmailSyncAccount",
      { accountId: 7 },
      { jobId: "sync-7", removeOnComplete: true, removeOnFail: true }
    ]);
    // same account => identical jobId (Bull drops the duplicate), other => distinct
    expect(calls[1][2].jobId).toBe(calls[0][2].jobId);
    expect(calls[2][2].jobId).toBe("sync-8");
  });

  it("registers the repeatable tick and the processors", () => {
    startEmailQueue();
    const names = queue.process.mock.calls.map((c: any[]) => c[0]);
    expect(names).toEqual(["EmailSyncTick", "EmailSyncAccount"]);
    const syncProcess = queue.process.mock.calls.find(
      (c: any[]) => c[0] === "EmailSyncAccount"
    );
    expect(syncProcess[1]).toBe(5);
    expect(queue.add).toHaveBeenCalledWith(
      "EmailSyncTick",
      {},
      expect.objectContaining({ repeat: { cron: "* * * * *" } })
    );
    expect(queue.on).toHaveBeenCalledWith("completed", expect.any(Function));
  });

  it("runs the account sync service for a sync job", async () => {
    (SyncEmailAccountService as jest.Mock).mockResolvedValue({
      ingested: 1,
      hasMore: false
    });
    await expect(
      handleSyncAccountJob({ data: { accountId: 3 } })
    ).resolves.toEqual({ ingested: 1, hasMore: false });
    expect(SyncEmailAccountService).toHaveBeenCalledWith(3);
  });

  it("re-enqueues the account when the finished round has more", async () => {
    await handleSyncCompleted({ data: { accountId: 3 } }, { hasMore: true });
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][2].jobId).toBe("sync-3");
    await handleSyncCompleted({ data: { accountId: 3 } }, { hasMore: false });
    await handleSyncCompleted({ data: { accountId: 3 } }, undefined);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("re-enqueues when IDLE flagged new mail during the round, even without hasMore", async () => {
    redisMock.eval.mockResolvedValue("1");
    await handleSyncCompleted({ data: { accountId: 3 } }, { hasMore: false });
    expect(redisMock.eval).toHaveBeenCalledWith(
      expect.stringContaining("del"),
      1,
      syncDirtyKey(3)
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][2].jobId).toBe("sync-3");

    queue.add.mockClear();
    await handleSyncCompleted({ data: { accountId: 3 } }, undefined);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("queues one round, not two, when both hasMore and the dirty flag are set", async () => {
    redisMock.eval.mockResolvedValue("1");
    await handleSyncCompleted({ data: { accountId: 3 } }, { hasMore: true });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("does not re-enqueue without hasMore or the dirty flag, and a Redis failure is harmless", async () => {
    await handleSyncCompleted({ data: { accountId: 3 } }, { hasMore: false });
    expect(queue.add).not.toHaveBeenCalled();
    redisMock.eval.mockRejectedValue(new Error("redis down"));
    await expect(
      handleSyncCompleted({ data: { accountId: 3 } }, { hasMore: false })
    ).resolves.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
    // hasMore still works with Redis down
    await handleSyncCompleted({ data: { accountId: 3 } }, { hasMore: true });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("markSyncDirtyIfActive sets the flag (5 min TTL) only while the account's job is active", async () => {
    queue.getJob.mockResolvedValue({ isActive: async () => true });
    await markSyncDirtyIfActive(9);
    expect(queue.getJob).toHaveBeenCalledWith("sync-9");
    expect(redisMock.set).toHaveBeenCalledWith(
      "email:sync-dirty:9",
      "1",
      "PX",
      300000
    );

    redisMock.set.mockClear();
    queue.getJob.mockResolvedValue({ isActive: async () => false });
    await markSyncDirtyIfActive(9);
    queue.getJob.mockResolvedValue(null);
    await markSyncDirtyIfActive(9);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("a failing re-enqueue does not throw", async () => {
    queue.add.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      handleSyncCompleted({ data: { accountId: 3 } }, { hasMore: true })
    ).resolves.toBeUndefined();
  });
});

describe("EmailSend jobs", () => {
  it("queues one send job per email message, never retried by Bull", async () => {
    await enqueueEmailSend(41);
    expect(sendQueue.add).toHaveBeenCalledWith(
      "EmailSend",
      { emailMessageId: 41, attempt: 0 },
      {
        jobId: "send-41",
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  });

  it("queues a delayed retry under its own job id", async () => {
    await enqueueEmailSend(41, 2, 120000);
    expect(sendQueue.add).toHaveBeenCalledWith(
      "EmailSend",
      { emailMessageId: 41, attempt: 2 },
      {
        jobId: "send-41-retry-2",
        attempts: 1,
        delay: 120000,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  });

  it("runs the send job with its attempt and a retry scheduler", async () => {
    (ProcessEmailSendJob as jest.Mock).mockResolvedValue(undefined);
    await handleSendJob({ data: { emailMessageId: 41, attempt: 1 } });
    const [id, options] = (ProcessEmailSendJob as jest.Mock).mock.calls[0];
    expect(id).toBe(41);
    expect(options.attempt).toBe(1);
    await options.scheduleRetry(2, 120000);
    expect(sendQueue.add.mock.calls[0][2].jobId).toBe("send-41-retry-2");
    expect(sendQueue.add.mock.calls[0][2].delay).toBe(120000);
  });

  it("registers the send processor with its own concurrency", () => {
    startEmailQueue();
    const sendProcess = sendQueue.process.mock.calls.find(
      (c: any[]) => c[0] === "EmailSend"
    );
    expect(sendProcess[1]).toBe(5);
    expect(sendProcess[2]).toBe(handleSendJob);
    expect(sendQueue.on).toHaveBeenCalledWith("failed", expect.any(Function));
    // the sync queue keeps only its own processors and concurrency
    expect(queue.process.mock.calls.map((c: any[]) => c[0])).toEqual([
      "EmailSyncTick",
      "EmailSyncAccount"
    ]);
  });
});

describe("EmailSyncTick", () => {
  it("enqueues active and error accounts of enabled companies only", async () => {
    Model.findAll.mockResolvedValue([acct(1, 10), acct(2, 10), acct(3, 11)]);
    (emailEnabledForCompany as jest.Mock).mockImplementation(
      async (id: number) => id === 10
    );
    await expect(runEmailSyncTick()).resolves.toBe(2);
    expect(queue.add.mock.calls.map((c: any[]) => c[2].jobId)).toEqual([
      "sync-1",
      "sync-2"
    ]);
    // one enablement check per company, not per account
    expect(emailEnabledForCompany).toHaveBeenCalledTimes(2);
  });

  it("selects only active/error accounts and no secrets", async () => {
    Model.findAll.mockResolvedValue([]);
    await runEmailSyncTick();
    const options = Model.findAll.mock.calls[0][0];
    expect(options.attributes).not.toContain("credentials");
    expect(options.attributes).not.toContain("syncCursor");
    const [statusClause] =
      options.where[Object.getOwnPropertySymbols(options.where)[0]];
    const inList =
      statusClause.status[Object.getOwnPropertySymbols(statusClause.status)[0]];
    expect(inList).toEqual(["active", "error"]);
  });

  it("tick ignores accounts outside runtimeCompanyWhere", async () => {
    process.env.TENANT_RUNTIME_COMPANY_ID = "10";
    process.env.QUEUE_PREFIX = "tenant10";
    Model.findAll.mockResolvedValue([]);
    await runEmailSyncTick();
    const clauses =
      Model.findAll.mock.calls[0][0].where[
        Object.getOwnPropertySymbols(Model.findAll.mock.calls[0][0].where)[0]
      ];
    expect(clauses).toContainEqual({ companyId: 10 });

    process.env.TENANT_RUNTIME_COMPANY_ID = "";
    process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS = "10,12";
    Model.findAll.mockClear();
    await runEmailSyncTick();
    const excluded =
      Model.findAll.mock.calls[0][0].where[
        Object.getOwnPropertySymbols(Model.findAll.mock.calls[0][0].where)[0]
      ][1];
    expect(
      excluded.companyId[Object.getOwnPropertySymbols(excluded.companyId)[0]]
    ).toEqual([10, 12]);
  });

  it("waits out the failure backoff before retrying an account", async () => {
    const recent = new Date(Date.now() - 30 * 1000).toISOString();
    const almost = new Date(Date.now() - 58 * 1000).toISOString();
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    Model.findAll.mockResolvedValue([
      acct(1, 10, { errorCount: 1, lastError: { code: "X", at: recent } }),
      acct(2, 10, { errorCount: 1, lastError: { code: "X", at: old } }),
      // due within the tick's slack: retried now instead of a minute later
      acct(4, 10, { errorCount: 1, lastError: { code: "X", at: almost } }),
      acct(3, 10, { errorCount: 0, lastError: null })
    ]);
    await runEmailSyncTick();
    expect(queue.add.mock.calls.map((c: any[]) => c[2].jobId)).toEqual([
      "sync-2",
      "sync-4",
      "sync-3"
    ]);
  });

  it("refreshes the IMAP IDLE watchers on every tick without changing the result", async () => {
    (ImapIdleManager.refresh as jest.Mock).mockResolvedValue(undefined);
    Model.findAll.mockResolvedValue([acct(1, 10), acct(2, 10)]);
    await expect(runEmailSyncTick()).resolves.toBe(2);
    expect(ImapIdleManager.refresh).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it("a failing IDLE refresh never breaks the tick", async () => {
    (ImapIdleManager.refresh as jest.Mock).mockRejectedValue(new Error("boom"));
    Model.findAll.mockResolvedValue([acct(1, 10)]);
    await expect(runEmailSyncTick()).resolves.toBe(1);

    (ImapIdleManager.refresh as jest.Mock).mockImplementation(() => {
      throw new Error("sync boom");
    });
    await expect(runEmailSyncTick()).resolves.toBe(1);
  });

  it("still refreshes IDLE when the account query fails, and keeps that error", async () => {
    (ImapIdleManager.refresh as jest.Mock).mockResolvedValue(undefined);
    Model.findAll.mockRejectedValue(new Error("db down"));
    await expect(runEmailSyncTick()).rejects.toThrow("db down");
    expect(ImapIdleManager.refresh).toHaveBeenCalledTimes(1);
  });

  it("backoff grows exponentially up to a cap", () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(50)).toBe(15 * 60_000);
  });
});
