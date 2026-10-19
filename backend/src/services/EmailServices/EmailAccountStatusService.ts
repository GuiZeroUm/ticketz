import { Op } from "sequelize";
import { getIO } from "../../libs/socket";
import serializeEmailAccount from "../../helpers/SerializeEmailAccount";
import EmailAccount from "../../models/EmailAccount";
import { logger } from "../../utils/logger";
import { EmailAuthError, EmailTransientError } from "./adapters/errors";
import { ENCRYPTION_NOT_CONFIGURED } from "./encryption";

export const ERROR_THRESHOLD = 3;
export const AUTH_ERROR_CODE = "ERR_EMAIL_AUTH";
export const SYNC_ERROR_CODE = "ERR_EMAIL_SYNC_FAILED";
export const MESSAGE_SKIPPED_CODE = "ERR_EMAIL_MESSAGE_SKIPPED";

// A concurrent disconnect/disable/reauth must never be overwritten by a sync
// round that started before it: status writes only land on syncable accounts.
export const SYNCABLE_STATUSES = ["active", "error"] as const;

type AccountChanges = Partial<
  Pick<
    EmailAccount,
    "status" | "lastError" | "errorCount" | "lastSyncAt" | "syncCursor"
  >
>;

// lastError never carries server text: only our own fixed ERR_EMAIL_* codes.
export const errorCodeOf = (err: unknown): string => {
  if (err instanceof EmailAuthError) return AUTH_ERROR_CODE;
  if (err instanceof EmailTransientError && /^ERR_EMAIL_\w+$/.test(err.message))
    return err.message;
  return SYNC_ERROR_CODE;
};

export const emitEmailAccount = (
  account: EmailAccount,
  action: "create" | "update" | "delete" = "update"
): void => {
  try {
    getIO()
      .to(`company-${account.companyId}-admin`)
      .emit(`company-${account.companyId}-emailAccount`, {
        action,
        account: serializeEmailAccount(account)
      });
  } catch {
    logger.warn(
      { companyId: account.companyId, emailAccountId: account.id },
      "Could not emit email account update"
    );
  }
};

// Every write is conditional on BOTH:
//  - the account still being active/error (a concurrent disable/disconnect/
//    reauth is not overwritten), and
//  - `updatedAt` still equal to the value read when the round started. A
//    reconnect (new credentials, reset cursor) or any other edit bumps
//    updatedAt, so a round that began with the old credentials/cursor can
//    neither write its stale cursor over the new one nor flag the freshly
//    reconnected account with an auth error. The cost is that an unrelated edit
//    mid-round also discards that round's write; ingestion is idempotent, so
//    the next round simply redoes it. (There is no dedicated credentials
//    version column; updatedAt is what the model has. Sequelize writes
//    millisecond-precision timestamps from JS, so equality is exact.)
// `account` must be the instance read at the start of the round, and a single
// write per instance: after it succeeds the instance carries the new
// updatedAt returned by the database.
// Returns false when nothing was written.
const applyChanges = async (
  account: EmailAccount,
  changes: AccountChanges
): Promise<boolean> => {
  const [affected, rows] = (await EmailAccount.update(changes, {
    where: {
      id: account.id,
      status: { [Op.in]: [...SYNCABLE_STATUSES] },
      updatedAt: account.updatedAt
    },
    returning: ["updatedAt"]
  })) as unknown as [number, Pick<EmailAccount, "updatedAt">[]?];
  if (!affected) return false;
  account.set({ ...changes, updatedAt: rows?.[0]?.updatedAt ?? new Date() });
  return true;
};

export const markAccountError = async (
  account: EmailAccount,
  err: unknown
): Promise<boolean> => {
  const at = new Date().toISOString();
  let changes: AccountChanges;
  if (err instanceof EmailAuthError) {
    changes = {
      status: "reauth_required",
      lastError: { code: AUTH_ERROR_CODE, at }
    };
  } else {
    const errorCount = (account.errorCount || 0) + 1;
    const code = errorCodeOf(err);
    // A missing ENCRYPTION_KEY will not fix itself between rounds: show it
    // at once (still syncable, so it recovers once the key is set).
    const failing =
      errorCount >= ERROR_THRESHOLD || code === ENCRYPTION_NOT_CONFIGURED;
    changes = {
      errorCount,
      lastError: { code, at },
      ...(failing ? { status: "error" as const } : {})
    };
  }
  const applied = await applyChanges(account, changes);
  if (applied) {
    // Only the technical class goes to the log, never message or server text.
    logger.warn(
      {
        companyId: account.companyId,
        emailAccountId: account.id,
        code: changes.lastError?.code,
        status: account.status
      },
      "Email account sync failed"
    );
    emitEmailAccount(account);
  }
  return applied;
};

// Success after the cursor moved: clears the failure state. Emits only when
// something the UI shows changed (status/lastError), not on every routine round.
// `skippedMessage`: the round dropped a message that kept failing to ingest
// (R22); the account stays active but lastError carries the fixed code (the
// next clean round clears it).
export const markAccountActive = async (
  account: EmailAccount,
  extra: Pick<AccountChanges, "syncCursor" | "lastSyncAt"> = {},
  skippedMessage = false
): Promise<boolean> => {
  const lastError = skippedMessage
    ? { code: MESSAGE_SKIPPED_CODE, at: new Date().toISOString() }
    : null;
  const changed =
    account.status !== "active" || Boolean(account.lastError) || skippedMessage;
  const applied = await applyChanges(account, {
    ...extra,
    status: "active",
    errorCount: 0,
    lastError
  });
  if (applied && changed) emitEmailAccount(account);
  return applied;
};
