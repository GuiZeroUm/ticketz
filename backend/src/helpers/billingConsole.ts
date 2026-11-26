import Company from "../models/Company";
import { isDedicatedRuntime } from "./tenantRuntime";
import { getPlatformCompanyId } from "./platformSuper";
import User from "../models/User";

// A Central de Cobrança é a tela do responsável financeiro da operação: ela
// enxerga as faturas de *todos* os tenants, então só pode existir no tenant
// dono da plataforma. Amarramos ao slug (e não ao id) porque cada instalação
// tem o seu id 1 — a AC Norte, por exemplo, roda o mesmo código em banco
// próprio e não pode ganhar a tela.
// A Central pertence à empresa da plataforma (MASTER_COMPANY_ID) e só abre
// quando o slug atual dela está em BILLING_CONSOLE_SLUGS. Sem a variável,
// ninguém tem a Central (falha fechada): um slug igual em outra empresa nunca
// basta, e renomear a empresa da plataforma exige atualizar a variável.

// Estes campos definem o ciclo financeiro do cliente. No tenant dono da
// Central eles só podem ser alterados pela própria Central de Cobrança; a tela
// genérica de empresas continua cuidando dos dados operacionais.
export const CENTRALIZED_BILLING_FIELDS = [
  "planId",
  "saleValue",
  "introValue",
  "introMonths",
  "trialDays",
  "dueDay",
  "dueDate",
  "recurrence"
] as const;

export const hasCentralizedBillingFields = (
  payload?: Record<string, unknown> | null
): boolean =>
  !!payload &&
  CENTRALIZED_BILLING_FIELDS.some(field =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );

const clean = (slug?: string | null): string =>
  String(slug ?? "")
    .trim()
    .toLowerCase();

export const billingConsoleSlugs = (): string[] => {
  const configured = process.env.BILLING_CONSOLE_SLUGS?.trim();
  const slugs = configured ? configured.split(",") : [];
  return slugs.map(clean).filter(Boolean);
};

// Empresa dona da plataforma (por id). Usada para excluí-la das listas de
// clientes e da cobrança, independentemente do slug.
export const isPlatformOwnerCompany = (
  company?: Pick<Company, "id"> | null
): boolean => !!company && Number(company.id) === getPlatformCompanyId();

export const isBillingConsoleCompany = (
  company?: Pick<Company, "id" | "slug"> | null
): boolean => {
  // Um runtime dedicado (cliente com instância própria) nunca tem a Central.
  if (isDedicatedRuntime()) return false;
  if (!isPlatformOwnerCompany(company)) return false;
  const slug = clean(company?.slug);
  return !!slug && billingConsoleSlugs().includes(slug);
};

// O financeiro é admin do tenant dono — não precisa ser super, que abriria a
// plataforma inteira.
export const canUseBillingConsole = (
  user?: Pick<User, "profile" | "super"> | null
): boolean => !!user && (user.super === true || user.profile === "admin");

// Calculado no backend e enviado no usuário serializado: a tela não decide
// por conta própria quem vê a Central.
export const userCanUseBillingConsole = (
  user?: Pick<User, "profile" | "super" | "companyId"> | null,
  company?: Pick<Company, "id" | "slug"> | null
): boolean =>
  !!user &&
  Number(user.companyId) === Number(company?.id) &&
  isBillingConsoleCompany(company) &&
  canUseBillingConsole(user);
