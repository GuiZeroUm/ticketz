# Release e verificação em produção: Implementation Plan

> **For agentic workers:** Este plano é executado pela sessão principal, em sequência, e não por subagentes. Cada tarefa muda produção e depende do resultado da anterior. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar os planos 1 a 5 para produção com backup, CI verde e rollback definido, e medir o resultado contra o relatório.

**Architecture:** `main` é atualizada com o que já está em `deploy`. As branches entram em `main` uma a uma, com CI, e o workflow de release avança `deploy`. Depois, `deploy` é integrada em `acnorte`, junto com a correção da cobrança, e o workflow da AC Norte avança `acnorte-deploy`.

**Tech Stack:** GitHub Actions, Dokploy, Docker Compose, Postgres 18.

**Spec:** `/root/relatorio-performance-espaco-whats/relatorio.html`. Índice: `2026-10-31-00-indice-performance.md`.

## Global Constraints

- Janela de deploy: fora do horário de pico (8h às 11h em Rio Branco), e nunca durante um envio de campanha.
- Sem `--force`. Os workflows usam `--force-with-lease`, e os pushes manuais são apenas fast-forward.
- Pare e relate ao usuário se: o CI falhar por motivo não entendido, um conflito de merge exigir decisão de produto, ou um healthcheck não ficar verde em 5 minutos.
- Nunca imprimir `.env` nem segredos em logs.

## Review Focus

- CI parado desde 13/10: pode falhar por algo já existente em `deploy`, sem relação com estes planos. A Task 2 isola isso antes de qualquer merge.
- Merge de `deploy` em `acnorte`, com 131 commits próprios: conflitos em `ListMessagesService`, `TicketServices` e migrations são prováveis. Resolver mantendo os dois lados e rodar os testes de cobrança e de atendimentos.
- Postgres reiniciado no deploy do plano 2: o backend da AC Norte precisa reconectar sozinho. Conferido na Task 4.
- Primeiro ciclo de cobrança depois do deploy: drena 2.600 linhas em cerca de 6 minutos, e depois disso a carga precisa cair. Conferido na Task 6.
- Script da Ajuda: não pode trocar URLs para um volume diferente do que serve o arquivo. Conferido com o carregamento real de uma imagem na Task 5.

---

### Task 1: Backup e medição de partida

- [ ] **Step 1: Back up the database**

Run: `mkdir -p /root/backups/espacowhats-perf-20261101 && docker exec espaco-whats-7oyzgd-postgres-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /root/backups/espacowhats-perf-20261101/postgres-before.dump && pg_restore --list /root/backups/espacowhats-perf-20261101/postgres-before.dump | wc -l`
Expected: arquivo de cerca de 70 MB, e a listagem com mais de 100 linhas.

- [ ] **Step 2: Record rollback targets**

Anote em `/root/backups/espacowhats-perf-20261101/shas.txt` os SHAs atuais de `deploy` (`1d2562c`) e `acnorte-deploy` (`4c132be`), confirmando com `git ls-remote`. Copie os dois arquivos de compose em uso.

- [ ] **Step 3: Measure the baseline**

Rode a partir da worktree da branch `perf/observability-limits`, onde os scripts existem nesse momento.

Run: `scripts/perf/sample-postgres.sh espaco-whats-7oyzgd-postgres-1 300 > /root/backups/espacowhats-perf-20261101/baseline-pg.txt` e `node scripts/perf/measure-login.js https://espacosingular.espacowhats.com.br/login /usr/bin/chromium-browser > /root/backups/espacowhats-perf-20261101/baseline-login.txt`
Expected: cerca de 40 transações por segundo e LCP de cerca de 9 s em 4G.

### Task 2: Colocar `main` em dia e provar o CI

- [ ] **Step 1: Fast-forward main**

Run: `git push origin 1d2562c38c828692bb22f35364c1a347ce85c1cd:refs/heads/main`
Expected: push aceito, sem `--force`. O push também dispara `Keep AC Norte aligned with main`, que pode abrir um PR. Esse PR será substituído pela Task 5.

- [ ] **Step 2: Wait for validation**

Run: `gh run list -R GuiZeroUm/ticketz --workflow ci-deploy.yml --branch main -L 1`
Expected: `success`. Se falhar, investigue e corrija em uma branch própria antes de seguir, e relate ao usuário o que estava quebrado.

### Task 3: Integrar os planos 2 a 5

- [ ] **Step 1: Merge one branch at a time**

Ordem: `perf/observability-limits`, `perf/help-images`, `perf/tickets-search`, `perf/frontend-load`. Para cada uma, abra um PR para `main`, espere o CI verde e faça o merge sem apagar a branch.

- [ ] **Step 2: Run a whole-branch review**

Antes do release, revise `git diff 1d2562c..origin/main` com um subagente revisor no modelo mais capaz. Corrija o que for confirmado, em um novo commit com CI verde.

- [ ] **Step 3: Validate in the dev environment**

Avance `dev` para esse commit, por fast-forward ou merge. Aguarde o deploy automático em `teste.dev.espacowhats.com.br` e confira: login, abrir conversa longa, buscar atendimento e rolar a lista até mais de 40 itens.

### Task 4: Liberar a produção principal

- [ ] **Step 1: Run the release workflow**

Run: `gh workflow run release-production.yml -R GuiZeroUm/ticketz -f release_sha=$(git rev-parse origin/main)`
Expected: `deploy` avança e o Dokploy inicia o deploy automaticamente. O Postgres é recriado por causa do plano 2.

- [ ] **Step 2: Watch the rollout**

