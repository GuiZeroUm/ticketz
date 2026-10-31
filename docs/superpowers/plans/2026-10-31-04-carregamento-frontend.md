# Carregamento do frontend: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o login aparecer em até 4 s em 4G, carregando cada tela sob demanda, e reduzir requisições repetidas e trabalho de renderização na tela de atendimentos.

**Architecture:** Todas as páginas em `routes/index.js` passam para `React.lazy`, com um wrapper que recarrega a página uma vez se o chunk não existir mais após um deploy. Bibliotecas pesadas (pdf.js, emoji-mart) saem da importação direta. A conversa usa `content-visibility` em vez de virtualização, e fotos e contagem de grupos deixam de repetir pedidos.

**Tech Stack:** React 17, CRA 5 com craco, Material-UI 4, Jest.

**Spec:** `/root/relatorio-performance-espaco-whats/relatorio.html`, passo 5 do plano e parte do passo 6. Índice: `2026-10-31-00-indice-performance.md`.

## Global Constraints

- Branch `perf/frontend-load`, a partir de `origin/deploy`.
- Sem dependências novas.
- Metas, medidas pelo plano 6 com `scripts/perf/measure-login.js`: LCP em 4G de até 4 s (hoje 9,2 s) e, no login, nenhum chunk com pdf.js ou recharts baixado.
- Testes: `cd frontend && CI=true npx craco test --watchAll=false <arquivo>`. Antes de commitar: `npx prettier --write` nos arquivos alterados.

## Review Focus

- Aba aberta durante um deploy: os chunks antigos deixam de existir e a navegação falharia com tela branca. O wrapper recarrega uma vez, sem entrar em laço. Coberto por `reloads once on a chunk load error` e `rethrows when already reloaded recently`.
- Abrir uma conversa precisa terminar no fim da lista, mesmo com alturas estimadas pelo `content-visibility`. Conferência manual na Task 3, com critério de reversão.
- Rota protegida sem sessão continua indo para o login, e a transição não pode mostrar o conteúdo protegido. Conferência manual na Task 1, porque `Route.js` continua carregado de imediato.
- Contato sem foto aparece em várias listas: um único pedido por sessão do navegador. Coberto por `requests a contact picture only once per session`.
- Rajada de eventos de socket na aba de grupos: uma única chamada após 1 s, e nenhuma depois de desmontar. Coberto por `coalesces bursts` e `cancels on unmount`.

---

### Task 1: Rotas sob demanda com recuperação de chunk ausente

**Files:**
- Create: `frontend/src/helpers/lazyWithReload.js`
- Create: `frontend/src/helpers/lazyWithReload.test.js`
- Modify: `frontend/src/routes/index.js:5-42`

**Interfaces:**
- Produces: `lazyWithReload(factory: () => Promise<{default: Component}>): React.LazyExoticComponent` e `loadWithReload(factory)`, a função testável que ele usa.

- [ ] **Step 1: Write the failing tests**

```js
const chunkError = Object.assign(new Error("x"), { name: "ChunkLoadError" });

it("resolves the module normally", async () => {
  const mod = { default: () => null };
  await expect(loadWithReload(() => Promise.resolve(mod))).resolves.toBe(mod);
});

it("reloads once on a chunk load error", async () => {
  loadWithReload(() => Promise.reject(chunkError));
  await flush();
  expect(reload).toHaveBeenCalledTimes(1);
});

it("rethrows when already reloaded recently", async () => {
  sessionStorage.setItem("chunk-reload-at", String(Date.now()));
  await expect(loadWithReload(() => Promise.reject(chunkError))).rejects.toBe(chunkError);
  expect(reload).not.toHaveBeenCalled();
});

it("rethrows unrelated errors without reloading", async () => {
  await expect(loadWithReload(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  expect(reload).not.toHaveBeenCalled();
});
```

