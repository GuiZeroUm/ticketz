import { isDedicatedRuntime } from "../helpers/tenantRuntime";
import {
  EMISSION_ATTEMPTS,
  fiscalNoteQueue
} from "../services/FiscalNoteServices/fiscalNoteQueue";
import {
  processFiscalNoteEmission,
  reconcileFiscalNotes
} from "../services/FiscalNoteServices/FiscalNoteService";
import { notaasConfig } from "../services/FiscalNoteServices/NotaasClient";
import { logger } from "../utils/logger";

// Emissão e reconciliação só no runtime principal: runtimes dedicados que
// compartilham o banco apenas exibem e baixam as notas.
export const startFiscalNoteQueue = async (): Promise<void> => {
  if (isDedicatedRuntime()) return;
  const queue = fiscalNoteQueue();

  queue.process("Emit", 1, async job =>
    processFiscalNoteEmission(job.data.noteId, {
      finalAttempt:
        job.attemptsMade + 1 >= (job.opts.attempts || EMISSION_ATTEMPTS)
    })
  );
  queue.process("Reconcile", 1, async () => reconcileFiscalNotes());

  if (!notaasConfig().enabled) {
    logger.info("[fiscalNote] emissão de NFS-e desligada (NOTAAS_ENABLED)");
    return;
  }
  await queue.add(
    "Reconcile",
    {},
    { repeat: { cron: "*/5 * * * *" }, removeOnComplete: true }
  );
};
