import { createHash } from "crypto";
import { QueryTypes, Transaction } from "sequelize";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import {
  assertRuntimeCompany,
  runtimeOwnsCompany
} from "../../helpers/tenantRuntime";
import { logger } from "../../utils/logger";
import { assertSgaTenant, loadSga, sgaEnabled } from "../SgaServices/service";
import { sgaRequest } from "../SgaServices/client";
import { Bill, digits, normalizedText } from "../SgaServices/normalize";
import {
  BillingConfig,
  defaults,
  parseConfig,
  localDay,
  stageFor,
  inWindow,
  freshSnapshot,
  renderReminder,
  revalidateBill
} from "./policy";
import {
  boletoUrl,
  fetchBoletoPdf,
  sendBillingMessage,
  testPdf
} from "./transport";

type Delivery = {
  id: string;
  status: string;
  dedupeKey: string;
  stage: number;
  reason: string;
  mode: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  messageId: string;
};
const query = <T extends object>(
  sql: string,
  replacements: Record<string, unknown>,
  transaction?: Transaction
) =>
  sequelize.query<T>(sql, {
    replacements,
    type: QueryTypes.SELECT,
    transaction
  });
export const liveAllowed = () =>
  process.env.ACNORTE_BILLING_SEND_ENABLED === "true";
export const testNumber = () =>
  /^55\d{10,11}$/.test(process.env.ACNORTE_BILLING_TEST_NUMBER || "")
    ? process.env.ACNORTE_BILLING_TEST_NUMBER
    : null;
