import {
  linkWhatsapp,
  normalizaTelefone,
  podeVerProspeccao,
  telefoneDoLead
} from "./prospeccao";

describe("podeVerProspeccao", () => {
  it("libera admin do tenant dono da ferramenta", () => {
    expect(
      podeVerProspeccao({ profile: "admin", company: { slug: "teste" } })
    ).toBe(true);
  });

  it("libera super mesmo sem perfil admin", () => {
    expect(
      podeVerProspeccao({
        profile: "user",
        super: true,
        company: { slug: "teste" }
      })
    ).toBe(true);
  });

  it("bloqueia atendente comum do tenant dono", () => {
    expect(
      podeVerProspeccao({ profile: "user", company: { slug: "teste" } })
    ).toBe(false);
  });

  it("bloqueia outros tenants", () => {
    expect(
      podeVerProspeccao({ profile: "admin", company: { slug: "acnorte" } })
    ).toBe(false);
  });

  it("não quebra com usuário ou empresa ausentes", () => {
    expect(podeVerProspeccao(undefined)).toBe(false);
    expect(podeVerProspeccao({ profile: "admin" })).toBe(false);
  });
});

describe("normalizaTelefone", () => {
  it("acrescenta DDI a telefone brasileiro formatado", () => {
    expect(normalizaTelefone("(68) 99988-4999")).toBe("5568999884999");
  });

  it("mantém número que já veio com DDI", () => {
    expect(normalizaTelefone("5568999999999")).toBe("5568999999999");
  });

  it("aceita telefone fixo com DDD", () => {
    expect(normalizaTelefone("(68) 3223-4455")).toBe("556832234455");
  });

  it("repassa número estrangeiro sem inventar DDI", () => {
    expect(normalizaTelefone("+351 912 345 678")).toBe("351912345678");
  });

  it("usa o primeiro candidato preenchido", () => {
    expect(normalizaTelefone("", null, "(68) 99988-4999")).toBe(
      "5568999884999"
    );
  });

  it("devolve vazio quando não há telefone utilizável", () => {
    expect(normalizaTelefone("", null, undefined)).toBe("");
    expect(normalizaTelefone("sem numero")).toBe("");
  });
});

describe("telefoneDoLead", () => {
  it("cai para o WhatsApp do Instagram quando não há telefone", () => {
    expect(
      telefoneDoLead({ telefone: null, instagramWhatsapp: "5568999999999" })
    ).toBe("5568999999999");
  });

  it("prefere o telefone do Google Maps", () => {
    expect(
      telefoneDoLead({
        telefone: "(68) 99988-4999",
        instagramWhatsapp: "5568777776666"
      })
    ).toBe("5568999884999");
  });
});

describe("linkWhatsapp", () => {
  it("monta o link com a mensagem codificada", () => {
    expect(linkWhatsapp("(68) 99988-4999", "Oi! Tudo bem?")).toBe(
      "https://wa.me/5568999884999?text=Oi!%20Tudo%20bem%3F"
    );
  });

  it("abre a conversa sem texto quando o rascunho está vazio", () => {
    expect(linkWhatsapp("5568999999999", "   ")).toBe(
      "https://wa.me/5568999999999"
    );
  });

  it("devolve vazio sem telefone utilizável", () => {
    expect(linkWhatsapp("", "Oi")).toBe("");
  });
});
