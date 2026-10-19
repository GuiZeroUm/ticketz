import Queue, { Job } from "bull";
import { Op } from "sequelize";
import {
  runtimeCompanyWhere,
  runtimeQueueOptions
} from "../helpers/tenantRuntime";
import EmailAccount from "../models/EmailAccount";
import { emailEnabledForCompany } from "../services/EmailServices/EmailAccessService";
import SyncEmailAccountService from "../services/EmailServices/SyncEmailAccountService";
import { logger } from "../utils/logger";

const connection = process.env.REDIS_URI || "";
export const emailQueue = new Queue(
  "EmailSync",
  connection,
  runtimeQueueOptions()
);

export const SYNC_JOB = "EmailSyncAccount";
export const TICK_JOB = "EmailSyncTick";
export const SYNC_CONCURRENCY = 5;

const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 15 * 60 * 1000;
const BACKOFF_TOLERANCE_MS = 5 * 1000;

export const syncJobId = (accountId: number): string => `sync-${accountId}`;

// Waiting time after `errorCount` consecutive failures: 1, 2, 4, 8 min, then
// capped at 15 (the 5th would be 16). The tick only runs once a minute, so the
// check below allows BACKOFF_TOLERANCE_MS of slack: without it a retry due at
// 59.9s would wait for the following tick and double the delay.
export const backoffMs = (errorCount: number): number =>
  errorCount <= 0
    ? 0
    : Math.min(BACKOFF_BASE_MS * 2 ** (errorCount - 1), BACKOFF_MAX_MS);

// Single-flight per account, part 1: a deterministic jobId makes Bull drop an
// add while a job with that id is waiting, delayed or active. Bull's addJob
// script (node_modules/bull/lib/commands/addJob-6.lua) skips the add whenever
// the job hash EXISTS, in any state, so finished jobs must not be kept:
// removeOnComplete/removeOnFail delete them, otherwise one failed or completed
// job would pin `sync-<id>` and block every later sync of that account. Part 2 is the Redis lock
// inside SyncEmailAccountService, which also covers stalled-job re-runs and
// callers outside this queue.
export const enqueueAccountSync = async (accountId: number): Promise<void> => {
  await emailQueue.add(
    SYNC_JOB,
    { accountId },
    {
      jobId: syncJobId(accountId),
      removeOnComplete: true,
      removeOnFail: true
    }
  );
};

const inBackoff = (account: EmailAccount, now: number): boolean => {
  const at = account.lastError?.at ? Date.parse(account.lastError.at) : NaN;
  if (Number.isNaN(at)) return false;
  return now - at < backoffMs(account.errorCount || 0) - BACKOFF_TOLERANCE_MS;
};

// Runs every minute. Extension point (Task 17): ImapIdleManager.refresh() is
// called from here so IDLE watchers follow the same eligible accounts.
export const runEmailSyncTick = async (): Promise<number> => {
  const accounts = await EmailAccount.findAll({
    attributes: ["id", "companyId", "status", "errorCount", "lastError"],
    where: {
      [Op.and]: [
        { status: { [Op.in]: ["active", "error"] } },
        runtimeCompanyWhere()
      ]
    }
  });

  const enabled = new Map<number, boolean>();
  const now = Date.now();
  let enqueued = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const account of accounts) {
    if (!enabled.has(account.companyId)) {
      enabled.set(
        account.companyId,
        await emailEnabledForCompany(account.companyId)
      );
    }
    if (enabled.get(account.companyId) && !inBackoff(account, now)) {
      await enqueueAccountSync(account.id);
      enqueued += 1;
    }
  }
  return enqueued;
};

export const handleSyncAccountJob = async (
  job: Pick<Job<{ accountId: number }>, "data">
) => SyncEmailAccountService(job.data.accountId);

// With hasMore the next round is queued once this job has left the queue (its
// id is still taken while active, so adding from inside the job would be
// dropped). If this misses, the next tick picks the account up anyway.
export const handleSyncCompleted = async (
  job: Pick<Job<{ accountId: number }>, "data">,
  result: { hasMore?: boolean } | undefined
): Promise<void> => {
  if (!result?.hasMore) return;
  try {
    await enqueueAccountSync(job.data.accountId);
  } catch {
    logger.warn(
      { emailAccountId: job.data.accountId },
      "Could not re-enqueue email sync"
    );
  }
};

// Task 12 adds the "EmailSend" processor here.
export const startEmailQueue = (): void => {
  emailQueue.process(TICK_JOB, async () => {
    await runEmailSyncTick();
  });
  emailQueue.process(SYNC_JOB, SYNC_CONCURRENCY, handleSyncAccountJob);
  emailQueue.on("completed", handleSyncCompleted);
  emailQueue.on("failed", (job, err) => {
    logger.warn({ job: job?.name, error: err?.name }, "Email sync job failed");
  });

  emailQueue
    .add(
      TICK_JOB,
      {},
      {
        repeat: { cron: "* * * * *" },
        removeOnComplete: true,
        removeOnFail: true
      }
    )
    .catch(() => logger.warn("Could not schedule email sync tick"));
};
