import { Op } from "sequelize";
import sequelize from "../database";
import extractHelpImages from "../helpers/extractHelpImages";
import Help from "../models/Help";

export interface ExtractHelpImagesResult {
  scanned: number;
  changed: number;
  bytesBefore: number;
  bytesAfter: number;
}

/**
 * Move para arquivos as imagens `data:` que ainda estao embutidas nos artigos
 * da Central de Ajuda.
 *
 * Idempotente: depois de convertida, a linha deixa de casar com `%data:image%`.
 * Linhas que mantem imagem inline so porque ela e SVG ou base64 invalido casam
 * para sempre; elas voltam sem mudanca e nao sofrem `update`.
 *
 * Em dry run nada e lido do disco nem gravado: so conta as linhas candidatas e
 * o tamanho atual.
 *
 * So devolve contagens e bytes. O conteudo dos artigos nunca e impresso.
 */
export const runExtractHelpImages = async ({
  dryRun
}: {
  dryRun: boolean;
}): Promise<ExtractHelpImagesResult> => {
  const rows = await Help.findAll({
    where: { type: "article", content: { [Op.like]: "%data:image%" } },
    attributes: ["id", "content"]
  });

  const result: ExtractHelpImagesResult = {
    scanned: 0,
    changed: 0,
    bytesBefore: 0,
    bytesAfter: 0
  };

  // Uma linha por vez: o arquivo e gravado antes do update, entao uma falha no
  // meio deixa apenas arquivos sobrando (nomeados pelo hash) e um rerun conclui.
  await rows.reduce(async (previous, row) => {
    await previous;

    const before = Buffer.byteLength(row.content);
    result.scanned += 1;
    result.bytesBefore += before;

    if (dryRun) {
      result.bytesAfter += before;
      return;
    }

    const content = await extractHelpImages(row.content);

    if (content === row.content) {
      result.bytesAfter += before;
      return;
    }

    await row.update({ content });
    result.changed += 1;
    result.bytesAfter += Buffer.byteLength(content);
  }, Promise.resolve());

  return result;
};

const run = async (): Promise<void> => {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const result = await runExtractHelpImages({ dryRun });

  console.log(
    JSON.stringify({ mode: dryRun ? "dry-run" : "apply", ...result })
  );
};

if (require.main === module) {
  run()
    .then(() => sequelize.close())
    .catch(async error => {
      console.error(error instanceof Error ? error.message : "failed");
      await sequelize.close();
      process.exit(1);
    });
}