`reload` é um mock de `window.location.reload`. A janela de "recente" é de 30 s, e o acesso ao `sessionStorage` fica em `try/catch`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx craco test --watchAll=false src/helpers/lazyWithReload.test.js`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Implement the helper**

Um erro de chunk é `error.name === "ChunkLoadError"` ou mensagem contendo `Loading chunk`. Ao recarregar, a promise fica pendente para o React não renderizar o erro.

- [ ] **Step 4: Convert the routes**

Troque por `lazyWithReload` todas as importações de `../pages/*` e `LoggedInLayout`, inclusive o `Fluxos` da linha 42. Mantenha imediatos `Route`, `PartnerRoutes` e os providers de contexto. Envolva o `<Switch>` da linha 58 em `<Suspense fallback={<BackdropLoading />}>`, reaproveitando o `Suspense` já existente onde houver.

- [ ] **Step 5: Run tests, build and inspect**

Run: `cd frontend && CI=true npx craco test --watchAll=false src/helpers src/routes && npm run build && ls -lS build/static/js/*.js | head -6`
Expected: testes PASS e o maior chunk abaixo dos 4,6 MB atuais, sem o código das páginas no chunk inicial.

- [ ] **Step 6: Check the flows in a browser**

Rode o build localmente (`npx serve -s build`) e confira: `/login` sem sessão renderiza; `/tickets` sem sessão redireciona para `/login` sem mostrar conteúdo; a rede não baixa chunks de páginas não visitadas.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/helpers/lazyWithReload* frontend/src/routes/index.js
git commit -m "perf(frontend): load every route on demand

Only 1 of 38 route imports was lazy, so login parsed 5.4 MB of JavaScript.
Tabs open during a deploy reload once instead of showing a blank screen."
```

### Task 2: Tirar pdf.js e emoji-mart do carregamento direto

**Files:**
- Modify: `frontend/src/components/MessagesList/index.js` (importação de `PdfPreview`)
- Modify: `frontend/src/components/MessageInputCustom/index.js:10`
- Modify: `frontend/src/components/MessageOptionsMenu/index.js:19`

**Interfaces:**
- Consumes: `lazyWithReload` da Task 1.

- [ ] **Step 1: Convert the imports**

Em `MessagesList`: `const PdfPreview = lazyWithReload(() => import("../PdfPreview"))`. Para o `Picker`, nos dois componentes: `lazyWithReload(() => import("emoji-mart").then(m => ({ default: m.Picker })))`. Mantenha estático o import do CSS do emoji-mart, se houver. Envolva cada uso em `<Suspense fallback={null}>`, renderizado apenas quando o painel ou o documento estiver visível.

- [ ] **Step 2: Run tests and build**

Run: `cd frontend && CI=true npx craco test --watchAll=false src/components/MessageInputCustom src/components/MessagesList src/components/MessageOptionsMenu && npm run build && for f in build/static/js/*.js; do grep -lq GlobalWorkerOptions "$f" && ls -l "$f"; done`
Expected: testes PASS, e o pdf.js em um chunk próprio.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MessagesList frontend/src/components/MessageInputCustom frontend/src/components/MessageOptionsMenu
git commit -m "perf(frontend): load pdf and emoji libraries only when opened

These were bundled for every conversation screen. Build shows pdf.js in its own chunk."
```

### Task 3: Menos trabalho repetido na tela de atendimentos

**Files:**
- Modify: `frontend/src/components/AvatarContato/index.js:37-55`
- Modify: `frontend/src/components/AvatarContato/AvatarContato.test.js`
- Modify: `frontend/src/components/TicketsManagerTabs/index.js:193-251`
- Create: `frontend/src/hooks/useTrailingCallback.js`
- Create: `frontend/src/hooks/useTrailingCallback.test.js`
- Modify: `frontend/src/components/MessagesList/index.js:1916` e estilos de `messageContainer`

**Interfaces:**
- Produces: `useTrailingCallback(callback: () => void, delayMs: number): () => void`. Cancela o timer ao desmontar.

- [ ] **Step 1: Write the failing tests**

```js
// AvatarContato.test.js
it("requests a contact picture only once per session", async () => {
  render(<AvatarContato contact={noPhoto} />);
  render(<AvatarContato contact={noPhoto} />);
  await flush();
  expect(api.post).toHaveBeenCalledTimes(1);
});

// useTrailingCallback.test.js, com jest.useFakeTimers()
it("coalesces bursts", () => {
  const cb = jest.fn();
  const { result } = renderHook(() => useTrailingCallback(cb, 1000));
  result.current(); result.current(); result.current();
  jest.advanceTimersByTime(1000);
  expect(cb).toHaveBeenCalledTimes(1);
});

it("cancels on unmount", () => {
  const cb = jest.fn();
  const { result, unmount } = renderHook(() => useTrailingCallback(cb, 1000));
  result.current();
  unmount();
  jest.advanceTimersByTime(1000);
  expect(cb).not.toHaveBeenCalled();
});
```

Para `AvatarContato`, exporte `resetPictureRefreshAttempts()` para limpar o estado entre testes. Se `@testing-library/react-hooks` não existir no projeto, use um componente de teste que exponha o callback, sem adicionar dependência.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx craco test --watchAll=false src/components/AvatarContato src/hooks/useTrailingCallback.test.js`
Expected: FAIL, dois pedidos de foto e hook inexistente.

- [ ] **Step 3: Implement**

Em `AvatarContato`, troque o `attempted` por instância por um `Set` de módulo com os `contact.id` já pedidos. Implemente `useTrailingCallback`. Em `TicketsManagerTabs`, mantenha a chamada imediata de montagem (linha 223) e use a versão de 1000 ms nos handlers de socket (linhas 229, 237, 241 e 247).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx craco test --watchAll=false src/components/AvatarContato src/components/TicketsManagerTabs src/hooks/useTrailingCallback.test.js`
Expected: PASS.

- [ ] **Step 5: Add content-visibility to messages**

No estilo `messageContainer` de `MessagesList`: `contentVisibility: "auto", containIntrinsicSize: "auto 80px"`.

- [ ] **Step 6: Check scrolling in a browser**

No ambiente de testes, abra um atendimento com mais de 300 mensagens e confirme: abre no fim; ao rolar para o topo, carrega a página anterior sem saltar; ao receber mensagem, desce até ela; responder uma citação leva à mensagem citada. Se qualquer um falhar, remova só as duas propriedades do Step 5 e registre o motivo.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AvatarContato frontend/src/components/TicketsManagerTabs frontend/src/hooks/useTrailingCallback* frontend/src/components/MessagesList/index.js
git commit -m "perf(frontend): stop repeated requests and offscreen rendering in tickets

Measured 2,376 picture refreshes and 3,721 group counts against 1,036 ticket
list loads in 3.3 days. Proved by specs and a manual conversation scroll check."
```
