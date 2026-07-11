import fs from "fs";
import path from "path";
import uploadConfig from "../config/upload";
import { logger } from "../utils/logger";

// Armazenamento de arquivos de branding por empresa (tenant).
//
// Objetivo: evitar acumulo de arquivos no disco quando uma empresa reenvia
// varias vezes o mesmo logo/favicon/imagem de login. Cada chave de branding
// tem um prefixo fixo e os arquivos ficam em public/branding/<companyId>/.
// Ao salvar um novo arquivo, os anteriores da mesma chave (e o arquivo
// referenciado pelo valor atual do setting) sao removidos. Mantemos um
// timestamp no nome para cache-busting no navegador/CDN (o valor do setting
// muda a cada upload, forcando o front a recarregar a imagem nova).

const publicFolder = uploadConfig.directory;

// Mapeia a chave do setting -> prefixo fixo do arquivo no disco.
const PREFIX_BY_KEY: Record<string, string> = {
  appLogoLight: "logo_light",
  appLogoDark: "logo_dark",
  appLogoFavicon: "favicon",
  loginSidePanelImage: "login_side",
  loginBackgroundContent: "login_background"
};

export const isBrandingKey = (key: string): boolean => key in PREFIX_BY_KEY;

const tenantDir = (companyId: number): string =>
  path.join(publicFolder, "branding", String(companyId));

// Remove com seguranca um arquivo cujo caminho relativo esteja dentro de
// publicFolder (protege contra path traversal em valores vindos do banco).
const safeRemoveRelative = (relativeValue?: string | null): void => {
  if (!relativeValue) {
    return;
  }

  // Remove querystring eventual e normaliza.
  const clean = relativeValue.split("?")[0].trim();
  if (!clean) {
    return;
  }

  const abs = path.resolve(publicFolder, clean);
  const base = path.resolve(publicFolder);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    return; // fora do publicFolder — ignora
  }

  fs.promises.unlink(abs).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") {
      logger.warn({ err }, `Falha ao remover arquivo de branding: ${clean}`);
    }
  });
};

// Salva o arquivo (ja gravado pelo multer em publicFolder de forma temporaria)
// no diretorio do tenant com nome padronizado, removendo os antigos.
// Retorna o caminho relativo a ser guardado no setting (usado como
// /public/<retorno>).
export const storeBrandingFile = async (
  companyId: number,
  settingKey: string,
  file: Express.Multer.File,
  previousValue?: string | null
): Promise<string> => {
  const prefix = PREFIX_BY_KEY[settingKey];

  if (!prefix) {
    // Chave nao mapeada: mantem o comportamento antigo (arquivo flat).
    return file.filename;
  }

  const dir = tenantDir(companyId);
  await fs.promises.mkdir(dir, { recursive: true });

  // 1) Remove o arquivo referenciado pelo valor atual (pode ser um arquivo
  //    "flat" do esquema antigo ou um branding/<id>/... anterior).
  safeRemoveRelative(previousValue);

  // 2) Remove quaisquer arquivos remanescentes do mesmo prefixo neste tenant.
  try {
    const entries = await fs.promises.readdir(dir);
    await Promise.all(
      entries
        .filter(name => name.startsWith(`${prefix}-`) || name === prefix)
        .map(name =>
          fs.promises
            .unlink(path.join(dir, name))
            .catch((err: NodeJS.ErrnoException) => {
              if (err.code !== "ENOENT") {
                logger.warn({ err }, `Falha ao limpar branding antigo: ${name}`);
              }
            })
        )
    );
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") {
      logger.warn({ err }, "Falha ao listar diretorio de branding do tenant");
    }
  }

  // 3) Move o arquivo temporario para o destino final com nome padronizado.
  const ext = path.extname(file.originalname) || path.extname(file.filename);
  const finalName = `${prefix}-${new Date().getTime()}${ext}`;
  const finalAbs = path.join(dir, finalName);
  const tmpAbs = path.join(publicFolder, file.filename);

  await fs.promises.rename(tmpAbs, finalAbs);

  return path.join("branding", String(companyId), finalName);
};

export default storeBrandingFile;
