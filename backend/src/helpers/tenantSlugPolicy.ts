import AppError from "../errors/AppError";
import { billingConsoleSlugs } from "./billingConsole";
import { getPlatformCompanyId } from "./platformSuper";
import { isDedicatedRuntime } from "./tenantRuntime";

// Slugs que nenhuma empresa nova pode usar: os da Central de Cobrança e nomes
// que sugerem administração da plataforma. Fica fora de normalizeSlug de
// propósito: o login também normaliza o slug e não pode recusar a empresa da
// plataforma.
const PROTECTED_TENANT_SLUGS = new Set([
  "teste",
  "somosespaco",
  "admin",
  "administrador",
  "plataforma",
  "platform",
  "cobranca",
  "billing",
  "financeiro",
  "suporte",
  "support",
  "super",
  "superadmin",
  "root",
  "master",
  "espacowhats",
  "espaco-whats",
  "sistema"
]);

export const isProtectedTenantSlug = (slug?: string | null): boolean => {
  const value = String(slug ?? "")
    .trim()
    .toLowerCase();
  return (
    !!value &&
    (PROTECTED_TENANT_SLUGS.has(value) || billingConsoleSlugs().includes(value))
  );
};

interface SlugContext {
  companyId?: number | null;
  currentSlug?: string | null;
}

// Recusa slug protegido em criação e renomeação. Exceções: manter o slug que
// a empresa já tem, e a própria empresa da plataforma no runtime principal.
export const assertTenantSlugAllowed = (
  slug?: string | null,
  context: SlugContext = {}
): void => {
  if (!isProtectedTenantSlug(slug)) return;
  if (context.currentSlug && context.currentSlug === slug) return;
  if (
    context.companyId &&
    Number(context.companyId) === getPlatformCompanyId() &&
    !isDedicatedRuntime()
  ) {
    return;
  }
  throw new AppError("ERR_COMPANY_SLUG_RESERVED");
};
