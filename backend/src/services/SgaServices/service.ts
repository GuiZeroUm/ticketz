/* eslint-disable no-restricted-syntax -- Paginated Hinova calls run sequentially to limit upstream load. */
import { QueryTypes, Transaction } from "sequelize";
import sequelize from "../../database";
import Company from "../../models/Company";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";
import { sgaPages, sgaRequest } from "./client";
import { desiredContactFields, reconcileContactFields } from "./contactFields";
import {
  Bill,
  Member,
  Vehicle,
  ContactRecord,
  normalizeBill,
  normalizeMember,
  normalizeVehicle,
  createContactMatcher,
  isOverdue,
  normalizedText,
  text,
  SgaRow
} from "./normalize";

export interface SnapshotData {
  members: Member[];
  vehicles: Vehicle[];
  bills: Bill[];
  billStatuses: SgaRow[];
}
interface Snapshot {
  companyId: number;
  data: SnapshotData;
  syncedAt: Date | null;
  attemptedAt: Date | null;
  status: string;
  error: string | null;
}
const companyIdConfigured = () =>
  Number(process.env.ACNORTE_SGA_COMPANY_ID || 9);
export const sgaEnabled = async (companyId: number): Promise<boolean> => {
  if (
    process.env.ACNORTE_SGA_ENABLED !== "true" ||
    companyId !== companyIdConfigured()
  )
    return false;
  const company = await Company.findByPk(companyId, { attributes: ["slug"] });
  return company?.slug === "acnorte";
};
export const assertSgaTenant = async (companyId: number): Promise<void> => {
  if (!(await sgaEnabled(companyId)))
    throw new AppError("ERR_SGA_DISABLED", 404);
};
export const snapshot = async (
  companyId: number,
  transaction?: Transaction
): Promise<Snapshot | undefined> => {
  const rows = await sequelize.query<Snapshot>(
    'SELECT * FROM "SgaSnapshots" WHERE "companyId" = :companyId',
    { replacements: { companyId }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0];
};
export const syncSga = async (companyId: number): Promise<void> => {
  await assertSgaTenant(companyId);
  await sequelize.transaction(async transaction => {
    const [lock] = await sequelize.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(73421, :companyId) AS locked",
      { replacements: { companyId }, transaction, type: QueryTypes.SELECT }
    );
    if (!lock.locked) return;
    await sequelize.query(
      'INSERT INTO "SgaSnapshots" ("companyId", data, status, "attemptedAt") VALUES (:companyId, \'{}\', \'syncing\', NOW()) ON CONFLICT ("companyId") DO UPDATE SET status = \'syncing\', error = NULL, "attemptedAt" = NOW()',
      { replacements: { companyId } }
    );
    try {
      const statuses = await sgaRequest("listar/situacao/todos");
      const billStatuses = await sgaRequest("listar/situacao-boleto/todos");
      if (
        !Array.isArray(statuses) ||
        !statuses.length ||
        !Array.isArray(billStatuses) ||
        !billStatuses.length
      )
        throw new AppError("ERR_SGA_RESPONSE_INVALID", 502);
      const members = new Map<string, Member>();
      const vehicles = new Map<string, Vehicle>();
      const bills = new Map<string, Bill>();
      for (const status of statuses) {
        const params = { codigo_situacao: text(status.codigo_situacao) };
        for (const row of await sgaPages(
          "listar/associado/",
          params,
          "associados"
        )) {
          const member = normalizeMember(row, text(status.descricao_situacao));
          if (!member.id) throw new AppError("ERR_SGA_RESPONSE_INVALID", 502);
          members.set(member.id, member);
        }
        for (const row of await sgaPages(
          "listar/veiculo",
          params,
          "veiculos"
        )) {
          const vehicle = normalizeVehicle(
            row,
            text(status.descricao_situacao)
          );
          if (!vehicle.id || !vehicle.memberId)
            throw new AppError("ERR_SGA_RESPONSE_INVALID", 502);
          vehicles.set(vehicle.id, vehicle);
          if (!members.has(vehicle.memberId))
            members.set(vehicle.memberId, normalizeMember(row, ""));
        }
      }
      // Fetch every unpaid status considered debt by this association, without a
      // date window: older overdue installments must not disappear from totals.
      const debtStatuses = billStatuses.filter(s =>
        ["Y", "S", "SIM"].includes(
          text(s.considerado_inadimplencia).toUpperCase()
        )
      );
      if (!debtStatuses.length)
        throw new AppError("ERR_SGA_RESPONSE_INVALID", 502);
      for (const status of debtStatuses) {
        for (const row of await sgaPages(
          "listar/boleto",
          {
            codigo_situacao: text(status.codigo_situacaoboleto)
          },
          undefined,
          "page"
        )) {
          const bill = normalizeBill(row, true);
          if (!bill.id || !bill.memberId)
            throw new AppError("ERR_SGA_RESPONSE_INVALID", 502);
          bills.set(bill.id, bill);
        }
      }
      const data: SnapshotData = {
        members: [...members.values()],
        vehicles: [...vehicles.values()],
        bills: [...bills.values()],
        billStatuses
      };
      // Savepoint rolls back BOTH the snapshot and contact fields if publication fails.
      await sequelize.transaction({ transaction }, async publication => {
        await sequelize.query(
          'UPDATE "SgaSnapshots" SET data = CAST(:data AS jsonb), "syncedAt" = clock_timestamp(), status = \'ready\', error = NULL WHERE "companyId" = :companyId',
          {
            replacements: { companyId, data: JSON.stringify(data) },
            transaction: publication
          }
        );
        const linked = await loadSga(companyId, publication);
        await reconcileContactFields(
          companyId,
          desiredContactFields(linked.members, linked.vehicles),
          publication
        );
      });
      logger.info(
        {
          companyId,
          members: members.size,
          vehicles: vehicles.size,
          bills: bills.size
        },
        "SGA synchronization completed"
      );
    } catch (error) {
      const code =
        error instanceof AppError ? error.message : "ERR_SGA_SYNC_FAILED";
      await sequelize.query(
        'UPDATE "SgaSnapshots" SET status = \'error\', error = :code WHERE "companyId" = :companyId',
        { replacements: { companyId, code } }
      );
      logger.warn(
        { companyId, code },
        "SGA synchronization failed; previous snapshot retained"
      );
    }
  });
};

