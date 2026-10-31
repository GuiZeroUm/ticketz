# Imagens da Ajuda fora do banco: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar os 70 MB de imagens em base64 da tabela `Helps`, gravando-as como arquivos, e impedir que novas imagens entrem no banco.

**Architecture:** Um helper puro encontra as imagens no HTML, grava cada uma em `public/help/` com nome baseado no conteúdo e devolve o HTML com URLs. O `HelpController` usa o helper ao salvar, e um script idempotente migra as linhas existentes. Com o HTML pequeno, as listagens deixam de pesar sem mudar nenhuma consulta.

**Tech Stack:** TypeScript, sanitize-html, Node `fs/promises`, Jest.

**Spec:** `/root/relatorio-performance-espaco-whats/relatorio.html`, passo 4 do plano. Índice: `2026-10-31-00-indice-performance.md`.

## Global Constraints

- Branch `perf/help-images`, a partir de `origin/deploy`.
- Só extrair `png`, `jpeg`, `gif` e `webp`. SVG fica de fora: servido como arquivo próprio no mesmo domínio, poderia executar script.
- Nome do arquivo: `sha256` do conteúdo decodificado, em hexadecimal, mais a extensão. O mesmo conteúdo gera o mesmo arquivo.
- URL gravada: absoluta, `${process.env.BACKEND_URL}/public/help/<nome>`. A tabela é compartilhada com a AC Norte, que tem outro volume e outro domínio, então a URL precisa funcionar a partir de qualquer tenant.
- O arquivo é escrito antes de o banco ser atualizado, e por escrita atômica (arquivo temporário seguido de `rename`).

## Review Focus

- Base64 inválido ou truncado: o helper mantém o HTML original daquela imagem, sem lançar erro e sem gerar arquivo corrompido. Coberto por `keeps an image whose base64 is invalid`.
- Script interrompido no meio: rodar de novo termina o trabalho sem duplicar arquivos. Coberto por `is idempotent` e pelo nome baseado em conteúdo.
- Artigo com imagem repetida: um único arquivo e as duas referências trocadas. Coberto por `reuses one file for a repeated image`.
- Pasta `help/` ainda inexistente no volume: o helper cria com `mkdir recursive`. Coberto no teste principal, que parte de diretório vazio.
- Falha de disco ao gravar: salvar o artigo retorna erro e nada é alterado no banco. Coberto por `propagates a write failure`.

---

### Task 1: Extrair imagens ao salvar artigos

**Files:**
- Create: `backend/src/helpers/extractHelpImages.ts`
- Create: `backend/src/helpers/__tests__/extractHelpImages.spec.ts`
- Modify: `backend/src/controllers/HelpController.ts:126`

**Interfaces:**
- Produces: `extractHelpImages(html: string, directory?: string): Promise<string>`. O padrão de `directory` é `path.join(uploadConfig.directory, "help")`.

- [ ] **Step 1: Write the failing tests**, usando um diretório criado com `fs.mkdtemp` e `process.env.BACKEND_URL = "https://api.test/backend"`.

```ts
const png = Buffer.from("fake-png").toString("base64");
const img = `<p><img src="data:image/png;base64,${png}" alt="a"></p>`;

it("writes the image and rewrites the src", async () => {
  const out = await extractHelpImages(img, dir);
  const name = `${sha256Hex("fake-png")}.png`;
  expect(out).toBe(`<p><img src="https://api.test/backend/public/help/${name}" alt="a"></p>`);
  expect((await fs.readFile(path.join(dir, name))).toString()).toBe("fake-png");
});

it("reuses one file for a repeated image", async () => {
  const out = await extractHelpImages(img + img, dir);
  expect(out).not.toContain("data:image");
  expect(await fs.readdir(dir)).toHaveLength(1);
});

it("is idempotent", async () => {
  const once = await extractHelpImages(img, dir);
  expect(await extractHelpImages(once, dir)).toBe(once);
});

it("leaves svg untouched", async () => {
  const svg = `<img src="data:image/svg+xml;base64,${png}">`;
  expect(await extractHelpImages(svg, dir)).toBe(svg);
});

it("keeps an image whose base64 is invalid", async () => {
  const bad = `<img src="data:image/png;base64,@@@">`;
  expect(await extractHelpImages(bad, dir)).toBe(bad);
  expect(await fs.readdir(dir)).toHaveLength(0);
});

it("propagates a write failure", async () => {
  await expect(extractHelpImages(img, path.join(fileNotDir, "x"))).rejects.toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/helpers/__tests__/extractHelpImages.spec.ts --coverage=false`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Implement `extractHelpImages`**

