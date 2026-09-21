const AC_NORTE_COMPANY_ID = 9;
const AC_NORTE_SLUG = "acnorte";

export const isAcNorteTenant = user => {
  const companyId = Number(user?.companyId ?? user?.company?.id);
  const slug = String(user?.company?.slug || "")
    .trim()
    .toLowerCase();

  return companyId === AC_NORTE_COMPANY_ID || slug === AC_NORTE_SLUG;
};

export const shouldShowGroupsTab = (user, ignoreGroups, groupsTab) =>
  !isAcNorteTenant(user) &&
  ignoreGroups === "disabled" &&
  groupsTab === "enabled";

