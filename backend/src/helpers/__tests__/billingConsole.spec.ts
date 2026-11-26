/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  billingConsoleSlugs,
  isBillingConsoleCompany,
  isPlatformOwnerCompany,
  userCanUseBillingConsole
} from "../billingConsole";
import { SerializeUser } from "../SerializeUser";
import Company from "../../models/Company";

jest.mock("../../models/Company", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../models/User", () => ({ __esModule: true, default: {} }));
jest.mock("../../models/Queue", () => ({ __esModule: true, default: {} }));

const admin = (companyId: number) => ({
  profile: "admin",
  super: false,
  companyId
});
const platform = { id: 1, slug: "somosespaco" };

describe("billing console access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BILLING_CONSOLE_SLUGS = "somosespaco";
    delete process.env.MASTER_COMPANY_ID;
    delete process.env.TENANT_RUNTIME_COMPANY_ID;
    delete process.env.QUEUE_PREFIX;
  });

  it("opens the console to the platform company admins", () => {
    expect(userCanUseBillingConsole(admin(1), platform)).toBe(true);
    expect(
      userCanUseBillingConsole(
        { profile: "user", super: true, companyId: 1 },
        platform
      )
    ).toBe(true);
  });

  it("never opens it to another company using a listed slug (e.g. created by public signup)", () => {
    process.env.BILLING_CONSOLE_SLUGS = "somosespaco,teste";
    const impostor = { id: 77, slug: "teste" };
    expect(isBillingConsoleCompany(impostor)).toBe(false);
    expect(userCanUseBillingConsole(admin(77), impostor)).toBe(false);
  });

  it("never opens it to client companies, attendants or users of another company", () => {
    expect(
      userCanUseBillingConsole(admin(7), { id: 7, slug: "cliente-exemplo" })
    ).toBe(false);
    expect(
      userCanUseBillingConsole(
        { profile: "user", super: false, companyId: 1 },
        platform
      )
    ).toBe(false);
    expect(userCanUseBillingConsole(admin(7), platform)).toBe(false);
    expect(userCanUseBillingConsole(admin(1), null)).toBe(false);
  });

  it("follows a rename of the platform company once the environment lists the new slug", () => {
    const renamed = { id: 1, slug: "nova-marca" };
    expect(userCanUseBillingConsole(admin(1), renamed)).toBe(false);
    process.env.BILLING_CONSOLE_SLUGS = "somosespaco,nova-marca";
    expect(userCanUseBillingConsole(admin(1), renamed)).toBe(true);
  });

  it("fails closed without BILLING_CONSOLE_SLUGS (documented decision)", () => {
    delete process.env.BILLING_CONSOLE_SLUGS;
    expect(billingConsoleSlugs()).toEqual([]);
    expect(userCanUseBillingConsole(admin(1), platform)).toBe(false);
    // A exclusão da dona da plataforma nas listas não depende da variável.
    expect(isPlatformOwnerCompany(platform)).toBe(true);
  });

  it("never opens the console in a dedicated runtime", () => {
    process.env.TENANT_RUNTIME_COMPANY_ID = "9";
    process.env.QUEUE_PREFIX = "dedicado";
    process.env.MASTER_COMPANY_ID = "9";
    process.env.BILLING_CONSOLE_SLUGS = "acnorte";
    expect(userCanUseBillingConsole(admin(9), { id: 9, slug: "acnorte" })).toBe(
      false
    );
  });

  it("sends the decision in the serialized user, loading the company when missing", async () => {
    const withCompany = await SerializeUser({
      id: 1,
      companyId: 1,
      profile: "admin",
      super: false,
      company: { id: 1, slug: "somosespaco" }
    } as any);
    expect(withCompany.canUseBillingConsole).toBe(true);
    expect(Company.findByPk).not.toHaveBeenCalled();

    (Company.findByPk as jest.Mock).mockResolvedValue({
      id: 7,
      slug: "somosespaco"
    });
    const other = await SerializeUser({
      id: 2,
      companyId: 7,
      profile: "admin",
      super: false
    } as any);
    expect(Company.findByPk).toHaveBeenCalledWith(7, {
      attributes: ["id", "slug"]
    });
    expect(other.canUseBillingConsole).toBe(false);
  });
});
