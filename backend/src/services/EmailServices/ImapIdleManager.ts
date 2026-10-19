import { createHash, randomBytes } from "crypto";
import type { ImapFlow } from "imapflow";
import { Op } from "sequelize";
import { runtimeCompanyWhere } from "../../helpers/tenantRuntime";
import EmailAccount from "../../models/EmailAccount";
// Circular with queues/email (its tick calls refresh()); both sides only use
// the other at call time, never while loading.
import { enqueueAccountSync } from "../../queues/email";
import { logger } from "../../utils/logger";
import { RELEASE_SCRIPT, RENEW_SCRIPT } from "./accountLock";
import { EmailAuthError } from "./adapters/errors";
import { openImapIdleClient } from "./adapters/ImapSmtpAdapter";
import { emailEnabledForCompany } from "./EmailAccessService";
import emailRedis from "./emailRedis";

// Near-real-time inbound for IMAP accounts (Task 17). One ImapFlow connection
// per eligible account stays in IDLE on the INBOX; new mail only triggers
// enqueueAccountSync (single-flight per account), it never ingests anything
// itself, and nothing here writes the EmailAccount row (ruling R23: the sync
// round owns that write; an IDLE write would make every round's cursor write
// a no-op). Polling stays the safety net for everything IDLE misses.
//
// Rules the manager keeps:
// - Only imap_smtp accounts that are active, in a company with the channel on
//   and owned by this runtime (runtimeCompanyWhere), at most
//   EMAIL_IMAP_IDLE_MAX (default 200) connections per process.
// - Several backend processes may run: IDLE for an account lives in exactly one
//   of them, the holder of the per-account Redis lease (SET NX PX, renewed like
//   Task 11's account lock). Losing the lease stops IDLE in that process.
// - Reconnect backoff from 5 s to 5 min. An authentication failure is never
//   retried here (polling marks the account reauth_required, which makes it
//   ineligible); a server without the IDLE capability is left to polling.
// - A secret-free fingerprint (salted hash held in memory) detects changed
//   credentials or connection settings. updatedAt is not used: every sync
//   round rewrites the row.

export const BACKOFF_MIN_MS = 5 * 1000;
export const BACKOFF_MAX_MS = 5 * 60 * 1000;
export const LEASE_TTL_MS = 90 * 1000;
export const LEASE_RENEW_MS = 30 * 1000;
export const REFRESH_INTERVAL_MS = 60 * 1000;
export const DEFAULT_IDLE_MAX = 200;
// A connection that stayed up this long counts as healthy: the next drop
// starts from the minimum backoff again.
const STABLE_MS = 60 * 1000;
// imapflow restarts IDLE this often (servers drop it after ~30 min, RFC 2177).
const MAX_IDLE_TIME_MS = 20 * 60 * 1000;
// Spreads the connections of a process that starts with many accounts.
const STARTUP_JITTER_MS = 5 * 1000;
const IDLE_RESTART_GAP_MS = 1000;
const CLOSE_TIMEOUT_MS = 3 * 1000;
const STOP_TIMEOUT_MS = 10 * 1000;

type EntryState = "running" | "auth_failed" | "no_idle";

type Entry = {
  accountId: number;
  fingerprint: string;
  // "running" holds a lease and a connection loop; the other two are tombstones
  // that keep the account from being retried until its settings change.
  state: EntryState;
  stopped: boolean;
  token: string | null;
  leaseTimer: NodeJS.Timeout | null;
  client: ImapFlow | null;
  wake: (() => void) | null;
  attempts: number;
  done: Promise<void>;
};

type AccountRow = {
  id: number;
  companyId: number;
  address: string;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean | null;
  credentials: string | null;
};

const entries = new Map<number, Entry>();
let started = false;
let refreshTimer: NodeJS.Timeout | null = null;
let refreshing: Promise<void> | null = null;

// Per-process random salt: the fingerprint is only ever compared in memory.
const SALT = randomBytes(16).toString("hex");

const fingerprintOf = (account: AccountRow): string =>
  createHash("sha256")
    .update(SALT)
    .update(
      JSON.stringify([
        account.address,
        account.imapHost,
        account.imapPort,
        account.imapSecure,
        account.credentials
      ])
    )
    .digest("hex");

export const idleLeaseKey = (accountId: number): string =>
  `email:idle-lease:${accountId}`;

const idleMax = (): number => {
  const raw = process.env.EMAIL_IMAP_IDLE_MAX;
  if (raw === undefined || raw.trim() === "") return DEFAULT_IDLE_MAX;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_IDLE_MAX;
};

// Secret-free: only the error name and a short code ever reach the log.
const describeError = (error: unknown) => {
  const e = error as { name?: unknown; code?: unknown };
  return {
    name: typeof e?.name === "string" ? e.name : typeof error,
    code:
      typeof e?.code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(e.code)
        ? e.code
        : undefined
  };
};

