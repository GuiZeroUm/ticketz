# Laço de cobrança da AC Norte: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parar de reprocessar a cada minuto as cobranças já projetadas na conversa, eliminando cerca de 90% das transações do banco.

**Architecture:** A tabela `SgaBillingDeliveries` ganha a coluna `visibilitySyncedAt`. O ciclo de `startSgaBilling` lê só as linhas com essa coluna nula, e cada linha é marcada depois de processada. As 2.600 linhas existentes não recebem backfill: drenam pelo próprio ciclo em cerca de 6 minutos e reexecutam a lógica uma última vez.

**Tech Stack:** TypeScript, Sequelize 6, Postgres 18, Jest.

**Spec:** `/root/relatorio-performance-espaco-whats/relatorio.html`, passo 1 do plano. Índice: `2026-10-31-00-indice-performance.md`.

## Global Constraints

- Branch `perf/acnorte-billing-loop`, a partir de `origin/acnorte`. O código de cobrança não existe em `deploy` nem em `main`.
- O banco é compartilhado com a produção principal, e os dois runtimes rodam `db:migrate` ao subir. A migration precisa ser só aditiva e idempotente.
- Falha de envio ou projeção nunca pode impedir nova tentativa: uma linha só é marcada depois que a projeção termina sem exceção.
- Testes sem banco: `cd backend && npx jest <arquivo> --coverage=false`. Antes de cada commit: `npx eslint --fix` nos arquivos alterados.

## Review Focus

- Processo cai entre a projeção e a marcação: a linha reprocessa no ciclo seguinte sem duplicar mensagem nem tag. Coberto por `does not mark when projection throws` mais os `findOrCreate` já existentes.
- Contato ou conexão apagados depois do envio: a linha é marcada e sai da fila, sem retentar para sempre. Coberto por `marks deliveries whose contact no longer exists`.
- Uma linha que sempre falha não pode bloquear as demais do mesmo ciclo. Coberto por `keeps processing after one delivery throws`.
- Envio novo durante um ciclo em andamento: a linha entra no próximo ciclo. O filtro por coluna nula resolve; nenhuma lógica extra.
- Tag de cobrança removida à mão por um atendente: hoje volta em até um minuto, e depois desta mudança deixa de voltar. É mudança de comportamento desejada e deve constar na mensagem do commit.

---

### Task 1: Marcar cobranças projetadas e ler só as pendentes

**Files:**
- Create: `backend/src/database/migrations/20261101080000-add-visibility-synced-at-to-sga-billing.ts`
- Modify: `backend/src/services/SgaBillingServices/visibility.ts:272-289`
- Modify: `backend/src/services/SgaBillingServices/service.ts:564-573` e `:781-787`
- Test: `backend/src/services/SgaBillingServices/__tests__/visibility.spec.ts`

**Interfaces:**
- Produces, em `visibility.ts`:
  - `markBillingVisibilitySynced(delivery: Pick<BillingDelivery, "id" | "companyId">): Promise<void>`
  - `listPendingBillingVisibility(companyId: number): Promise<BillingDelivery[]>`
  - `syncSentBillingVisibility(deliveries: BillingDelivery[]): Promise<void>` mantém a assinatura

- [ ] **Step 1: Write the failing tests** em `visibility.spec.ts`. O `jest.mock` do banco já expõe `sequelize.query`. Importe `syncSentBillingVisibility`, `listPendingBillingVisibility`.

