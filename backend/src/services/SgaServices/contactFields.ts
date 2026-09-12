import { Transaction } from "sequelize";
import sequelize from "../../database";

export const SGA_FIELD_SOURCE = "acnorte-sga";
interface LinkedMember {
  id: string;
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
      count: 0,
      amount: 0
    };
    if (!entry.memberIds.has(member.id)) {
      entry.memberIds.add(member.id);
      entry.count += member.overdueCount;
      entry.amount += member.overdueAmount;
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
    return fields;
  });
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
