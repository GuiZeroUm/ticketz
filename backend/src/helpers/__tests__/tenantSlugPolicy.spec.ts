import {
  assertTenantSlugAllowed,
  isProtectedTenantSlug
} from "../tenantSlugPolicy";
import normalizeSlug from "../normalizeSlug";

describe("protected tenant slugs", () => {
  beforeEach(() => {
    process.env.BILLING_CONSOLE_SLUGS = "somosespaco,nova-marca";
    delete process.env.MASTER_COMPANY_ID;
    delete process.env.TENANT_RUNTIME_COMPANY_ID;
    delete process.env.QUEUE_PREFIX;
  });

  it("protects the console slugs and administrative names", () => {
    [
      "teste",
      "somosespaco",
      "admin",
      "plataforma",
      "cobranca",
      "nova-marca"
    ].forEach(slug => expect(isProtectedTenantSlug(slug)).toBe(true));
    expect(isProtectedTenantSlug("cliente-exemplo")).toBe(false);
  });

  it("refuses a protected slug for a new company", () => {
    expect(() => assertTenantSlugAllowed("teste")).toThrow(
      expect.objectContaining({ message: "ERR_COMPANY_SLUG_RESERVED" })
    );
    expect(() => assertTenantSlugAllowed("cliente-exemplo")).not.toThrow();
  });

  it("refuses renaming a client company to a protected slug, but lets it keep its own", () => {
    expect(() =>
      assertTenantSlugAllowed("somosespaco", {
        companyId: 7,
        currentSlug: "cliente"
      })
    ).toThrow(
      expect.objectContaining({ message: "ERR_COMPANY_SLUG_RESERVED" })
    );
    expect(() =>
      assertTenantSlugAllowed("suporte", {
        companyId: 7,
        currentSlug: "suporte"
      })
    ).not.toThrow();
  });

  it("lets the platform company keep or take a console slug in the main runtime only", () => {
    expect(() =>
      assertTenantSlugAllowed("somosespaco", {
        companyId: 1,
        currentSlug: "somosespaco"
      })
    ).not.toThrow();
    expect(() =>
      assertTenantSlugAllowed("nova-marca", {
        companyId: 1,
        currentSlug: "somosespaco"
      })
    ).not.toThrow();
    process.env.TENANT_RUNTIME_COMPANY_ID = "9";
    process.env.QUEUE_PREFIX = "dedicado";
    expect(() =>
      assertTenantSlugAllowed("teste", { companyId: 1, currentSlug: "outra" })
    ).toThrow(
      expect.objectContaining({ message: "ERR_COMPANY_SLUG_RESERVED" })
    );
  });

  it("does not affect login, which normalizes the platform company slug", () => {
    expect(normalizeSlug("somosespaco")).toBe("somosespaco");
    expect(normalizeSlug("teste")).toBe("teste");
  });
});