Regex: `/data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)/g`, com cuidado para não fazer backtracking em textos de 4 MB. Um base64 é válido se `Buffer.from(b64, "base64").toString("base64") === b64` depois de normalizar o preenchimento. Ao final, faça a substituição no HTML.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest src/helpers/__tests__/extractHelpImages.spec.ts --coverage=false`
Expected: PASS nos 6 testes.

- [ ] **Step 5: Use it in the controller**

Em `HelpController.ts:126`: `const content = type === "article" ? await extractHelpImages(sanitizeHelpContent(data.content)) : null;`. Confirme que a função que contém essa linha é `async`; os chamadores já estão em handlers assíncronos, então adicione os `await` que faltarem.

- [ ] **Step 6: Run the help tests and commit**

Run: `cd backend && npx jest src/controllers src/services/HelpServices src/helpers --coverage=false && npx tsc --noEmit`
Expected: PASS.

```bash
git add backend/src/helpers backend/src/controllers/HelpController.ts
git commit -m "fix(help): store article images as files instead of base64 in the database

Help rows hold up to 4.3 MB of inline images, 47% of the database, and this
data coincided with the 9 GB memory peak in October. Proved by extractHelpImages specs."
```

### Task 2: Script de migração das linhas existentes

**Files:**
- Create: `backend/src/scripts/ExtractHelpImages.ts`
- Create: `backend/src/scripts/__tests__/ExtractHelpImages.spec.ts`
- Modify: `backend/package.json` (script `help:extract-images`)

**Interfaces:**
- Consumes: `extractHelpImages` da Task 1.
- Produces: `runExtractHelpImages(options: { dryRun: boolean }): Promise<{ scanned: number; changed: number; bytesBefore: number; bytesAfter: number }>`, com execução por `node dist/scripts/ExtractHelpImages.js [--dry-run]`.

- [ ] **Step 1: Write the failing tests**, com `Help` mockado seguindo o padrão de `jest.mock` dos specs existentes.

```ts
it("updates only rows that still hold inline images", async () => {
  (Help.findAll as jest.Mock).mockResolvedValue([inlineRow, cleanRow]);
  const result = await runExtractHelpImages({ dryRun: false });
  expect(inlineRow.update).toHaveBeenCalledTimes(1);
  expect(cleanRow.update).not.toHaveBeenCalled();
  expect(result).toMatchObject({ scanned: 2, changed: 1 });
});

it("writes nothing on dry run", async () => {
  (Help.findAll as jest.Mock).mockResolvedValue([inlineRow]);
  await runExtractHelpImages({ dryRun: true });
  expect(inlineRow.update).not.toHaveBeenCalled();
  expect(extractHelpImages).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/scripts/__tests__/ExtractHelpImages.spec.ts --coverage=false`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Implement the script**

`Help.findAll({ where: { type: "article", content: { [Op.like]: "%data:image%" } }, attributes: ["id", "content"] })`. Processe uma linha por vez, sem carregar tudo em paralelo, e imprima só contagens e bytes, nunca o conteúdo. Siga o padrão de `scripts/ActivateWhatsappGroups.ts` para inicializar o banco e encerrar o processo. Adicione `"help:extract-images": "node dist/scripts/ExtractHelpImages.js"` ao `package.json`.

- [ ] **Step 4: Run tests and commit**

Run: `cd backend && npx jest src/scripts/__tests__/ExtractHelpImages.spec.ts --coverage=false && npx tsc --noEmit`
Expected: PASS.

```bash
git add backend/src/scripts backend/package.json
git commit -m "feat(help): add idempotent script to move existing inline images to files

Run once in production by the release plan. Rerunning skips migrated rows."
```
