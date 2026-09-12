import { Transaction } from "sequelize";
import sequelize from "../../database";

export const SGA_FIELD_SOURCE = "acnorte-sga";
interface LinkedMember {
  id: string;
  document?: string;
  email?: string;
  match: { contactId: number | null };
  overdueCount: number;
  overdueAmount: number;
}
interface LinkedVehicle {
  memberId: string;
  plate: string;
}
export interface ManagedField {
  contactId: number;
  name: string;
  value: string;
}

// One debt total per contact, never repeated per vehicle. A manually selected
// contact can represent several SGA memberships; each member is counted once.
export const desiredContactFields = (
  members: LinkedMember[],
  vehicles: LinkedVehicle[]
): ManagedField[] => {
  const contacts = new Map<
    number,
    {
      memberIds: Set<string>;
      plates: Set<string>;
      documents: Set<string>;
      count: number;
      amount: number;
    }
  >();
  const memberContacts = new Map<string, number>();
  members.forEach(member => {
    const id = member.match.contactId;
    if (!id) return;
    const entry = contacts.get(id) || {
      memberIds: new Set<string>(),
      plates: new Set<string>(),
      documents: new Set<string>(),
      count: 0,
      amount: 0
    };
    if (!entry.memberIds.has(member.id)) {
      entry.memberIds.add(member.id);
      entry.count += member.overdueCount;
      entry.amount += member.overdueAmount;
      const document = (member.document || "").replace(/\D/g, "");
      if ([11, 14].includes(document.length)) entry.documents.add(document);
    }
    contacts.set(id, entry);
    memberContacts.set(member.id, id);
  });
  vehicles.forEach(vehicle => {
    const id = memberContacts.get(vehicle.memberId);
    if (id && vehicle.plate) contacts.get(id).plates.add(vehicle.plate);
  });
  return Array.from(contacts).flatMap(([contactId, entry]) => {
    const plates = [...entry.plates].sort();
    const fields: ManagedField[] = [
      {
        contactId,
        name: "Com boletos vencidos",
        value: entry.count
          ? `Sim — ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(entry.amount)}`
          : "Não"
      }
    ];
    if (!plates.length)
      fields.push({
        contactId,
        name: "Placa",
        value: "Nenhuma placa vinculada no SGA"
      });
    plates.forEach((plate, index) =>
      fields.push({
        contactId,
        name: plates.length === 1 ? "Placa" : `Placa ${index + 1}`,
        value: plate
      })
    );
    if (entry.documents.size)
      fields.push({
        contactId,
        name: "CPF/CNPJ",
        value: [...entry.documents].sort().map(formatDocument).join("; ")
      });
    return fields;
  });
};

const formatDocument = (document: string): string =>
  document.length === 11
    ? document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
    : document.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        "$1.$2.$3/$4-$5"
      );

export const desiredContactEmails = (members: LinkedMember[]) => {
  const contacts = new Map<number, Set<string>>();
  members.forEach(member => {
    const id = member.match.contactId;
    if (!id) return;
    const emails = contacts.get(id) || new Set<string>();
    const email = (member.email || "").trim().toLowerCase();
    if (email.length <= 254 && /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email))
      emails.add(email);
    contacts.set(id, emails);
  });
  // A native email accepts only one address. Never choose arbitrarily between owners.
  return [...contacts].flatMap(([contactId, emails]) =>
    emails.size === 1 ? [{ contactId, email: [...emails][0] }] : []
  );
};

export const reconcileContactEmails = async (
  companyId: number,
  emails: { contactId: number; email: string }[],
  transaction: Transaction
): Promise<void> => {
  // Ownership is a compare-and-set against the last email published by SGA.
  // Manual addresses survive updates, unlinks and missing source data.
  await sequelize.query(
    `WITH desired AS (
      SELECT * FROM jsonb_to_recordset(CAST(:emails AS jsonb)) AS d("contactId" integer, email text)
    ), targets AS (
      SELECT c.id, d.email FROM "Contacts" c
      LEFT JOIN desired d ON d."contactId" = c.id AND NOT c."isGroup"
      WHERE c."companyId" = :companyId AND (d."contactId" IS NOT NULL OR c."sgaEmail" IS NOT NULL)
    )
    UPDATE "Contacts" c SET
      email = CASE WHEN BTRIM(c.email) = '' OR c.email = c."sgaEmail"
        THEN COALESCE(t.email, '') ELSE c.email END,
      "sgaEmail" = CASE WHEN BTRIM(c.email) = '' OR c.email = c."sgaEmail"
        THEN t.email ELSE NULL END,
      "updatedAt" = NOW()
    FROM targets t WHERE c.id = t.id AND c."companyId" = :companyId
      AND ((c."sgaEmail" IS NOT NULL AND
        (c."sgaEmail" IS DISTINCT FROM t.email OR c.email IS DISTINCT FROM c."sgaEmail")) OR
        (t.email IS NOT NULL AND BTRIM(c.email) = ''))`,
    { replacements: { companyId, emails: JSON.stringify(emails) }, transaction }
  );
};

// All three statements share the snapshot publication transaction. Only fields
// explicitly owned by SGA are reconciled, including removals and lost matches.
export const reconcileContactFields = async (
  companyId: number,
  fields: ManagedField[],
  transaction: Transaction
): Promise<void> => {
  const desired = `jsonb_to_recordset(CAST(:fields AS jsonb)) AS d("contactId" integer, name text, value text)`;
  const options = {
    replacements: {
      companyId,
      fields: JSON.stringify(fields),
      source: SGA_FIELD_SOURCE
    },
    transaction
  };
  await sequelize.query(
    `
    DELETE FROM "ContactCustomFields" f USING "Contacts" c
    WHERE f."contactId" = c.id AND c."companyId" = :companyId
      AND f."managedBy" = :source AND (
        NOT EXISTS (SELECT 1 FROM ${desired} WHERE d."contactId" = f."contactId" AND d.name = f.name)
        OR EXISTS (SELECT 1 FROM "ContactCustomFields" older WHERE older."contactId" = f."contactId"
          AND older.name = f.name AND older."managedBy" = :source AND older.id < f.id)
      )`,
    options
  );
  await sequelize.query(
    `
    UPDATE "ContactCustomFields" f SET value = d.value, "updatedAt" = NOW()
    FROM ${desired}, "Contacts" c
    WHERE f."contactId" = d."contactId" AND f.name = d.name AND f."managedBy" = :source
      AND c.id = f."contactId" AND c."companyId" = :companyId AND f.value IS DISTINCT FROM d.value`,
    options
  );
  await sequelize.query(
    `
    INSERT INTO "ContactCustomFields" ("contactId", name, value, "managedBy", "createdAt", "updatedAt")
    SELECT d."contactId", d.name, d.value, :source, NOW(), NOW()
    FROM ${desired} JOIN "Contacts" c ON c.id = d."contactId" AND c."companyId" = :companyId
    WHERE NOT EXISTS (SELECT 1 FROM "ContactCustomFields" f WHERE f."contactId" = d."contactId"
      AND f.name = d.name AND f."managedBy" = :source)`,
    options
  );
};
