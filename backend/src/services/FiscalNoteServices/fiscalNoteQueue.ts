import Queue from "bull";
import { runtimeQueueOptions } from "../../helpers/tenantRuntime";
import FiscalNote from "../../models/FiscalNote";

export const EMISSION_ATTEMPTS = 6;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

// 3 s, 9 s, 27 s… (limite de 10 min), ou o Retry-After informado no 429.
export const notaasBackoff = (
  attemptsMade: number,
  err?: Error & { retryAfterMs?: number }
): number => {
  if (err?.retryAfterMs !== undefined) {
    return Math.min(Math.max(err.retryAfterMs, 1000), MAX_BACKOFF_MS);
  }
  return Math.min(3000 * 3 ** Math.max(0, attemptsMade - 1), MAX_BACKOFF_MS);
};

let queue: Queue.Queue | null = null;

// Criada sob demanda: importar o serviço (ex.: no gatilho de pagamento) não
// abre conexão com o Redis.
export const fiscalNoteQueue = (): Queue.Queue => {
  if (!queue) {
    queue = new Queue("FiscalNotes", process.env.REDIS_URI || "", {
      ...runtimeQueueOptions(),
      settings: { backoffStrategies: { notaas: notaasBackoff } }
    });
  }
  return queue;
};

// A chave do job inclui a tentativa de emissão: a mesma tentativa nunca é
// enfileirada duas vezes, e uma nova tentativa (após erro) ganha job próprio.
export const emissionJobId = (
  note: Pick<FiscalNote, "id" | "emissionAttempt">
) => `fiscal-note-${note.id}-${note.emissionAttempt}`;

export const enqueueFiscalNoteEmission = async (
  note: Pick<FiscalNote, "id" | "emissionAttempt">
): Promise<void> => {
  const q = fiscalNoteQueue();
  const jobId = emissionJobId(note);
  const existing = await q.getJob(jobId);
  if (existing) {
    if (!(await existing.isFailed()) && !(await existing.isCompleted())) return;
    await existing.remove();
  }
  await q.add(
    "Emit",
    { noteId: note.id },
    {
      jobId,
      attempts: EMISSION_ATTEMPTS,
      backoff: { type: "notaas" },
      removeOnComplete: true,
      removeOnFail: 200
    }
  );
};