const guard = async (companyId: number) => {
  assertRuntimeCompany(companyId);
  await assertSgaTenant(companyId);
};
export const getBillingConfig = async (
  companyId: number
): Promise<BillingConfig> => {
  const [row] = await query<{ config: BillingConfig }>(
    'SELECT config FROM "SgaBillingConfigs" WHERE "companyId"=:companyId',
    { companyId }
  );
  return row ? parseConfig(row.config) : defaults();
};
const lock = async (companyId: number, transaction: Transaction) => {
  const [row] = await query<{ locked: boolean }>(
    "SELECT pg_try_advisory_xact_lock(73422,:companyId) AS locked",
    { companyId },
    transaction
  );
  return row.locked;
};
const sender = async (companyId: number, id: number | null) => {
  const whatsapp = id
    ? await Whatsapp.findOne({
        where: { id, companyId },
        attributes: ["id", "name", "companyId", "status"]
      })
    : null;
  if (!whatsapp || whatsapp.status !== "CONNECTED")
    throw new AppError("ERR_BILLING_CONNECTION", 409);
  return whatsapp;
};
export const saveBillingConfig = async (
  companyId: number,
  userId: number,
  input: unknown
) => {
  await guard(companyId);
  const config = parseConfig(input);
  if (config.enabled && !liveAllowed())
    throw new AppError("ERR_BILLING_SEND_DISABLED", 409);
  if (config.enabled) await sender(companyId, config.whatsappId);
  if (
    config.whatsappId &&
    !(await Whatsapp.findOne({
      where: { id: config.whatsappId, companyId },
      attributes: ["id"]
    }))
  )
    throw new AppError("ERR_BILLING_CONNECTION", 400);
  await sequelize.transaction(async transaction => {
    if (!(await lock(companyId, transaction)))
      throw new AppError("ERR_BILLING_BUSY", 409);
    const replacements = { companyId, userId, config: JSON.stringify(config) };
    await sequelize.query(
      'INSERT INTO "SgaBillingConfigs" ("companyId",config,"updatedBy") VALUES (:companyId,CAST(:config AS jsonb),:userId) ON CONFLICT ("companyId") DO UPDATE SET config=EXCLUDED.config,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()',
      { replacements, transaction }
    );
    await sequelize.query(
      'INSERT INTO "SgaBillingConfigAudits" ("companyId","userId",config) VALUES (:companyId,:userId,CAST(:config AS jsonb))',
      { replacements, transaction }
    );
  });
  return config;
};
const keyOf = (bill: Bill, offset: number) => `live:${bill.id}:${offset}`;
const candidates = async (
  companyId: number,
  day: string,
  config: BillingConfig
) => {
  const data = await loadSga(companyId);
  const members = new Map(data.members.map(m => [m.id, m]));
  const rows = data.stored.data.bills.flatMap(bill => {
    const offset = stageFor(bill, day);
    const step = config.steps.find(s => s.enabled && s.offset === offset);
    if (!step) return [];
    const member = members.get(bill.memberId);
    const contact = member?.contact;
    const reason = !contact
      ? "UNLINKED"
      : config.excludedContactIds.includes(contact.id)
        ? "OPTED_OUT"
        : !/^55\d{10,11}$/.test(digits(contact.number))
          ? "INVALID_NUMBER"
          : null;
    return [{ bill, step, member, contact, reason, key: keyOf(bill, offset) }];
  });
  return { data, rows };
};
export const billingOverview = async (companyId: number, day = localDay()) => {
  await guard(companyId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)))
    throw new AppError("ERR_BILLING_CONFIG", 400);
  const config = await getBillingConfig(companyId);
  const { data, rows } = await candidates(companyId, day, config);
  const delivered = await query<Delivery>(
    'SELECT "dedupeKey",status FROM "SgaBillingDeliveries" WHERE "companyId"=:companyId AND mode=\'live\'',
    { companyId }
  );
  const states = new Map(delivered.map(d => [d.dedupeKey, d.status]));
  const preview = rows.map(({ bill, step, member, contact, reason, key }) => ({
    billId: bill.id,
    number: bill.number,
    member: member?.name || "",
    contactId: contact?.id || null,
    contact: contact?.name || "",
    due: bill.due,
    amount: bill.amount,
    stage: step.offset,
    attachPdf: step.attachPdf,
    reason: reason || states.get(key) || null
  }));
  return {
    config,
    day,
    liveAllowed: liveAllowed(),
    testNumber: testNumber(),
    fresh: freshSnapshot(data.stored),
    syncedAt: data.stored.syncedAt,
    connections: await Whatsapp.findAll({
      where: { companyId },
      attributes: ["id", "name", "status"]
    }),
    counts: {
      total: preview.length,
      eligible: preview.filter(r => !r.reason).length,
      blocked: preview.filter(r => r.reason).length
    },
    preview: preview.slice(0, 100),
    history: await query<Delivery>(
      'SELECT id,"billNumber","stage",status,mode,reason,"messageId","createdAt","updatedAt" FROM "SgaBillingDeliveries" WHERE "companyId"=:companyId ORDER BY id DESC LIMIT 100',
      { companyId }
    )
  };
};
const update = async (
  companyId: number,
  id: string,
  status: string,
  reason: string | null = null,
  messageId: string | null = null,
  body: string | null = null
) => {
  await sequelize.query(
    'UPDATE "SgaBillingDeliveries" SET status=:status,reason=:reason,"messageId"=COALESCE(:messageId,"messageId"),body=COALESCE(:body,body),"updatedAt"=NOW() WHERE id=:id AND "companyId"=:companyId',
    { replacements: { companyId, id, status, reason, messageId, body } }
  );
};
const safeReason = (error: unknown) =>
  error instanceof AppError && /^ERR_(SGA|BILLING)_/.test(error.message)
    ? error.message
    : "ERR_BILLING_FAILED";

