import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import uploadConfig from "../config/upload";

// SVG fica de fora de proposito: servido como arquivo da mesma origem, um SVG
// pode executar script. Inline em <img> ele e inofensivo.
//
// A classe de caracteres e a repeticao `+` sao lineares: sem grupos aninhados
// nem alternancia depois do prefixo, entao nao ha backtracking catastrofico em
// um HTML de varios MB.
const DATA_IMAGE = /data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)/g;

const EXTENSIONS: Record<string, string> = {
  png: "png",
  jpeg: "jpg",
  gif: "gif",
  webp: "webp"
};

const stripPadding = (base64: string) => base64.replace(/=+$/, "");

// Buffer.from(..., "base64") ignora lixo em silencio; o ida e volta so fecha
// quando a entrada era base64 canonico.
const decodeBase64 = (base64: string): Uint8Array | null => {
  const buffer = Buffer.from(base64, "base64");

  if (
    buffer.length === 0 ||
    stripPadding(buffer.toString("base64")) !== stripPadding(base64)
  ) {
    return null;
  }

  return Uint8Array.from(buffer);
};

const exists = async (file: string) => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};

// Grava o arquivo inteiro antes de ele aparecer com o nome final: um leitor
// nunca ve imagem pela metade, e uma falha no meio nao deixa lixo com o nome
// definitivo.
const writeAtomically = async (file: string, content: Uint8Array) => {
  const temporary = `${file}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, file);
  } catch (err) {
    await fs.rm(temporary, { force: true });
    throw err;
  }
};

/**
 * Troca as imagens `data:` embutidas no HTML do artigo por arquivos em
 * `<directory>`, e reescreve o src para a URL publica.
 *
 * Os arquivos sao gravados antes de o chamador salvar o HTML, entao um erro de
 * disco derruba o salvamento em vez de deixar o artigo apontando para nada. O
 * nome e o sha256 do conteudo: a mesma imagem nunca e gravada duas vezes e
 * reprocessar um HTML ja convertido e um no-op.
 *
 * A URL e absoluta porque a tabela de ajuda e compartilhada com o AC Norte, que
 * tem outro volume e outro dominio.
 */
const extractHelpImages = async (
  html: string,
  directory: string = path.join(uploadConfig.directory, "help")
): Promise<string> => {
  const urlsBySource = new Map<string, string>();

  const matches = Array.from(html.matchAll(DATA_IMAGE));

  if (matches.length === 0) {
    return html;
  }

  await fs.mkdir(directory, { recursive: true });

  // Sequencial: um HTML grande com muitas imagens nao deve abrir centenas de
  // escritas simultaneas. A repeticao da mesma imagem cai no `has`.
  await matches.reduce(async (previous, [source, type, base64]) => {
    await previous;

    if (urlsBySource.has(source)) {
      return;
    }

    const content = decodeBase64(base64);

    if (!content) {
      return;
    }

    const hash = createHash("sha256").update(content).digest("hex");
    const name = `${hash}.${EXTENSIONS[type]}`;
    const file = path.join(directory, name);

    if (!(await exists(file))) {
      await writeAtomically(file, content);
    }

    urlsBySource.set(source, `${process.env.BACKEND_URL}/public/help/${name}`);
  }, Promise.resolve());

  return html.replace(DATA_IMAGE, source => urlsBySource.get(source) ?? source);
};

export default extractHelpImages;
