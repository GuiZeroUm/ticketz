import { podeVerCentralCobranca } from "./billingConsole";

test("mostra a Central só quando o backend libera, qualquer que seja o slug", () => {
  expect(
    podeVerCentralCobranca({
      profile: "admin",
      company: { slug: "somosespaco" },
      canUseBillingConsole: true
    })
  ).toBe(true);
  expect(
    podeVerCentralCobranca({
      super: true,
      company: { slug: "teste" },
      canUseBillingConsole: false
    })
  ).toBe(false);
  expect(
    podeVerCentralCobranca({ profile: "admin", company: { slug: "teste" } })
  ).toBe(false);
  expect(podeVerCentralCobranca(null)).toBe(false);
  expect(podeVerCentralCobranca({ canUseBillingConsole: "true" })).toBe(false);
});