// A transaction-scoped tenant mutex serializes workers and configuration changes.
// Delivery transitions deliberately commit on separate connections BEFORE network
// I/O: a crash/unknown transport result can never silently resend that boleto.
export const processBilling = async (
  companyId: number,
  now = new Date()
): Promise<void> => {
  if (
    !liveAllowed() ||
    !runtimeOwnsCompany(companyId) ||
    !(await sgaEnabled(companyId))
  )
    return;
  await sequelize.transaction(async transaction => {
    if (!(await lock(companyId, transaction))) return;
    await sequelize.query(
      "UPDATE \"SgaBillingDeliveries\" SET status=CASE WHEN status='SENDING' THEN 'UNCERTAIN' ELSE 'FAILED' END, reason='INTERRUPTED',\"updatedAt\"=NOW() WHERE \"companyId\"=:companyId AND status IN ('PREPARING','SENDING')",
      { replacements: { companyId } }
    );
    const config = await getBillingConfig(companyId);
    if (!inWindow(config, now)) return;
    const whatsapp = await sender(companyId, config.whatsappId);
    const day = localDay(now);
    const { data, rows } = await candidates(companyId, day, config);
    if (!freshSnapshot(data.stored, now)) return;
    const [{ count }] = await query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM \"SgaBillingDeliveries\" WHERE \"companyId\"=:companyId AND \"localDay\"=:day AND mode='live' AND status IN ('SENT','UNCERTAIN','SENDING')",
      { companyId, day }
    );
    if (Number(count) >= config.dailyLimit) return;
    const previous = await query<Delivery>(
      'SELECT "dedupeKey",status FROM "SgaBillingDeliveries" WHERE "companyId"=:companyId AND mode=\'live\'',
      { companyId }
    );
    const seen = new Set(previous.map(d => d.dedupeKey));
    const candidate = rows.find(r => !r.reason && !seen.has(r.key));
    if (!candidate) return;
    const { bill, step, member, contact, key } = candidate;
    const [delivery] = await query<{ id: string }>(
      'INSERT INTO "SgaBillingDeliveries" ("companyId","billId","memberId","billNumber","dueDate",stage,"localDay","contactId","whatsappId",status,mode,"dedupeKey") VALUES (:companyId,:billId,:memberId,:number,:due,:stage,:day,:contactId,:whatsappId,\'PREPARING\',\'live\',:key) ON CONFLICT ("companyId","dedupeKey") DO NOTHING RETURNING id',
      {
        companyId,
        billId: bill.id,
        memberId: bill.memberId,
        number: bill.number,
        due: bill.due,
        stage: step.offset,
        day,
        contactId: contact.id,
        whatsappId: whatsapp.id,
        key
      }
    );
    if (!delivery) return;
    let sending = false;
    try {
      const result = await sgaRequest(
        `buscar/boleto/${encodeURIComponent(bill.number)}`
      );
      const row =
        Array.isArray(result) && result.length === 1
          ? result[0]
          : !Array.isArray(result)
            ? result
            : null;
      const fresh =
        row && revalidateBill(bill, row, data.stored.data.billStatuses, day);
      if (!fresh) {
        await update(companyId, delivery.id, "SKIPPED", "NO_LONGER_ELIGIBLE");
        return;
      }
      // Never claim inactivation when the current SGA record says otherwise.
      if (
        step.offset === 30 &&
        !/inativ|cancelad/.test(
          normalizedText(row.descricao_situacao_associado)
        )
      ) {
        await update(
          companyId,
          delivery.id,
          "SKIPPED",
          "CONTRACT_NOT_INACTIVE"
        );
        return;
      }
      const url = boletoUrl(row.link_boleto);
      const pdf = step.attachPdf ? await fetchBoletoPdf(url) : undefined;
      const current = await Contact.findOne({
        where: { id: contact.id, companyId, isGroup: false },
        attributes: ["id", "number", "channel"]
      });
      const currentLinks = await loadSga(companyId);
      const stillLinked =
        currentLinks.members.find(m => m.id === bill.memberId)?.contact?.id ===
        contact.id;
      if (
        !current ||
        current.channel !== "whatsapp" ||
        digits(current.number) !== digits(contact.number) ||
        !stillLinked
      ) {
        await update(companyId, delivery.id, "SKIPPED", "CONTACT_CHANGED");
        return;
      }
      if (!liveAllowed() || !inWindow(config) || localDay() !== day) {
        await update(companyId, delivery.id, "SKIPPED", "OUTSIDE_WINDOW");
        return;
      }
      // Fetch once more after downloading the document / resolving the contact:
      // a payment or cancellation during preparation must cancel the dispatch.
      const lastResult = await sgaRequest(
        `buscar/boleto/${encodeURIComponent(bill.number)}`
      );
      const lastRow = Array.isArray(lastResult)
        ? lastResult.length === 1
          ? lastResult[0]
          : null
        : lastResult;
      const lastBill =
        lastRow &&
        revalidateBill(
          bill,
          lastRow,
          currentLinks.stored.data.billStatuses,
          localDay()
        );
      if (
        !lastBill ||
        !freshSnapshot(currentLinks.stored) ||
        lastBill.amount !== fresh.amount ||
        boletoUrl(lastRow.link_boleto) !== url
      ) {
        await update(companyId, delivery.id, "SKIPPED", "NO_LONGER_ELIGIBLE");
        return;
      }
      const body = renderReminder(step, member.name, lastBill, url);
      await sender(companyId, whatsapp.id);
      await update(companyId, delivery.id, "SENDING", null, null, body);
      sending = true;
      const messageId = await sendBillingMessage(
        whatsapp,
        digits(current.number),
        body,
        pdf
      );
      await update(companyId, delivery.id, "SENT", null, messageId);
    } catch (error) {
      await update(
        companyId,
        delivery.id,
        sending ? "UNCERTAIN" : "FAILED",
        safeReason(error)
      );
    }
  });
};

