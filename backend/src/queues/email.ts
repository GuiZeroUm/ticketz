import Queue, { Job } from "bull";
import { Op } from "sequelize";
import {
  runtimeCompanyWhere,
  runtimeQueueOptions
} from "../helpers/tenantRuntime";
import EmailAccount from "../models/EmailAccount";
import { emailEnabledForCompany } from "../services/EmailServices/EmailAccessService";
import ProcessEmailSendJob from "../services/EmailServices/ProcessEmailSendJob";
import SyncEmailAccountService from "../services/EmailServices/SyncEmailAccountService";
import { logger } from "../utils/logger";

const connection = process.env.REDIS_URI || "";
export const emailQueue = new Queue(
  "EmailSync",
  connection,
  runtimeQueueOptions()
);

// Sends have their own queue (ruling R24): a backlog of sync rounds never
// delays a reply, and the sync queue keeps its own concurrency (Bull adds up
// the concurrency of every processor of a queue and lets any job take any
// slot).
export const emailSendQueue = new Queue(
  "EmailSend",
  connection,
  runtimeQueueOptions()
);

export const SYNC_JOB = "EmailSyncAccount";
export const TICK_JOB = "EmailSyncTick";
export const SYNC_CONCURRENCY = 5;
export const SEND_JOB = "EmailSend";
export const SEND_CONCURRENCY = 5;

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

export const sendJobId = (emailMessageId: number, attempt = 0): string =>
  attempt
    ? `send-${emailMessageId}-retry-${attempt}`
    : `send-${emailMessageId}`;

type SendJobData = { emailMessageId: number; attempt?: number };

// One job per outgoing email (`send-<id>`), never retried by Bull (attempts:
// 1): a retry could send the email twice. ProcessEmailSendJob schedules its
// own retries of transient failures, each under its own job id
// (`send-<id>-retry-<n>`), because the running job still holds `send-<id>`
// and Bull would drop an add with that id. removeOnComplete/removeOnFail as
// for sync jobs (see enqueueAccountSync): a kept job hash would pin its id.
// A duplicate run is harmless: the job only sends rows still "queued", behind
// a Redis marker.
export const enqueueEmailSend = async (
  emailMessageId: number,
  attempt = 0,
  delayMs = 0
): Promise<void> => {
  await emailSendQueue.add(
    SEND_JOB,
    { emailMessageId, attempt },
    {
      jobId: sendJobId(emailMessageId, attempt),
      attempts: 1,
      ...(delayMs > 0 ? { delay: delayMs } : {}),
      removeOnComplete: true,
      removeOnFail: true
    }
  );
};

export const handleSendJob = async (
  job: Pick<Job<SendJobData>, "data">
): Promise<void> => {
  const { emailMessageId } = job.data;
  await ProcessEmailSendJob(emailMessageId, {
    attempt: job.data.attempt || 0,
    scheduleRetry: (nextAttempt, delayMs) =>
      enqueueEmailSend(emailMessageId, nextAttempt, delayMs)
  });
};

export const startEmailQueue = (): void => {
  emailQueue.process(TICK_JOB, async () => {
    await runEmailSyncTick();
  });
  emailQueue.process(SYNC_JOB, SYNC_CONCURRENCY, handleSyncAccountJob);
  emailQueue.on("completed", handleSyncCompleted);
  emailQueue.on("failed", (job, err) => {
    logger.warn({ job: job?.name, error: err?.name }, "Email sync job failed");
  });

  emailSendQueue.process(SEND_JOB, SEND_CONCURRENCY, handleSendJob);
  emailSendQueue.on("failed", (job, err) => {
    logger.warn({ job: job?.name, error: err?.name }, "Email send job failed");
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