Run: `docker ps --format '{{.Names}} {{.Status}}' | grep -E 'espaco-whats-7oyzgd|acnorte-production'`
Expected: todos `healthy` em até 5 minutos, inclusive o backend da AC Norte, sem novas falhas de conexão com o banco: `docker logs --since 5m espaco-whats-acnorte-production-acnorte-backend-1 2>&1 | grep -c ECONNREFUSED` deve parar de crescer.

- [ ] **Step 3: Finish observability setup**

Run: `docker exec -i espaco-whats-7oyzgd-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"'` e `docker inspect espaco-whats-7oyzgd-backend-1 --format '{{.HostConfig.Memory}} {{.HostConfig.RestartPolicy.Name}}'`
Expected: `CREATE EXTENSION` e `2147483648 on-failure`.

- [ ] **Step 4: Smoke test**

Confira: `https://espacowhats.com.br/backend/api/platform/v1/health` responde 200; login carrega; o log do frontend mostra `$request_time`. Se algo crítico falhar, reverta com o rollback da Task 7.

### Task 5: Migrar as imagens da Ajuda

- [ ] **Step 1: Dry run**

Run: `docker exec espaco-whats-7oyzgd-backend-1 npm run help:extract-images -- --dry-run`
Expected: `scanned` cerca de 50 e cerca de 70 MB em `bytesBefore`.

- [ ] **Step 2: Run it**

Run: `docker exec espaco-whats-7oyzgd-backend-1 npm run help:extract-images`
Expected: `bytesAfter` abaixo de 1 MB.

- [ ] **Step 3: Confirm real images load**

Pegue uma URL em `SELECT substring(content from 'https://[^"]+/public/help/[^"]+') FROM "Helps" WHERE id = 23` e confira com `curl -sI`.
Expected: `200` e `content-type: image/png`.

- [ ] **Step 4: Reclaim disk**

Run: `VACUUM (FULL, ANALYZE) "Helps"` via `psql`. O bloqueio dura segundos e afeta só a Ajuda.
Expected: `pg_total_relation_size('"Helps"')` abaixo de 2 MB.

### Task 6: Liberar a AC Norte

- [ ] **Step 1: Merge**

Em uma worktree a partir de `origin/acnorte`: faça merge de `origin/deploy` e de `perf/acnorte-billing-loop`. Na branch `perf/acnorte-release`, resolva conflitos conforme a Review Focus. Abra um PR para `acnorte` e espere o CI verde.

Run: `cd backend && npx jest src/services/SgaBillingServices src/services/TicketServices --coverage=false`
Expected: PASS.

- [ ] **Step 2: Run the release workflow**

Run: `gh workflow run release-acnorte.yml -R GuiZeroUm/ticketz -f release_sha=$(git rev-parse origin/acnorte)`
Expected: `acnorte-deploy` avança. Se o ambiente `acnorte-production` pedir aprovação, peça ao usuário.

- [ ] **Step 3: Trigger the deploy**

O auto deploy está desligado nesse compose. Dispare pela API do Dokploy ou, se não houver token disponível, peça ao usuário para clicar em Deploy em "AC Norte Produção".

- [ ] **Step 4: Verify the drain and the load**

Run: `scripts/perf/sample-postgres.sh espaco-whats-7oyzgd-postgres-1 300`, 10 minutos depois do deploy.
Expected: `Tags` e `OutOfTicketMessages` abaixo de 10 leituras por minuto (antes, 427), e transações por segundo abaixo de 10 (antes, 40). Confira também que nenhuma linha `SENT` ficou presa: `SELECT count(*) FROM "SgaBillingDeliveries" WHERE status='SENT' AND "visibilitySyncedAt" IS NULL AND "messageId" IS NOT NULL AND "contactId" IS NOT NULL` deve dar perto de zero.

### Task 7: Rollback, se necessário

- [ ] **Step 1: Revert only if a critical flow is broken**

Produção principal: avance `deploy` para um commit de revert com o workflow, ou faça `git push --force-with-lease=refs/heads/deploy:<sha atual> origin 1d2562c:refs/heads/deploy`, somente com aprovação do usuário. AC Norte: mesmo procedimento com `4c132be`. As migrations são aditivas, então o código antigo funciona sem desfazê-las. Restaure a Ajuda com o dump só se as imagens não carregarem.

### Task 8: Medir e fechar

- [ ] **Step 1: Measure after 24 hours**

Rode os dois scripts de medição e consulte no Prometheus: CPU e dados recebidos da AC Norte, dados enviados pelo Postgres e pico de memória do backend. Consulte também o `pg_stat_statements` e os tempos por rota no log do nginx, que passam a existir.

- [ ] **Step 2: Compare with the targets**

| Métrica | Antes | Meta |
|---|---|---|
| Transações por segundo | 40 | Abaixo de 10 |
| Postgres, dados enviados por semana | 40 GB | Abaixo de 10 GB |
| AC Norte, CPU média | 7,1% | Perto de 3% |
| Busca de atendimentos no banco | 252 ms | Abaixo de 50 ms |
| LCP do login em 4G | 9,2 s | Até 4 s |
| Atendimentos na página da AC Norte | 15 | 40 |
| Tabela `Helps` | 116 MB | Abaixo de 2 MB |

- [ ] **Step 3: Update the report**

Em `/root/relatorio-performance-espaco-whats/build.py`, adicione uma seção com os resultados medidos e a nota recalculada, incluindo as metas não atingidas. Publique no mesmo artifact.

- [ ] **Step 4: Clean up**

Remova a worktree `/root/dev/espacowhats-perf` e as worktrees temporárias do plano, conferindo antes que não há trabalho sem commit. Não mexa nas demais worktrees de `/root/dev`.