export const loadSga = async (companyId: number, transaction?: Transaction) => {
  const stored = await snapshot(companyId, transaction);
  if (!stored?.syncedAt) throw new AppError("ERR_SGA_NOT_SYNCED", 409);
  const contacts = (
    await Contact.findAll({
      where: { companyId, isGroup: false },
      transaction,
      attributes: ["id", "name", "number", "email"],
      include: [
        {
          model: ContactCustomField,
          as: "extraInfo",
          attributes: ["name", "value"]
        }
      ]
    })
  ).map(c => c.toJSON()) as ContactRecord[];
  const links = await sequelize.query<{
    memberId: string;
    contactId: number | null;
  }>(
    'SELECT "memberId", "contactId" FROM "SgaContactLinks" WHERE "companyId" = :companyId',
    { replacements: { companyId }, type: QueryTypes.SELECT, transaction }
  );
  const manual = new Map(links.map(l => [l.memberId, l.contactId]));
  const contactsById = new Map(contacts.map(c => [c.id, c]));
  const matchContact = createContactMatcher(contacts);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Rio_Branco",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const billMap = new Map<string, Bill[]>();
  for (const bill of stored.data.bills)
    billMap.set(bill.memberId, [...(billMap.get(bill.memberId) || []), bill]);
  const members = stored.data.members.map(member => {
    const match = matchContact(
      member,
      manual.has(member.id) ? manual.get(member.id) : undefined
    );
    const overdue = (billMap.get(member.id) || []).filter(b =>
      isOverdue(b, today)
    );
    const record = contactsById.get(match.contactId);
    const contact = record
      ? {
          id: record.id,
          name: record.name,
          number: record.number,
          email: record.email
        }
      : null;
    return {
      ...member,
      match,
      contact: match.contactId ? contact : null,
      overdueCount: overdue.length,
      overdueAmount:
        Math.round(overdue.reduce((n, b) => n + b.amount, 0) * 100) / 100
    };
  });
  // Shared household/business phone numbers may identify several distinct
  // people in Hinova. Keep them unlinked until an administrator reviews them.
  const owners = new Map<number, Set<string>>();
  members.forEach(m => {
    if (m.match.contactId)
      owners.set(
        m.match.contactId,
        new Set([...(owners.get(m.match.contactId) || []), m.document || m.id])
      );
  });
  members.forEach(m => {
    if (
      ["phone", "email"].includes(m.match.method) &&
      (owners.get(m.match.contactId)?.size || 0) > 1
    ) {
      m.match = {
        contactId: null,
        method: "ambiguous",
        candidates: [m.match.contactId]
      };
      m.contact = null;
    }
  });
  const memberMap = new Map(members.map(m => [m.id, m]));
  const vehicles = stored.data.vehicles.map(vehicle => ({
    ...vehicle,
    member: memberMap.get(vehicle.memberId) || null
  }));
  return { stored, contacts, members, vehicles, today };
};

