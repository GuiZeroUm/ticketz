import Setting from "../../models/Setting";
import Company from "../../models/Company";
import normalizeSlug from "../../helpers/normalizeSlug";

interface Request {
  key: string;
  slug?: string;
}

const publicSettingsKeys = [
  "allowSignup",
  "primaryColorLight",
  "primaryColorDark",
  "appLogoLight",
  "appLogoDark",
  "appLogoFavicon",
  "appName",
  "loginPageLinks",
  "loginSidePanelImage",
  "loginBackgroundContent",
  "linkPreviewImage",
  "linkPreviewDescription",
  "vapidPublicKey",
  "extensionDownloadUrl"
];

// Empresa "master" usada como fallback (dominio raiz / sem slug / slug
// desconhecido). Configuravel via MASTER_COMPANY_ID. Quando nao definida (ou
// invalida), NAO usamos nenhuma empresa cliente como padrao: retornamos null
// para que o frontend caia na marca neutra/generica embutida.
const getMasterCompanyId = (): number | null => {
  const raw = Number(process.env.MASTER_COMPANY_ID);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
};

// Resolve o companyId a partir do slug (subdominio). Slug valido e existente
// -> empresa do slug. Caso contrario -> empresa master configurada, ou null
// (marca generica) para nunca expor um cliente por padrao.
const resolveCompanyId = async (slug?: string): Promise<number | null> => {
  let normalized = "";
  try {
    normalized = normalizeSlug(slug);
  } catch (_) {
    return getMasterCompanyId();
  }

  if (normalized) {
    const company = await Company.findOne({
      where: { slug: normalized },
      attributes: ["id"]
    });

    if (company) {
      return company.id;
    }
  }

  return getMasterCompanyId();
};

const GetPublicSettingService = async ({
  key,
  slug
}: Request): Promise<string | undefined> => {
  if (!publicSettingsKeys.includes(key)) {
    return null;
  }

  const companyId = await resolveCompanyId(slug);

  // Sem empresa resolvida -> marca generica (frontend usa os defaults).
  if (!companyId) {
    return null;
  }

  const setting = await Setting.findOne({
    where: {
      companyId,
      key
    }
  });

  return setting?.value || null;
};

export default GetPublicSettingService;
