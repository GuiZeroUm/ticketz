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
//    unexpected ingest error fails the whole round and it is retried.
// Errors are recorded on the account (never thrown), so the queue job completes.
const SyncEmailAccountService = async (
  accountId: number
): Promise<SyncResult> => {
  const locked = await withAccountLock(accountId, async () => {
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
      // eslint-disable-next-line no-restricted-syntax
      for (const email of emails) {
        const result = await IngestEmailService(account, email);
        if (result.status === "created" || result.status === "reconciled") {
          ingested += 1;
        }
      }

      await markAccountActive(account, {
        syncCursor: cursor,
        lastSyncAt: new Date()
      });
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
