import isAcNorte from "./isAcNorte";

it("identifica a AC Norte sem depender do id da empresa", () => {
  expect(isAcNorte({ company: { slug: "ACNORTE" } })).toBe(true);
  expect(isAcNorte({ companySlug: " acnorte " })).toBe(true);
});

it("mantém a experiência padrão nos demais tenants", () => {
  expect(isAcNorte({ company: { slug: "teste" } })).toBe(false);
  expect(isAcNorte({ company: { id: 9 } })).toBe(false);
  expect(isAcNorte(null)).toBe(false);
});
