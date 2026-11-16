// Super admin da plataforma: usuario com a flag `super` que pertence a empresa
// master (MASTER_COMPANY_ID, padrao 1). A flag sozinha nao basta: usuarios
// marcados como super em outras empresas operam apenas a propria empresa.

type SuperCandidate =
  | {
      super?: boolean | null;
      companyId?: number | string | null;
    }
  | null
  | undefined;

export const getPlatformCompanyId = (): number => {
  const raw = Number(process.env.MASTER_COMPANY_ID);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
};

export const isPlatformSuper = (user: SuperCandidate): boolean =>
  !!user &&
  user.super === true &&
  Number(user.companyId) === getPlatformCompanyId();

export default isPlatformSuper;
