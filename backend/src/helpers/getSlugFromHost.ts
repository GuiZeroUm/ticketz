// Deriva o slug (subdominio) da empresa a partir do hostname da requisicao.
// Espelha a logica do frontend em src/helpers/getCompanySlug.js, porem no
// backend usamos process.env.APP_BASE_DOMAIN (a mesma variavel exposta ao
// frontend via config.json).
//
// Retorna "" quando nao ha slug (apex / www / localhost / IP / dominio nao
// reconhecido). Nesse caso quem consome (GetPublicSettingService) cai na
// empresa master ou na marca generica.
//
// A validacao final do formato do slug fica a cargo de normalizeSlug, chamado
// mais adiante em GetPublicSettingService; aqui apenas extraimos o primeiro
// label do subdominio.
export const getSlugFromHost = (rawHost?: string): string => {
  const host = (rawHost || "").toLowerCase().split(":")[0].trim();

  if (
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    return "";
  }

  // Dev: *.localhost
  if (host.endsWith(".localhost")) {
    return host.slice(0, host.length - ".localhost".length).split(".")[0];
  }

  const baseDomain = (process.env.APP_BASE_DOMAIN || "").toLowerCase();
  if (baseDomain && host !== baseDomain && host.endsWith(`.${baseDomain}`)) {
    const prefix = host.slice(0, host.length - baseDomain.length - 1);
    return prefix.split(".")[0];
  }

  return "";
};

export default getSlugFromHost;
