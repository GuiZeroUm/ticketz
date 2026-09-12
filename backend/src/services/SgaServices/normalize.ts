export const digits = (value: unknown): string =>
  String(value || "").replace(/\D/g, "");
export const text = (value: unknown): string => String(value ?? "").trim();
export const normalizedText = (value: unknown): string =>
  text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Only Brazilian mobile numbers admit the optional ninth digit. Never use a
// suffix-only match: area codes distinguish different owners.
export const phoneKey = (value: unknown): string => {
  let number = digits(value);
  if ((number.length === 12 || number.length === 13) && number.startsWith("55"))
    number = number.slice(2);
  if (number.length === 11 && number[2] === "9")
    number = number.slice(0, 2) + number.slice(3);
  return number.length === 10 ? number : "";
};
export type SgaRow = Record<string, unknown>;
export const phonesFrom = (row: SgaRow): string[] =>
  Array.from(
    new Set(
      [
        ["ddd", "telefone"],
        ["ddd_celular", "telefone_celular"],
        ["ddd_celular_aux", "telefone_celular_aux"],
        ["ddd_comercial", "telefone_comercial"]
      ]
        .map(([ddd, field]) => {
          const number = digits(row[field]);
          return phoneKey(
            number.length <= 9 ? digits(row[ddd]) + number : number
          );
        })
        .filter(Boolean)
    )
  );

export interface Member {
  id: string;
  name: string;
  document: string;
  email: string;
  phones: string[];
  status: string;
}
export interface Vehicle {
  id: string;
  memberId: string;
  plate: string;
  brand: string;
  model: string;
  year: string;
  type: string;
  status: string;
  contractDate: string;
  protectedValue: number;
}
export interface Bill {
  id: string;
  number: string;
  memberId: string;
  vehicleIds: string[];
  due: string;
  amount: number;
  status: string;
  paid: boolean;
  countsAsDebt: boolean;
}
export interface ContactRecord {
  id: number;
  name: string;
  number: string;
  email: string;
  extraInfo?: { name: string; value: string }[];
}
export interface Match {
  contactId: number | null;
  method: string;
  candidates: number[];
}

export const money = (value: unknown): number => {
  const s = text(value);
  const n = Number(
    s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s
  );
  return Number.isFinite(n) ? n : 0;
};
export const normalizeMember = (row: SgaRow, status: string): Member => ({
  id: text(row.codigo_associado),
  name: text(row.nome || row.nome_associado),
  document: digits(row.cpf || row.cpf_associado),
  email: text(row.email).toLowerCase(),
  phones: phonesFrom(row),
  status
});
export const normalizeVehicle = (row: SgaRow, status: string): Vehicle => ({
  id: text(row.codigo_veiculo),
  memberId: text(row.codigo_associado),
  plate: text(row.placa)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ""),
  brand: text(row.marca),
  model: text(row.modelo),
  year: text(row.ano_modelo),
  type: text(row.tipo),
  status: text(row.descricao_situacao) || status,
  contractDate: text(row.data_contrato).slice(0, 10),
  protectedValue: money(row.valor_fipe_protegido)
});
export const normalizeBill = (row: SgaRow, countsAsDebt: boolean): Bill => ({
  id: text(row.codigo_boleto || row.nosso_numero),
  number: text(row.nosso_numero),
  memberId: text(row.codigo_associado),
  vehicleIds: (Array.isArray(row.veiculo)
    ? row.veiculo
    : Array.isArray(row.veiculos)
      ? row.veiculos
      : []
  ).map((v: unknown) =>
    text(v && typeof v === "object" ? (v as SgaRow).codigo_veiculo : v)
  ),
  due: text(row.data_vencimento).slice(0, 10),
  amount: money(row.valor_boleto),
  status: text(row.descricao_situacao_boleto || row.situacao_boleto),
  paid:
    ["S", "SIM", "Y"].includes(text(row.pago).toUpperCase()) ||
    (!!row.data_pagamento && !text(row.data_pagamento).startsWith("0000")),
  countsAsDebt
});
export const isOverdue = (bill: Bill, today: string): boolean =>
  bill.countsAsDebt &&
  !bill.paid &&
  /^\d{4}-\d{2}-\d{2}$/.test(bill.due) &&
  bill.due < today;

export const createContactMatcher = (contacts: ContactRecord[]) => {
  const byDocument = new Map<string, ContactRecord[]>();
  const byPhone = new Map<string, ContactRecord[]>();
  const byEmail = new Map<string, ContactRecord[]>();
  const documentFields = (contact: ContactRecord) =>
    (contact.extraInfo || [])
      .filter(f =>
        /^(cpf|cnpj|cpfcnpj|documento)$/.test(
          normalizedText(f.name).replace(/[^a-z]/g, "")
        )
      )
      .map(f => digits(f.value))
      .filter(d => [11, 14].includes(d.length));
  const add = (
    index: Map<string, ContactRecord[]>,
    key: string,
    contact: ContactRecord
  ) => {
    if (key)
      index.set(key, [
        ...(index.get(key) || []).filter(c => c.id !== contact.id),
        contact
      ]);
  };
  contacts.forEach(contact => {
    documentFields(contact).forEach(doc => add(byDocument, doc, contact));
    add(byPhone, phoneKey(contact.number), contact);
    add(byEmail, text(contact.email).toLowerCase(), contact);
  });
  return (member: Member, manual?: number | null): Match => {
    if (manual !== undefined)
      return {
        contactId: contacts.some(c => c.id === manual) ? manual : null,
        method: "manual",
        candidates: []
      };
    const documentMatches = byDocument.get(member.document) || [];
    const phoneMatches = Array.from(
      new Map(
        member.phones.flatMap(p => byPhone.get(p) || []).map(c => [c.id, c])
      ).values()
    );
    const emailMatches = byEmail.get(member.email) || [];
    const chosen = documentMatches.length
      ? documentMatches
      : phoneMatches.length
        ? phoneMatches
        : emailMatches;
    const method = documentMatches.length
      ? "document"
      : phoneMatches.length
        ? "phone"
        : emailMatches.length
          ? "email"
          : "unmatched";
    // Conflicting strong identifiers need a human choice, not a silent overwrite.
    const conflict =
      (documentMatches.length === 1 &&
        phoneMatches.some(c => c.id !== documentMatches[0].id)) ||
      (!!member.document &&
        chosen.some(c => documentFields(c).some(d => d !== member.document)));
    const candidates = Array.from(
      new Set(
        (conflict ? [...documentMatches, ...phoneMatches] : chosen).map(
          c => c.id
        )
      )
    );
    return {
      contactId: candidates.length === 1 && !conflict ? candidates[0] : null,
      method: conflict || candidates.length > 1 ? "ambiguous" : method,
      candidates
    };
  };
};
export const matchMember = (
  member: Member,
  contacts: ContactRecord[],
  manual?: number | null
): Match => createContactMatcher(contacts)(member, manual);
