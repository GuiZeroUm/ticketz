import { domainToASCII } from "url";
import { normalizeEmailAddress, parseAddressList } from "../addresses";

describe("normalizeEmailAddress", () => {
  it("trims, lowercases and extracts the address from a display form", () => {
    expect(normalizeEmailAddress("  Carla <Compras@BomPreco.com.br> ")).toBe(
      "compras@bompreco.com.br"
    );
    expect(normalizeEmailAddress("  USER@Example.COM ")).toBe(
      "user@example.com"
    );
  });

  it("converts IDN domains to ASCII punycode", () => {
    expect(normalizeEmailAddress("João <Joao@Pão.com.br>")).toBe(
      `joao@${domainToASCII("pão.com.br")}`
    );
    expect(normalizeEmailAddress("joao@xn--po-sia.com.br")).toBe(
      "joao@xn--po-sia.com.br"
    );
    expect(parseAddressList("x@münchen.de").valid).toEqual([
      { address: "x@xn--mnchen-3ya.de" }
    ]);
  });

  it("returns null for invalid input", () => {
    expect(normalizeEmailAddress("not-an-email")).toBeNull();
    expect(normalizeEmailAddress("")).toBeNull();
    expect(normalizeEmailAddress("a@b")).toBeNull();
    expect(normalizeEmailAddress("a b@x.com")).toBeNull();
    expect(normalizeEmailAddress("@x.com")).toBeNull();
    expect(normalizeEmailAddress("a@x..com")).toBeNull();
  });
});

describe("parseAddressList", () => {
  it("splits valid and invalid entries", () => {
    expect(parseAddressList("a@x.com, bad, B <b@y.com>")).toEqual({
      valid: [{ address: "a@x.com" }, { address: "b@y.com", name: "B" }],
      invalid: ["bad"]
    });
  });

  it("accepts arrays, semicolons, quoted names with commas and dedupes", () => {
    expect(
      parseAddressList(['"Silva, Ana" <Ana@X.com>; ana@x.com', "", "c@z.org"])
    ).toEqual({
      valid: [
        { address: "ana@x.com", name: "Silva, Ana" },
        { address: "c@z.org" }
      ],
      invalid: []
    });
  });

  it("returns empty lists for blank input", () => {
    expect(parseAddressList("  ")).toEqual({ valid: [], invalid: [] });
  });
});
