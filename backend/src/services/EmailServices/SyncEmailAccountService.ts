import { runtimeOwnsCompany } from "../../helpers/tenantRuntime";
import EmailAccount from "../../models/EmailAccount";
import { logger } from "../../utils/logger";
import { withAccountLock } from "./accountLock";
import { getAdapter } from "./adapters";
import { emailEnabledForCompany } from "./EmailAccessService";
import {
  SYNCABLE_STATUSES,
  markAccountActive,
  markAccountError
} from "./EmailAccountStatusService";
import IngestEmailService from "./IngestEmailService";
import {
  MAX_INGEST_FAILURES,
  clearIngestFailure,
  isInfrastructureError,
  recordIngestFailure
} from "./ingestFailures";

export interface SyncResult {
  ingested: number;
  hasMore: boolean;
}

const SKIPPED: SyncResult = { ingested: 0, hasMore: false };

// One sync round of one account. Guarantees:
//  - nothing happens (cursor and status untouched) when the account is gone,
//    not syncable, owned by another runtime, or its company has the channel off;
//  - at most one round per account runs at a time across processes (Redis lock
//    here + deterministic Bull jobId in the queue), so ingestion's thread lookup
//    never races with another round of the same account;
//  - emails are ingested in order and the cursor is saved only after all of them
//    were ingested or deliberately ignored (at-least-once; ingestion is
//    idempotent). The adapter returns a single cursor per round, so an
//    unexpected ingest error fails the whole round and it is retried, with a
//    bounded skip (R22): the same email failing MAX_INGEST_FAILURES times is
//    skipped (account.lastError = ERR_EMAIL_MESSAGE_SKIPPED) so a poison message
//    cannot block the mailbox. Infrastructure errors (database/Redis down,
//    timeouts) always stop the round and are never counted;
//  - the cursor is not written when the lock was lost during the round, nor when
//    the account was reconnected/edited meanwhile (updatedAt guard, see
//    EmailAccountStatusService).
// Errors are recorded on the account (never thrown), so the queue job completes.
const SyncEmailAccountService = async (
  accountId: number
): Promise<SyncResult> => {
  const locked = await withAccountLock(accountId, async lock => {
    // withSecrets: the adapter needs credentials and the current cursor.
    const account = await EmailAccount.scope("withSecrets").findByPk(accountId);
    if (
      !account ||
      !(SYNCABLE_STATUSES as readonly string[]).includes(account.status) ||
      !runtimeOwnsCompany(account.companyId) ||
      !(await emailEnabledForCompany(account.companyId))
    ) {
      return SKIPPED;
    }

    try {
      const { emails, cursor, hasMore } = await getAdapter(
        account.provider
      ).fetchChanges(account);

      let ingested = 0;
      let skippedMessage = false;
      // eslint-disable-next-line no-restricted-syntax
      for (const email of emails) {
        try {
          const result = await IngestEmailService(account, email);
          if (result.status === "created" || result.status === "reconciled") {
            ingested += 1;
          }
        } catch (err) {
          if (isInfrastructureError(err)) throw err;

          const failures = await recordIngestFailure(
            account.id,
            email.providerMessageId
          );
          if (failures < MAX_INGEST_FAILURES) throw err;
          logger.warn(
            {
              emailAccountId: account.id,
              providerMessageId: email.providerMessageId,
              errorName: (err as Error)?.name
            },
            "Email skipped after repeated ingest failures"
          );
          skippedMessage = true;

          continue;
        }
        // Best effort: a leftover counter only expires on its own.

        await clearIngestFailure(account.id, email.providerMessageId).catch(
          () => undefined
        );
      }

      // Re-verify the lock right before the irreversible write: if it expired
      // (stalled process, Redis hiccup) another round may be running.
      if (lock.isLost() || !(await lock.stillHeld())) {
        logger.warn(
          { emailAccountId: account.id },
          "Email sync lock lost during the round; cursor not saved"
        );
        return { ingested, hasMore: false };
      }

      const saved = await markAccountActive(
        account,
        { syncCursor: cursor, lastSyncAt: new Date() },
        skippedMessage
      );
      if (!saved) {
        logger.info(
          { emailAccountId: account.id },
          "Email account changed during the round; cursor not saved"
        );
        return { ingested, hasMore: false };
      }
      return { ingested, hasMore };
    } catch (err) {
      await markAccountError(account, err);
      return SKIPPED;
    }
  });

  if (!locked.acquired) {
    logger.info(
      { emailAccountId: accountId },
      "Email sync skipped: another round holds the account"
    );
    return SKIPPED;
  }
  return locked.result;
};

export default SyncEmailAccountService;
