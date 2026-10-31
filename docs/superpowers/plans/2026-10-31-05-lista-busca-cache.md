# Lista, busca de atendimentos e cache de configurações: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer cada página trazer de fato 40 atendimentos, levar a busca de 252 ms para menos de 50 ms e evitar leituras repetidas de configurações.

**Architecture:** A listagem passa a ter duas etapas: uma consulta enxuta escolhe os ids da página, e outra carrega os dados relacionados desses ids. A busca em mensagens vira uma subconsulta apoiada em índices `pg_trgm`. `GetCompanySetting` ganha um cache em memória de 30 s.

**Tech Stack:** TypeScript, Sequelize 6, Postgres 18 com `pg_trgm`, Jest.

**Spec:** `/root/relatorio-performance-espaco-whats/relatorio.html`, passos 6 e 7 do plano. Índice: `2026-10-31-00-indice-performance.md`.

## Global Constraints

- Branch `perf/tickets-search`, a partir de `origin/deploy`.
- O banco é compartilhado com a AC Norte e ela roda as mesmas migrations ao subir: `IF NOT EXISTS` em tudo. Índices com `CREATE INDEX CONCURRENTLY`, para não bloquear escrita.
- `ListTicketsService` mantém o retorno `{ tickets, count: null }`, e a ordem `updatedAt DESC, id DESC`. `ListTicketsServiceKanban` mantém `{ tickets, count, hasMore }`.
- Todo termo de busca chega ao SQL escapado e com `%`, `_` e `\` tratados como texto.
- Testes sem banco: `cd backend && npx jest <arquivo> --coverage=false`.

## Review Focus

- Busca com `%` ou `_` no termo: encontra o caractere literal, sem casar tudo. Coberto por `escapes like wildcards`.
- Busca com aspas ou tentativa de SQL: o termo não altera a consulta. Coberto por `escapes quotes in the message subquery`.
- Atendimento de outra empresa nunca aparece na busca por mensagem: a subconsulta filtra `companyId`. Coberto por `scopes the message subquery to the company`.
- Página sem resultados: sem segunda consulta e sem erro de `IN ()`. Coberto por `returns empty without loading relations`.
- Configuração alterada por outro runtime: fica desatualizada por no máximo 30 s. Coberto por `expires after the ttl`; em `UpdateSettingService`, a invalidação local é imediata e coberta por teste.

---

### Task 1: Paginação em duas etapas na lista

**Files:**
- Create: `backend/src/services/TicketServices/loadTicketPage.ts`
- Create: `backend/src/services/TicketServices/__tests__/loadTicketPage.spec.ts`
- Modify: `backend/src/services/TicketServices/ListTicketsService.ts` (consulta final)
- Modify: `backend/src/services/TicketServices/ListTicketsServiceKanban.ts:216-226`

**Interfaces:**
- Produces: `loadTicketPage({ where, include, filterInclude, limit, offset }: { where: Filterable["where"]; include: Includeable[]; filterInclude: Includeable[]; limit?: number; offset?: number }): Promise<Ticket[]>`, ordenado por `updatedAt DESC, id DESC`.

- [ ] **Step 1: Write the failing tests**, com `Ticket` mockado.

```ts
it("limits ticket ids instead of joined rows", async () => {
  (Ticket.findAll as jest.Mock)
    .mockResolvedValueOnce([{ id: 2 }, { id: 1 }])
    .mockResolvedValueOnce([full1, full2]);
  await loadTicketPage({ where: { companyId: 9 }, include: [tags], filterInclude: [], limit: 40 });
  const [idQuery, dataQuery] = (Ticket.findAll as jest.Mock).mock.calls.map(c => c[0]);
  expect(idQuery.limit).toBe(40);
  expect(idQuery.attributes).toEqual(["id"]);
  expect(idQuery.include).toEqual([]);
  expect(dataQuery.limit).toBeUndefined();
  expect(dataQuery.where).toEqual({ id: [2, 1] });
  expect(dataQuery.include).toEqual([tags]);
});

it("returns tickets in the id query order", async () => {
  (Ticket.findAll as jest.Mock)
    .mockResolvedValueOnce([{ id: 2 }, { id: 1 }])
    .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
  const page = await loadTicketPage({ where: {}, include: [], filterInclude: [], limit: 40 });
  expect(page.map(t => t.id)).toEqual([2, 1]);
});