```ts
const marks = () =>
  (sequelize.query as jest.Mock).mock.calls.filter(([sql]) =>
    String(sql).includes('SET "visibilitySyncedAt"')
  );

it("marks a delivery after projecting it", async () => {
  await syncSentBillingVisibility([delivery]);
  expect(marks()).toHaveLength(1);
  expect(marks()[0][1].replacements).toEqual({ id: delivery.id, companyId: 9 });
});

it("does not mark when projection throws", async () => {
  (Tag.findOrCreate as jest.Mock).mockRejectedValueOnce(new Error("db"));
  await syncSentBillingVisibility([delivery]);
  expect(marks()).toHaveLength(0);
});

it("keeps processing after one delivery throws", async () => {
  (Tag.findOrCreate as jest.Mock).mockRejectedValueOnce(new Error("db"));
  await syncSentBillingVisibility([delivery, { ...delivery, id: "other" }]);
  expect(marks()).toHaveLength(1);
  expect(marks()[0][1].replacements.id).toBe("other");
});

it("marks deliveries whose contact no longer exists", async () => {
  (Contact.findOne as jest.Mock).mockResolvedValueOnce(null);
  await syncSentBillingVisibility([delivery]);
  expect(marks()).toHaveLength(1);
});

it("lists only deliveries still pending projection", async () => {
  (sequelize.query as jest.Mock).mockResolvedValueOnce([]);
  await listPendingBillingVisibility(9);
  const [sql, options] = (sequelize.query as jest.Mock).mock.calls[0];
  expect(sql).toContain('"visibilitySyncedAt" IS NULL');
  expect(sql).toContain("status='SENT'");
  expect(sql).toContain("LIMIT 500");
  expect(options.replacements).toEqual({ companyId: 9 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/services/SgaBillingServices/__tests__/visibility.spec.ts --coverage=false`
Expected: FAIL, `listPendingBillingVisibility is not a function`.

- [ ] **Step 3: Implement in `visibility.ts`**

`markBillingVisibilitySynced` executa `UPDATE "SgaBillingDeliveries" SET "visibilitySyncedAt" = clock_timestamp() WHERE id = :id AND "companyId" = :companyId`. `listPendingBillingVisibility` move para cá a consulta de `service.ts:784`, adicionando `AND "visibilitySyncedAt" IS NULL` e mantendo `ORDER BY id DESC LIMIT 500`, com `type: QueryTypes.SELECT`. Em `syncSentBillingVisibility`, chame `markBillingVisibilitySynced` dentro do `try`, logo após `syncBillingDeliveryVisibility`.

- [ ] **Step 4: Update `service.ts`**

No ciclo de `startSgaBilling`, troque a consulta por `listPendingBillingVisibility(companyId)`. No envio imediato (linha 564), chame `markBillingVisibilitySynced` após o `syncBillingDeliveryVisibility`, dentro do mesmo `try`.

- [ ] **Step 5: Create the migration**

`up`: `addColumn("SgaBillingDeliveries", "visibilitySyncedAt", { type: DataTypes.DATE, allowNull: true })`, seguido de `CREATE INDEX IF NOT EXISTS sga_billing_deliveries_visibility_pending ON "SgaBillingDeliveries" ("companyId", id DESC) WHERE status = 'SENT' AND "visibilitySyncedAt" IS NULL AND "messageId" IS NOT NULL AND "contactId" IS NOT NULL`. `down`: remove o índice e a coluna. Siga o formato de `20261027150000-user-group-access.ts`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest src/services/SgaBillingServices --coverage=false`
Expected: PASS em todos os specs da pasta, incluindo `service.spec.ts`. Se `service.spec.ts` mockar `../visibility`, acrescente as duas funções novas ao mock.

- [ ] **Step 7: Build, lint and commit**

Run: `cd backend && npx tsc --noEmit && npx eslint --fix src/services/SgaBillingServices/*.ts`
Expected: sem erros.

```bash
git add backend/src/database/migrations/20261101080000-add-visibility-synced-at-to-sga-billing.ts backend/src/services/SgaBillingServices
git commit -m "fix(acnorte): stop reprocessing projected billing deliveries every minute

The cycle re-ran 5 to 8 queries for the 500 latest SENT deliveries, about
90% of all database transactions. Deliveries are now marked once projected.
A billing tag removed by hand no longer comes back within a minute."
```