const sleep = (entry: Entry, ms: number): Promise<void> =>
  new Promise<void>(resolve => {
    const timer = setTimeout(() => finish(), ms);
    timer.unref?.();
    function finish() {
      clearTimeout(timer);

      entry.wake = null;
      resolve();
    }

    entry.wake = finish;
  });

// Polite logout first (it also breaks a running IDLE), hard close if the server
// does not answer in time.
const closeClient = async (client: ImapFlow | null): Promise<void> => {
  if (!client) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.logout(),
      new Promise<void>(resolve => {
        timer = setTimeout(resolve, CLOSE_TIMEOUT_MS);
        timer.unref?.();
      })
    ]);
  } catch {
    /* the hard close below covers it */
  } finally {
    if (timer) clearTimeout(timer);
  }
  try {
    client.close();
  } catch {
    /* already closed */
  }
};

const releaseLease = async (entry: Entry): Promise<void> => {
  if (entry.leaseTimer) {
    clearInterval(entry.leaseTimer);

    entry.leaseTimer = null;
  }
  const { token } = entry;

  entry.token = null;
  if (!token) return;
  try {
    await emailRedis().eval(
      RELEASE_SCRIPT,
      1,
      idleLeaseKey(entry.accountId),
      token
    );
  } catch {
    logger.warn(
      { emailAccountId: entry.accountId },
      "Could not release email idle lease; it expires on its own"
    );
  }
};

const forget = (entry: Entry): void => {
  if (entries.get(entry.accountId) === entry) entries.delete(entry.accountId);
};

// Stops the entry for good: ends its loop, closes the connection, frees the
// lease. `release: false` is for a lease somebody else already owns.
const stopEntry = async (entry: Entry, release = true): Promise<void> => {
  entry.stopped = true;
  forget(entry);
  entry.wake?.();
  if (release) await releaseLease(entry);
  else if (entry.leaseTimer) {
    clearInterval(entry.leaseTimer);

    entry.leaseTimer = null;
  }
  await closeClient(entry.client);
};

const startLeaseRenewal = (entry: Entry): void => {
  const timer = setInterval(() => {
    const { token } = entry;
    if (!token || entry.stopped) return;
    emailRedis()
      .eval(RENEW_SCRIPT, 1, idleLeaseKey(entry.accountId), token, LEASE_TTL_MS)
      .then(renewed => {
        if (Number(renewed) === 1 || entry.stopped) return;
        // Taken over (or expired and taken): another process owns IDLE now.
        logger.warn(
          { emailAccountId: entry.accountId },
          "Email idle lease lost; stopping IDLE here"
        );
        return stopEntry(entry, false);
      })
      .catch(() =>
        logger.warn(
          { emailAccountId: entry.accountId },
          "Could not extend email idle lease"
        )
      );
  }, LEASE_RENEW_MS);
  timer.unref?.();

  entry.leaseTimer = timer;
};

// The loop of one account. Never rejects.
const runEntry = async (entry: Entry): Promise<void> => {
  const { accountId } = entry;
  const jitter = Math.floor(Math.random() * STARTUP_JITTER_MS);
  if (jitter > 0) await sleep(entry, jitter);

  while (!entry.stopped) {
    let client: ImapFlow | null = null;
    let connectedAt = 0;
    try {
      // Fresh row at every (re)connect: current credentials, current status.
      const account = (await EmailAccount.scope("withSecrets").findByPk(
        accountId
      )) as (EmailAccount & AccountRow) | null;
      if (entry.stopped) return;
      if (
        !account ||
        account.provider !== "imap_smtp" ||
        account.status !== "active" ||
        !(await emailEnabledForCompany(account.companyId))
      ) {
        await stopEntry(entry);
        return;
      }

      entry.fingerprint = fingerprintOf(account);

      client = await openImapIdleClient(account, {
        maxIdleTime: MAX_IDLE_TIME_MS
      });

      entry.client = client;
      if (entry.stopped) {
        await closeClient(client);
        return;
      }

      client.on("exists", (event: { count: number; prevCount: number }) => {
        if (!(event?.count > event?.prevCount)) return;
        enqueueAccountSync(accountId).catch(() =>
          logger.warn(
            { emailAccountId: accountId },
            "Could not enqueue email sync from IDLE"
          )
        );
      });

      await client.mailboxOpen("INBOX", { readOnly: true });
      if (!client.capabilities?.has("IDLE")) {
        logger.info(
          { emailAccountId: accountId },
          "Email server has no IDLE capability; polling only"
        );

        entry.state = "no_idle";
        await releaseLease(entry);
        await closeClient(client);
        return;
      }

      connectedAt = Date.now();
      while (!entry.stopped && client.usable) {
        const startedAt = Date.now();
        await client.idle();
        // Never spin if IDLE keeps returning at once.
        if (!entry.stopped && client.usable && Date.now() - startedAt < 1000) {
          await sleep(entry, IDLE_RESTART_GAP_MS);
        }
      }
    } catch (error) {
      if (entry.stopped) return;
      if (error instanceof EmailAuthError) {
        // The sync round marks reauth_required; retrying here would only hammer
        // the provider with a refused credential.
        logger.info(
          { emailAccountId: accountId },
          "Email idle authentication failed; leaving it to polling"
        );

        entry.state = "auth_failed";
        await releaseLease(entry);
        await closeClient(client);
        return;
      }
      logger.warn(
        { emailAccountId: accountId, ...describeError(error) },
        "Email idle connection error"
      );
    }

    entry.client = null;
    await closeClient(client);
    if (entry.stopped) return;

    if (connectedAt && Date.now() - connectedAt >= STABLE_MS) {
      entry.attempts = 0;
    }
    const delay = Math.min(
      BACKOFF_MIN_MS * 2 ** Math.min(entry.attempts, 16),
      BACKOFF_MAX_MS
    );

    entry.attempts += 1;
    await sleep(entry, delay);
  }
};

