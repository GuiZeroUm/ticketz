import { buildReferences, normalizeSubject, replySubject } from "../threading";
import { MAX_REFERENCES } from "../limits";

describe("normalizeSubject", () => {
  it("strips repeated reply/forward prefixes, trims and lowercases", () => {
    expect(normalizeSubject("RES: Re: FW: Proposta")).toBe("proposta");
    expect(normalizeSubject("  Enc: ENC: Fwd: Pedido  123 ")).toBe(
      "pedido 123"
    );
    expect(normalizeSubject("Reunião Re: x")).toBe("reunião re: x");
    expect(normalizeSubject("")).toBe("");
    expect(
      normalizeSubject("Re[2]: AW: WG: SV: RES: ENC: Fwd[3]: Orçamento")
    ).toBe("orçamento");
    expect(normalizeSubject("AW: Re: Pedido")).toBe("pedido");
  });
});

describe("replySubject", () => {
  it("does not duplicate prefixes", () => {
    expect(replySubject("Re: Proposta", "reply")).toBe("Re: Proposta");
    expect(replySubject("RES: Proposta", "replyAll")).toBe("RES: Proposta");
    expect(replySubject("Fwd: Proposta", "forward")).toBe("Fwd: Proposta");
    expect(replySubject("ENC: Proposta", "forward")).toBe("ENC: Proposta");
  });

  it("recognizes localized prefixes", () => {
    expect(replySubject("AW: Pedido", "reply")).toBe("AW: Pedido");
    expect(replySubject("Re[2]: Pedido", "reply")).toBe("Re[2]: Pedido");
    expect(replySubject("WG: Pedido", "forward")).toBe("WG: Pedido");
  });

  it("adds the prefix when missing", () => {
    expect(replySubject("Proposta", "reply")).toBe("Re: Proposta");
    expect(replySubject("Proposta", "replyAll")).toBe("Re: Proposta");
    expect(replySubject("Proposta", "forward")).toBe("Fwd: Proposta");
    expect(replySubject("Fwd: Proposta", "reply")).toBe("Re: Fwd: Proposta");
    expect(replySubject("", "reply")).toBe("Re:");
  });
});

describe("buildReferences", () => {
  it("appends the parent and keeps only the last MAX_REFERENCES", () => {
    const previous = Array.from({ length: 25 }, (_, i) => `<${i}@x>`);
    const out = buildReferences(previous, "<p@x>");
    expect(out).toHaveLength(20);
    expect(MAX_REFERENCES).toBe(20);
    expect(out[out.length - 1]).toBe("<p@x>");
    expect(out[0]).toBe("<6@x>");
  });

  it("does not duplicate the parent and ignores empty parent", () => {
    expect(buildReferences(["<a@x>", "<p@x>"], "<p@x>")).toEqual([
      "<a@x>",
      "<p@x>"
    ]);
    expect(buildReferences(["<a@x>"])).toEqual(["<a@x>"]);
    expect(buildReferences([], "<p@x>")).toEqual(["<p@x>"]);
  });
});
