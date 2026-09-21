import { isAcNorteTenant, shouldShowGroupsTab } from "./groupTabs";

describe("groupTabs", () => {
  it("disables groups for AC Norte by company id", () => {
    const user = { companyId: 9, company: { slug: "outro" } };

    expect(isAcNorteTenant(user)).toBe(true);
    expect(shouldShowGroupsTab(user, "disabled", "enabled")).toBe(false);
  });

  it("disables groups for AC Norte by slug", () => {
    const user = { companyId: 22, company: { slug: " ACNORTE " } };

    expect(isAcNorteTenant(user)).toBe(true);
    expect(shouldShowGroupsTab(user, "disabled", "enabled")).toBe(false);
  });

  it("keeps the existing group settings for other tenants", () => {
    const user = { companyId: 22, company: { slug: "cliente" } };

    expect(shouldShowGroupsTab(user, "disabled", "enabled")).toBe(true);
    expect(shouldShowGroupsTab(user, "enabled", "enabled")).toBe(false);
    expect(shouldShowGroupsTab(user, "disabled", "disabled")).toBe(false);
  });
});

