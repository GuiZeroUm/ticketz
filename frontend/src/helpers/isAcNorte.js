export const isAcNorte = user =>
  String(user?.company?.slug || user?.companySlug || "")
    .trim()
    .toLowerCase() === "acnorte";

export default isAcNorte;
