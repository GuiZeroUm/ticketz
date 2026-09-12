import {
  normalizeMember,
  normalizeBill,
  phoneKey,
  matchMember,
  isOverdue,
  ContactRecord
} from "../normalize";

const member = normalizeMember(
  {
    codigo_associado: "7",
    nome: "Pessoa",
    cpf: "123.456.789-09",
    ddd_celular: "68",
    telefone_celular: "99999-1111",
    email: "cliente@example.com"
  },
  "ATIVO"
);
const contact: ContactRecord = {
  id: 10,
  name: "Contato",
  number: "556899991111",
  email: ""
};

describe("SGA identity and debt normalization", () => {
  it("never uses SGA-generated identity fields to sustain an obsolete match", () => {
    const generated = {
      ...contact,
      email: member.email,
      sgaEmail: member.email,
      extraInfo: [
        { name: "CPF/CNPJ", value: member.document, managedBy: "acnorte-sga" }
      ]
    };
    expect(matchMember(member, [generated]).method).toBe("phone");
    expect(matchMember({ ...member, phones: [] }, [generated])).toMatchObject({
      contactId: null,
      method: "unmatched"
    });
    expect(
      matchMember({ ...member, phones: [], email: "manual@example.com" }, [
        { ...generated, email: "manual@example.com" }
      ])
    ).toMatchObject({ contactId: 10, method: "email" });
    expect(
      matchMember({ ...member, phones: [] }, [
        {
          ...generated,
          extraInfo: [
            { name: "CPF/CNPJ", value: member.document, managedBy: null }
          ]
        }
      ])
    ).toMatchObject({ contactId: 10, method: "document" });
  });
  it("matches Brazilian numbers with country code and optional ninth digit", () => {
    expect(phoneKey("+55 (68) 99999-1111")).toBe(phoneKey("68 9999-1111"));
    expect(matchMember(member, [contact])).toMatchObject({
      contactId: 10,
      method: "phone"
    });
    expect(
      matchMember(member, [{ ...contact, number: "556999991111" }]).contactId
    ).toBeNull();
    expect(phoneKey("99991111")).toBe("");
  });
  it("does not guess from names or empty identifiers", () => {
    expect(
      matchMember({ ...member, document: "", phones: [], email: "" }, [
        { ...contact, name: member.name }
      ])
    ).toMatchObject({ contactId: null, method: "unmatched" });
  });
  it("rejects duplicate phone candidates and conflicting document/phone owners", () => {
    expect(
      matchMember(member, [contact, { ...contact, id: 11 }])
    ).toMatchObject({
      contactId: null,
      method: "ambiguous",
      candidates: [10, 11]
    });
    const byDocument = {
      ...contact,
      id: 12,
      number: "556899882222",
      extraInfo: [{ name: "CPF/CNPJ", value: "12345678909" }]
    };
    expect(matchMember(member, [contact, byDocument])).toMatchObject({
      contactId: null,
      method: "ambiguous"
    });
    expect(matchMember(member, [byDocument])).toMatchObject({
      contactId: 12,
      method: "document"
    });
  });
  it("honors manual unlink and rejects a removed contact", () => {
    expect(matchMember(member, [contact], null).contactId).toBeNull();
    expect(matchMember(member, [contact], 99).contactId).toBeNull();
    expect(matchMember(member, [contact], 10)).toMatchObject({
      contactId: 10,
      method: "manual"
    });
  });
  it("counts only unpaid debt-bearing bills strictly before today", () => {
    const bill = normalizeBill(
      {
        codigo_boleto: "3",
        codigo_associado: "7",
        nosso_numero: "33",
        veiculo: ["1", "2"],
        data_vencimento: "2026-09-11",
        valor_boleto: "1.234,56",
        pago: "N",
        data_pagamento: null
      },
      true
    );
    expect(bill).toMatchObject({
      amount: 1234.56,
      vehicleIds: ["1", "2"],
      paid: false
    });
    expect(isOverdue(bill, "2026-09-12")).toBe(true);
    expect(isOverdue({ ...bill, due: "2026-09-12" }, "2026-09-12")).toBe(false);
    expect(isOverdue({ ...bill, paid: true }, "2026-09-12")).toBe(false);
    expect(isOverdue({ ...bill, countsAsDebt: false }, "2026-09-12")).toBe(
      false
    );
    expect(isOverdue({ ...bill, due: "" }, "2026-09-12")).toBe(false);
  });
});