// Starts IDLE for an account when this process can hold its lease. Returns
// false when Redis said no (someone else owns it).
const startEntry = async (account: AccountRow): Promise<boolean> => {
  const token = randomBytes(16).toString("hex");
  const taken = await emailRedis().set(
    idleLeaseKey(account.id),
    token,
    "PX",
    LEASE_TTL_MS,
    "NX"
  );
  if (taken !== "OK") return false;

  const entry: Entry = {
    accountId: account.id,
    fingerprint: fingerprintOf(account),
    state: "running",
    stopped: false,
    token,
    leaseTimer: null,
    client: null,
    wake: null,
    attempts: 0,
    done: Promise.resolve()
  };
  entries.set(account.id, entry);
  startLeaseRenewal(entry);
  entry.done = runEntry(entry).catch(error => {
    logger.error(
      { emailAccountId: account.id, ...describeError(error) },
      "Email idle loop crashed"
    );
    return stopEntry(entry);
  });
  return true;
};

const runningCount = (): number => {
  let count = 0;
  entries.forEach(entry => {
    if (entry.state === "running") count += 1;
  });
  return count;
};

const doRefresh = async (): Promise<void> => {
  const rows = (await EmailAccount.scope("withSecrets").findAll({
    attributes: [
      "id",
      "companyId",
      "address",
      "imapHost",
      "imapPort",
      "imapSecure",
      "credentials"
    ],
    where: {
      [Op.and]: [
        { provider: "imap_smtp" },
        { status: "active" },
        runtimeCompanyWhere()
      ]
    },
    order: [["id", "ASC"]]
  })) as unknown as AccountRow[];

  const enabled = new Map<number, boolean>();
  const eligible: AccountRow[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const row of rows) {
    if (!enabled.has(row.companyId)) {
      enabled.set(row.companyId, await emailEnabledForCompany(row.companyId));
    }
    if (enabled.get(row.companyId)) eligible.push(row);
  }

  const eligibleById = new Map(eligible.map(row => [row.id, row]));

  // Stop what left or changed first, so its slot is free for the loop below.
  await Promise.all(
    [...entries.values()].map(async entry => {
      const row = eligibleById.get(entry.accountId);
      if (!row || fingerprintOf(row) !== entry.fingerprint) {
        await stopEntry(entry);
      }
    })
  );

  const max = idleMax();
  // eslint-disable-next-line no-restricted-syntax
  for (const row of eligible) {
    if (!started) return;
    if (!entries.has(row.id)) {
      if (runningCount() >= max) return;

      await startEntry(row);
    }
  }
};

// Reconciles the running IDLE connections with the eligible accounts. Called
// from every Task 11 tick (and from its own timer, since only one process
// takes each tick). Never rejects; overlapping calls share one run. Does
// nothing until start() (EMAIL_IMAP_IDLE=false never starts it).
const refresh = (): Promise<void> => {
  if (!started) return Promise.resolve();
  if (!refreshing) {
    refreshing = doRefresh()
      .catch(error =>
        logger.warn(describeError(error), "Email idle refresh failed")
      )
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

const start = async (): Promise<void> => {
  if (started) return;
  started = true;
  refreshTimer = setInterval(() => {
    refresh();
  }, REFRESH_INTERVAL_MS);
  refreshTimer.unref?.();
  await refresh();
};

// Closes every connection and releases every lease. Bounded so it fits the
// graceful shutdown budget even if a server does not answer the logout.
const stop = async (): Promise<void> => {
  started = false;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (refreshing) await refreshing;

  const all = [...entries.values()];
  let timer: NodeJS.Timeout | undefined;
  const everything = Promise.all(
    all.map(async entry => {
      await stopEntry(entry);
      await entry.done;
    })
  );
  try {
    await Promise.race([
      everything,
      new Promise<void>(resolve => {
        timer = setTimeout(resolve, STOP_TIMEOUT_MS);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  entries.clear();
};

const ImapIdleManager = { start, refresh, stop };

export default ImapIdleManager;