it("returns empty without loading relations", async () => {
  (Ticket.findAll as jest.Mock).mockResolvedValueOnce([]);
  await expect(loadTicketPage({ where: {}, include: [], filterInclude: [], limit: 40 })).resolves.toEqual([]);
  expect(Ticket.findAll).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/services/TicketServices/__tests__/loadTicketPage.spec.ts --coverage=false`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Implement `loadTicketPage`**

Primeira consulta: `attributes: ["id"]`, `where`, `include: filterInclude`, `limit`, `offset`, a ordem acima e `subQuery: false`. `filterInclude` traz somente associações `belongsTo` citadas no `where`, com `attributes: []`, então não multiplica linhas. Segunda consulta: `where: { id: ids }`, `include`, sem limite. Reordene o resultado pelos ids.

- [ ] **Step 4: Use it in both services**

Em `ListTicketsService`, `filterInclude` é `[{ model: Contact, as: "contact", attributes: [] }]` quando há `searchParam` e `[]` nos demais casos. No Kanban, calcule o total com `Ticket.count({ where, include: filterInclude, distinct: true, col: "id" })` e carregue a página com `loadTicketPage`. Mantenha `hasMore = count > offset + tickets.length`.

- [ ] **Step 5: Run the ticket tests and verify they pass**

Run: `cd backend && npx jest src/services/TicketServices --coverage=false`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/TicketServices
git commit -m "fix(tickets): paginate by ticket instead of joined rows

LIMIT 40 applied to joined rows returned 15 tickets per page at AC Norte, where
contacts have many custom fields. Proved by loadTicketPage specs."
```

### Task 2: Busca com índices de trigramas

**Files:**
- Create: `backend/src/database/migrations/20261101090000-add-trigram-search-indexes.ts`
- Create: `backend/src/services/TicketServices/ticketSearchFilter.ts`
- Create: `backend/src/services/TicketServices/__tests__/ticketSearchFilter.spec.ts`
- Modify: `backend/src/services/TicketServices/ListTicketsService.ts:177-225`
- Modify: `backend/src/services/TicketServices/ListTicketsServiceKanban.ts:93-125`

**Interfaces:**
- Consumes: `filterInclude` da Task 1.
- Produces: `buildTicketSearchFilter(term: string, companyId: number): WhereOptions<Ticket>`.

- [ ] **Step 1: Write the failing tests**

```ts
const sql = (term: string) => JSON.stringify(buildTicketSearchFilter(term, 9), literalReplacer);

it("scopes the message subquery to the company", () => {
  expect(sql("boleto")).toContain('"companyId" = 9');
  expect(sql("boleto")).toContain("%boleto%");
});

it("lowercases the term", () => {
  expect(sql("BOLETO")).toContain("%boleto%");
});

it("escapes like wildcards", () => {
  expect(sql("50%_off")).toContain("%50\\%\\_off%");
});

it("escapes quotes in the message subquery", () => {
  expect(sql("o'brien")).not.toMatch(/o'brien/);
});
```

`literalReplacer` converte `Literal` em texto. O teste usa o `sequelize.escape` real do dialeto Postgres, sem conexão.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/services/TicketServices/__tests__/ticketSearchFilter.spec.ts --coverage=false`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Implement the filter**

Devolve um `Op.or` com: `LOWER(contact.name) LIKE`, `contact.number LIKE` e `id IN (SELECT "ticketId" FROM "Messages" WHERE "companyId" = <c> AND LOWER(body) LIKE <termo escapado>)` via `literal`. Escape `\`, `%` e `_` antes de montar o padrão, e use `sequelize.escape` no literal.

- [ ] **Step 4: Use the filter in both services**

Remova o `include` de `Message` com `as: "messages"` e o `"$message.body$"`. Confirme antes que o frontend não lê esse campo: `git grep -nE 'ticket\.messages|\.messages\[' frontend/src`. Se houver leitura, pare e registre, porque a decisão de remoção deixa de valer.

- [ ] **Step 5: Create the migration**

`up`, com cada comando em chamada própria e sem transação: `CREATE EXTENSION IF NOT EXISTS pg_trgm`; `CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_body_lower_trgm ON "Messages" USING gin (lower(body) gin_trgm_ops)`; `CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_name_lower_trgm ON "Contacts" USING gin (lower(name) gin_trgm_ops)`; `CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_number_trgm ON "Contacts" USING gin (number gin_trgm_ops)`. `down`: remove os índices e mantém a extensão.

- [ ] **Step 6: Run the migration against a disposable database**

Run: `docker run -d --rm --name pg-perf-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=ticketz_test -p 55432:5432 postgres:18-alpine`. Depois, em `backend`: `npm run build` e `DB_DIALECT=postgres DB_HOST=localhost DB_PORT=55432 DB_USER=postgres DB_PASS=test DB_NAME=ticketz_test npx sequelize db:migrate --config dist/config/database.js --migrations-path dist/database/migrations`. Por fim: `docker rm -f pg-perf-test`.
Expected: todas as migrations aplicadas e `20261101090000-add-trigram-search-indexes` concluída sem erro de transação.

- [ ] **Step 7: Run tests and commit**

Run: `cd backend && npx jest src/services/TicketServices --coverage=false && npx tsc --noEmit`
Expected: PASS.

```bash
git add backend/src/database/migrations/20261101090000-add-trigram-search-indexes.ts backend/src/services/TicketServices
git commit -m "perf(tickets): index text search with pg_trgm

Search took 252 ms with sequential scans and grows with message volume. Also
treats % and _ in the search term as literal text. Proved by filter specs."
```

### Task 3: Cache curto de configurações

**Files:**
- Modify: `backend/src/helpers/CheckSettings.ts:30-47`
- Create: `backend/src/helpers/__tests__/CheckSettings.cache.spec.ts`
- Modify: `backend/src/services/SettingServices/UpdateSettingService.ts`
- Modify: `backend/src/queues.ts:569` e `:660`

**Interfaces:**
- Produces, em `CheckSettings.ts`: `invalidateCompanySetting(companyId: number, key: string): void` e `clearCompanySettingCache(): void`. `GetCompanySetting` mantém a assinatura.

- [ ] **Step 1: Write the failing tests**, com `Setting` mockado, `jest.useFakeTimers()` e `clearCompanySettingCache()` no `beforeEach`.

```ts
it("reads the database once within the ttl", async () => {
  (Setting.findOne as jest.Mock).mockResolvedValue({ value: "a" });
  await GetCompanySetting(9, "k", "d");
  await GetCompanySetting(9, "k", "d");
  expect(Setting.findOne).toHaveBeenCalledTimes(1);
});

it("expires after the ttl", async () => {
  (Setting.findOne as jest.Mock).mockResolvedValue({ value: "a" });
  await GetCompanySetting(9, "k", "d");
  jest.advanceTimersByTime(30001);
  await GetCompanySetting(9, "k", "d");
  expect(Setting.findOne).toHaveBeenCalledTimes(2);
});

it("does not share values between companies", async () => {
  (Setting.findOne as jest.Mock)
    .mockResolvedValueOnce({ value: "a" })
    .mockResolvedValueOnce({ value: "b" });
  expect(await GetCompanySetting(9, "k", "d")).toBe("a");
  expect(await GetCompanySetting(10, "k", "d")).toBe("b");
});

it("caches a missing setting and still applies each caller default", async () => {
  (Setting.findOne as jest.Mock).mockResolvedValue(null);
  expect(await GetCompanySetting(9, "k", "x")).toBe("x");
  expect(await GetCompanySetting(9, "k", "y")).toBe("y");
  expect(Setting.findOne).toHaveBeenCalledTimes(1);
});

it("still throws for a missing setting without default", async () => {
  (Setting.findOne as jest.Mock).mockResolvedValue(null);
  await expect(GetCompanySetting(9, "k")).rejects.toThrow("ERR_NO_SETTING_FOUND");
});

it("reads again after invalidation", async () => {
  (Setting.findOne as jest.Mock).mockResolvedValue({ value: "a" });
  await GetCompanySetting(9, "k", "d");
  invalidateCompanySetting(9, "k");
  await GetCompanySetting(9, "k", "d");
  expect(Setting.findOne).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/helpers/__tests__/CheckSettings.cache.spec.ts --coverage=false`
Expected: FAIL, `clearCompanySettingCache is not a function`.

- [ ] **Step 3: Implement the cache**

`Map` com chave `${companyId}:${key}` e valor `{ value: string | null; expiresAt: number }`. TTL de 30000 ms. Remova a entrada ao expirar e limpe tudo se passar de 5.000 entradas.

- [ ] **Step 4: Invalidate on writes**

Chame `invalidateCompanySetting` em `UpdateSettingService`, após a transação, e nos dois `Setting.destroy` de `queues.ts`. Nesses dois, use `clearCompanySettingCache()` se a remoção não tiver uma chave única. `SignupBrandingService` cria configurações de empresa nova, ainda não lidas, então não precisa.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest src/helpers src/services/SettingServices --coverage=false && npx tsc --noEmit`
Expected: PASS. Testes em outras pastas mockam `CheckSettings`, então não dependem do cache.

- [ ] **Step 6: Commit**

```bash
git add backend/src/helpers backend/src/services/SettingServices/UpdateSettingService.ts backend/src/queues.ts
git commit -m "perf(settings): cache company settings for 30 seconds

Each lookup hit the database, 28 reads per minute today and growing with
tenants. Writes invalidate locally; other runtimes converge within 30 s."
```
