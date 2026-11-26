/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  billingConsoleSlugs,
  isBillingConsoleCompany,
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

const admin = { profile: "admin", super: false };
const attendant = { profile: "user", super: false };

describe("billing console access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BILLING_CONSOLE_SLUGS;
    delete process.env.TENANT_RUNTIME_COMPANY_ID;
    delete process.env.QUEUE_PREFIX;
  });

  it("keeps working after the owner company is renamed", () => {
    expect(billingConsoleSlugs()).toEqual(["teste", "somosespaco"]);
    expect(userCanUseBillingConsole(admin, { slug: "somosespaco" })).toBe(true);
    expect(userCanUseBillingConsole(admin, { slug: "teste" })).toBe(true);
    expect(
      userCanUseBillingConsole(
        { profile: "user", super: true },
        { slug: "somosespaco" }
      )
    ).toBe(true);
  });

  it("never opens the console to client companies or non-admin users", () => {
    expect(userCanUseBillingConsole(admin, { slug: "cliente-exemplo" })).toBe(
      false
    );
    expect(userCanUseBillingConsole(admin, { slug: "acnorte" })).toBe(false);
    expect(userCanUseBillingConsole(admin, null)).toBe(false);
    expect(userCanUseBillingConsole(attendant, { slug: "somosespaco" })).toBe(
      false
    );
  });

  it("never opens the console in a dedicated runtime", () => {
    process.env.TENANT_RUNTIME_COMPANY_ID = "9";
    process.env.QUEUE_PREFIX = "dedicado";
    expect(isBillingConsoleCompany({ slug: "somosespaco" })).toBe(false);
    expect(userCanUseBillingConsole(admin, { slug: "teste" })).toBe(false);
  });

  it("lets the environment override the slugs", () => {
    process.env.BILLING_CONSOLE_SLUGS = "outra-plataforma";
    expect(userCanUseBillingConsole(admin, { slug: "somosespaco" })).toBe(
      false
    );
    expect(userCanUseBillingConsole(admin, { slug: "outra-plataforma" })).toBe(
      true
    );
  });

  it("sends the decision in the serialized user, loading the slug when missing", async () => {
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
      slug: "cliente-exemplo"
    });
    const client = await SerializeUser({
      id: 2,
      companyId: 7,
      profile: "admin",
      super: false
    } as any);
    expect(Company.findByPk).toHaveBeenCalledWith(7, {
      attributes: ["id", "slug"]
    });
    expect(client.canUseBillingConsole).toBe(false);
  });
});