export const listSga = async (
  companyId: number,
  params: Record<string, unknown>
) => {
  const { stored, members, vehicles, today } = await loadSga(companyId);
  const query = normalizedText(params.search)
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 150);
  const filtered = vehicles.filter(v => {
    const m = v.member;
    if (params.contactId && m?.match.contactId !== Number(params.contactId))
      return false;
    if (params.status && v.status !== params.status) return false;
    if (params.link === "linked" && !m?.match.contactId) return false;
    if (params.link === "unmatched" && m?.match.contactId) return false;
    if (params.link === "ambiguous" && m?.match.method !== "ambiguous")
      return false;
    if (params.debt === "overdue" && !m?.overdueCount) return false;
    if (params.debt === "clear" && !!m?.overdueCount) return false;
    return (
      !query ||
      normalizedText(
        [
          v.plate,
          v.model,
          m?.name,
          m?.document,
          m?.email,
          m?.contact?.name,
          m?.contact?.number,
          ...(m?.phones || [])
        ].join(" ")
      )
        .replace(/[^a-z0-9]/g, "")
        .includes(query)
    );
  });
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const limit = Math.min(
    100,
    Math.max(1, Math.floor(Number(params.limit) || 25))
  );
  const overdueBills = stored.data.bills.filter(b => isOverdue(b, today));
  return {
    rows: filtered.slice((page - 1) * limit, page * limit),
    total: filtered.length,
    page,
    limit,
    syncedAt: stored.syncedAt,
    syncStatus: stored.status,
    error: stored.error,
    statuses: [...new Set(vehicles.map(v => v.status))].sort(),
    summary: {
      vehicles: vehicles.length,
      members: members.length,
      linked: members.filter(m => m.match.contactId).length,
      ambiguous: members.filter(m => m.match.method === "ambiguous").length,
      overdueMembers: new Set(overdueBills.map(b => b.memberId)).size,
      overdueAmount:
        Math.round(overdueBills.reduce((s, b) => s + b.amount, 0) * 100) / 100,
      overdueBills: overdueBills.length
    }
  };
};

export const setSgaLink = async (
  companyId: number,
  memberId: string,
  contactId: unknown,
  userId: number
) => {
  await assertSgaTenant(companyId);
  const stored = await snapshot(companyId);
  if (!stored?.data.members?.some(m => m.id === memberId))
    throw new AppError("ERR_SGA_MEMBER_NOT_FOUND", 404);
  if (
    contactId !== null &&
    (!Number.isInteger(Number(contactId)) ||
      !(await Contact.findOne({
        where: { id: Number(contactId), companyId, isGroup: false }
      })))
  )
    throw new AppError("ERR_SGA_CONTACT_INVALID", 400);
  await sequelize.transaction(async transaction => {
    await sequelize.query("SELECT pg_advisory_xact_lock(73421, :companyId)", {
      replacements: { companyId },
      transaction
    });
    await sequelize.query(
      'INSERT INTO "SgaContactLinks" ("companyId", "memberId", "contactId", "updatedBy", "updatedAt") VALUES (:companyId, :memberId, :contactId, :userId, NOW()) ON CONFLICT ("companyId", "memberId") DO UPDATE SET "contactId" = EXCLUDED."contactId", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()',
      {
        transaction,
        replacements: {
          companyId,
          memberId,
          contactId: contactId === null ? null : Number(contactId),
          userId
        }
      }
    );
    const linked = await loadSga(companyId, transaction);
    await reconcileContactFields(
      companyId,
      desiredContactFields(linked.members, linked.vehicles),
      transaction
    );
  });
};

export const startSgaSync = (): void => {
  if (
    process.env.ACNORTE_SGA_ENABLED !== "true" ||
    !process.env.ACNORTE_SGA_TOKEN
  )
    return;
  const run = async () => {
    try {
      await syncSga(companyIdConfigured());
    } catch {
      logger.warn("SGA background synchronization could not start");
    }
  };
  setTimeout(run, 15000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
};
