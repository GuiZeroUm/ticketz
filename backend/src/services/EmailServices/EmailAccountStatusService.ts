import { Op } from "sequelize";
import { getIO } from "../../libs/socket";
import serializeEmailAccount from "../../helpers/SerializeEmailAccount";
import EmailAccount from "../../models/EmailAccount";
import { logger } from "../../utils/logger";
import { EmailAuthError, EmailTransientError } from "./adapters/errors";

export const ERROR_THRESHOLD = 3;
export const AUTH_ERROR_CODE = "ERR_EMAIL_AUTH";
export const SYNC_ERROR_CODE = "ERR_EMAIL_SYNC_FAILED";

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

export const emitEmailAccount = (account: EmailAccount): void => {
  try {
    getIO()
      .to(`company-${account.companyId}-admin`)
      .emit(`company-${account.companyId}-emailAccount`, {
        action: "update",
        account: serializeEmailAccount(account)
      });
  } catch {
    logger.warn(
      { companyId: account.companyId, emailAccountId: account.id },
      "Could not emit email account update"
    );
  }
};

// Returns false when the account left the syncable states meanwhile.
const applyChanges = async (
  account: EmailAccount,
  changes: AccountChanges
): Promise<boolean> => {
  const [affected] = await EmailAccount.update(changes, {
    where: { id: account.id, status: { [Op.in]: [...SYNCABLE_STATUSES] } }
  });
  if (!affected) return false;
  account.set({ ...changes, updatedAt: new Date() });
  return true;
};

export const markAccountError = async (
  account: EmailAccount,
  err: unknown
): Promise<void> => {
  const at = new Date().toISOString();
  let changes: AccountChanges;
  if (err instanceof EmailAuthError) {
    changes = {
      status: "reauth_required",
      lastError: { code: AUTH_ERROR_CODE, at }
    };
  } else {
    const errorCount = (account.errorCount || 0) + 1;
    changes = {
      errorCount,
      lastError: { code: errorCodeOf(err), at },
      ...(errorCount >= ERROR_THRESHOLD ? { status: "error" as const } : {})
    };
  }
  if (await applyChanges(account, changes)) {
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
};

// Success after the cursor moved: clears the failure state. Emits only when
// something the UI shows changed (status/lastError), not on every routine round.
export const markAccountActive = async (
  account: EmailAccount,
  extra: Pick<AccountChanges, "syncCursor" | "lastSyncAt"> = {}
): Promise<void> => {
  const changed = account.status !== "active" || Boolean(account.lastError);
  const applied = await applyChanges(account, {
    ...extra,
    status: "active",
    errorCount: 0,
    lastError: null
  });
  if (applied && changed) emitEmailAccount(account);
};