export const previewReminder = async (companyId: number, offset: number) => {
  await guard(companyId);
  const config = await getBillingConfig(companyId);
  const step = config.steps.find(s => s.offset === offset);
  if (!step) throw new AppError("ERR_BILLING_CONFIG", 400);
  const body = renderReminder(
    step,
    "Guilherme Santos",
    { due: localDay(), amount: 123.45 },
    "https://acnorte.dev.espacowhats.com.br/sga/cobrancas"
  );
  return {
    stage: offset,
    body: `[TESTE — SEM COBRANÇA REAL]\n\n${body}`,
    attachPdf: step.attachPdf,
    filename: step.attachPdf ? "boleto-teste-sem-valor.pdf" : null,
    testNumber: testNumber()
  };
};
export const runBillingTest = async (
  companyId: number,
  userId: number,
  offset: number,
  mode: "simulation" | "test",
  requestId: string
) => {
  await guard(companyId);
  if (
    !["simulation", "test"].includes(mode) ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)
  )
    throw new AppError("ERR_BILLING_CONFIG", 400);
  const preview = await previewReminder(companyId, offset);
  const config = await getBillingConfig(companyId);
  return sequelize.transaction(async transaction => {
    if (!(await lock(companyId, transaction)))
      throw new AppError("ERR_BILLING_BUSY", 409);
    const key = `${mode}:${userId}:${requestId}`;
    const [existing] = await query<Delivery>(
      'SELECT * FROM "SgaBillingDeliveries" WHERE "companyId"=:companyId AND "dedupeKey"=:key',
      { companyId, key }
    );
    if (existing)
      return {
        status: existing.status,
        messageId: existing.messageId,
        ...preview
      };
    const number = testNumber();
    if (mode === "test" && !number)
      throw new AppError("ERR_BILLING_TEST_NUMBER", 409);
    const whatsapp =
      mode === "test" ? await sender(companyId, config.whatsappId) : null;
    const [{ count }] = await query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM "SgaBillingDeliveries" WHERE "companyId"=:companyId AND mode=:mode AND "createdAt">NOW()-INTERVAL \'1 minute\'',
      { companyId, mode }
    );
    if (Number(count) >= 2) throw new AppError("ERR_BILLING_BUSY", 429);
    const [delivery] = await query<{ id: string }>(
      'INSERT INTO "SgaBillingDeliveries" ("companyId","billId","memberId","billNumber","dueDate",stage,"localDay",status,mode,"dedupeKey",body,"whatsappId") VALUES (:companyId,\'TEST\',\'TEST\',\'TEST\',:day,:stage,:day,:status,:mode,:key,:body,:whatsappId) RETURNING id',
      {
        companyId,
        day: localDay(),
        stage: offset,
        status: mode === "test" ? "SENDING" : "SIMULATED",
        mode,
        key,
        body: preview.body,
        whatsappId: whatsapp?.id || null
      }
    );
    const pdf = preview.attachPdf ? testPdf() : undefined;
    if (mode === "simulation")
      return {
        ...preview,
        status: "SIMULATED",
        pdfBytes: pdf?.length || 0,
        pdfSha256: pdf
          ? createHash("sha256").update(Uint8Array.from(pdf)).digest("hex")
          : null
      };
    try {
      const messageId = await sendBillingMessage(
        whatsapp,
        number,
        preview.body,
        pdf
      );
      await update(companyId, delivery.id, "SENT", null, messageId);
      return { ...preview, status: "SENT", messageId };
    } catch (error) {
      await update(companyId, delivery.id, "UNCERTAIN", safeReason(error));
      throw new AppError("ERR_BILLING_UNCERTAIN", 502);
    }
  });
};
export const startSgaBilling = (): void => {
  const companyId = Number(process.env.ACNORTE_SGA_COMPANY_ID || 9);
  if (!liveAllowed() || !runtimeOwnsCompany(companyId)) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processBilling(companyId);
    } catch {
      logger.warn("SGA billing cycle failed; delivery ledger preserved");
    } finally {
      running = false;
    }
  };
  setTimeout(run, 60000).unref();
  setInterval(run, 60000).unref();
};
