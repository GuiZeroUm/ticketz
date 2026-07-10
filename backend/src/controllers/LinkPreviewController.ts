import { Request, Response } from "express";

import GetPublicSettingService from "../services/SettingServices/GetPublicSettingService";
import getSlugFromHost from "../helpers/getSlugFromHost";

// Escapa texto para uso seguro dentro de atributos HTML (valores das meta
// tags). appName/appDescription sao controlados pelo admin da empresa, mas
// ainda assim escapamos para evitar quebrar o markup.
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Monta a URL publica absoluta de um arquivo enviado (logo da empresa).
// Usa BACKEND_URL (mesmo padrao usado em Message/PwaController) para garantir
// que o crawler consiga baixar a imagem sem autenticacao.
const publicFileUrl = (filename: string): string => {
  const base = (process.env.BACKEND_URL || "").replace(/\/+$/, "");
  return `${base}/public/${filename}`;
};

/**
 * Rota consumida pelos robos de pre-visualizacao de link (WhatsApp, Facebook,
 * Telegram, Twitter/X, etc.). O nginx roteia apenas esses user-agents para ca;
 * usuarios reais continuam recebendo a SPA estatica.
 *
 * Retorna um HTML minimo com as meta tags Open Graph / Twitter Card
 * personalizadas por empresa (tenant), resolvidas a partir do subdominio.
 * Assim, ao compartilhar o link de um tenant especifico
 * (ex.: espacosingular.exemplo.com.br) a logo e o nome daquele tenant
 * aparecem no card de pre-visualizacao.
 */
export const preview = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ||
    req.headers.host ||
    "";

  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ||
    req.protocol ||
    "https";

  const slug = getSlugFromHost(host);

  const [appName, logoLight, logoDark] = await Promise.all([
    GetPublicSettingService({ key: "appName", slug }),
    GetPublicSettingService({ key: "appLogoLight", slug }),
    GetPublicSettingService({ key: "appLogoDark", slug })
  ]);

  const title = appName || "Ticketz";

  // Logo do tenant (preferimos a versao clara, que combina com o fundo claro
  // do card de pre-visualizacao). Se a empresa nao tiver logo, caimos na
  // imagem padrao estatica do frontend (PNG quadrado, bom para os robos).
  const logoFile = logoLight || logoDark;
  const imageUrl = logoFile
    ? publicFileUrl(logoFile)
    : `${proto}://${host}/icon-1024x1024.png`;

  const pageUrl = `${proto}://${host}/`;

  const safeTitle = escapeHtml(title);
  const safeImage = escapeHtml(imageUrl);
  const safeUrl = escapeHtml(pageUrl);

  const html = `<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${safeTitle}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeTitle}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeTitle}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeTitle}" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta http-equiv="refresh" content="0; url=${safeUrl}" />
  </head>
  <body>
    <p><a href="${safeUrl}">${safeTitle}</a></p>
  </body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Cache curto: permite que os robos revalidem quando a logo/nome mudarem,
  // sem martelar o backend a cada compartilhamento.
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).send(html);
};

export default { preview };
