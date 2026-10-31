# Medição e limites de memória: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir tempo por rota e por consulta, religar a sonda de latência e impedir que o backend principal use memória sem limite.

**Architecture:** O nginx passa a registrar a duração das requisições. O Postgres carrega `pg_stat_statements`. O backend ganha limite de memória, igual ao que a AC Norte já tem. Os scripts de medição usados no relatório vão para o repositório, para gerar o antes e depois do plano 6.

**Tech Stack:** Docker Compose, nginx, Postgres 18, Prometheus Blackbox Exporter, Node.

**Spec:** `/root/relatorio-performance-espaco-whats/relatorio.html`, passos 2 e 3 do plano. Índice: `2026-10-31-00-indice-performance.md`.

## Global Constraints

- Branch `perf/observability-limits`, a partir de `origin/deploy`. As Tasks 1 e 3 commitam nela. A Task 2 commita no repositório de observabilidade.
- A mudança no `command` do Postgres recria o container no deploy e derruba o banco por alguns segundos, para a produção principal e para a AC Norte. O plano 6 faz esse deploy fora do horário de pico, que é das 8h às 11h em Rio Branco.
- Backend: `mem_limit: 2g` e `--max-old-space-size=1536`. O pico medido em 7 dias foi 748 MB.
- Os logs de acesso não podem registrar query string, cabeçalhos nem corpo.

## Review Focus

- `nginx -t` falhando por `log_format` definido depois do uso derruba o frontend no deploy: o plano valida com a imagem construída antes do commit.
- Healthcheck do Docker enchendo o log: as requisições com agente `Wget` ficam de fora do log. Coberto na Task 1.
- Backend atingindo o limite de memória: o container precisa reiniciar sozinho. O plano 6 confere a política `on-failure`.
- `pg_stat_statements` carregado sem a extensão criada: consulta falha com erro claro, sem afetar o sistema. O plano 6 cria a extensão.
- Script de medição rodando em produção: precisa ser só leitura, com `default_transaction_read_only=on`. Coberto na Task 3.

---

### Task 1: Tempo de resposta no log do nginx

**Files:**
- Create: `frontend/nginx/conf.d/01-timing-log.conf`
- Modify: `frontend/nginx/conf.d/default.conf`

**Interfaces:**
- Produces: linhas no stdout do frontend com este formato, consumido pelo plano 6: `$time_iso8601 $request_method $uri $status $body_bytes_sent $request_time $upstream_response_time`

- [ ] **Step 1: Create `01-timing-log.conf`**

Defina `map $http_user_agent $espaco_loggable { default 1; ~*^Wget 0; }` e `log_format espaco_timing` com os campos acima. `$uri` não inclui query string.

- [ ] **Step 2: Add the directive to `default.conf`**

Dentro de `server {`, antes dos `include`: `access_log /dev/stdout espaco_timing if=$espaco_loggable;`.

- [ ] **Step 3: Validate with the built image**

Run: `docker build -t espaco-frontend-test frontend && docker run -d --name espaco-frontend-test -e FRONTEND_HOST=localhost -e APP_BASE_DOMAIN=localhost -e EMAIL_ADDRESS=ci@example.invalid -e BACKEND_SERVICE=127.0.0.1 -e BACKEND_PATH=/backend -e BACKEND_PROTOCOL=http espaco-frontend-test; sleep 5; docker exec espaco-frontend-test nginx -t; docker rm -f espaco-frontend-test`
Expected: `configuration file /etc/nginx/nginx.conf test is successful`. O container sobe pelo entrypoint porque o `sites.d` depende das variáveis de ambiente.

- [ ] **Step 4: Commit**

```bash
git add frontend/nginx/conf.d
git commit -m "feat(frontend): log request and upstream duration per route

No per-route timing existed, so logged-in screens could not be measured.
Query strings and health checks stay out of the log. Validated with nginx -t."
```

### Task 2: Ligar o Blackbox e reduzir o custo do cAdvisor

Esta tarefa não usa a branch do plano. O repositório é `/etc/dokploy/compose/observability/code` (branch `main`, remoto `somos-espaco`). Ela altera só a observabilidade e não afeta os serviços monitorados.

**Files:**
- Modify: `/etc/dokploy/compose/observability/code/compose.yaml:87-88`

**Interfaces:**
- Produces: métricas `probe_duration_seconds` e `probe_success` no Prometheus.

- [ ] **Step 1: Confirm the failure**

Run: `docker exec observability-prometheus-1 wget -qO- 'http://localhost:9090/api/v1/query?query=count(probe_success)'`
Expected: resultado vazio, `"result":[]`.

- [ ] **Step 2: Change cAdvisor housekeeping**

`--housekeeping_interval=30s` e `--max_housekeeping_interval=60s`. O Prometheus continua coletando; só diminui a frequência de atualização, o que basta para a resolução de 5 minutos dos painéis.

- [ ] **Step 3: Start the exporter and recreate cAdvisor**

Run: `cd /etc/dokploy/compose/observability/code && docker compose config --quiet && docker compose up -d blackbox-exporter cadvisor`
Expected: dois containers `Started`. Nenhum outro container é recriado.

- [ ] **Step 4: Verify after 2 minutes**

Run: `docker exec observability-prometheus-1 wget -qO- 'http://localhost:9090/api/v1/query?query=probe_success{instance=~".*espacowhats.com.br.*"}'`
Expected: valor `1` para `https://espacowhats.com.br/backend/api/platform/v1/health`. O alerta `MonitoringTargetDown` deixa de disparar para os serviços que estão no ar; os alvos que seguirem em falha ficam registrados para o relatório final.

- [ ] **Step 5: Commit no repositório de observabilidade**

```bash
git -C /etc/dokploy/compose/observability/code add compose.yaml
git -C /etc/dokploy/compose/observability/code commit -m "chore: reduce cadvisor housekeeping frequency

cAdvisor was the top CPU container, 10% of a core. Verified probes reporting."
```

### Task 3: Limite de memória, pg_stat_statements e scripts de medição

**Files:**
- Modify: `docker-compose.dokploy.yml` (serviços `postgres` e `backend`)
- Create: `scripts/perf/sample-postgres.sh`
- Create: `scripts/perf/measure-login.js`

**Interfaces:**
- Produces, consumido pelo plano 6:
  - `scripts/perf/sample-postgres.sh <container> <segundos>`: imprime transações por segundo e leituras por minuto por tabela, com `PGOPTIONS='-c default_transaction_read_only=on'`.
  - `node scripts/perf/measure-login.js <url> <chromium>`: imprime FCP, LCP, requisições e KB, em conexão normal e em 4G com CPU reduzida 4 vezes (1,6 Mbps, 150 ms).

- [ ] **Step 1: Edit the compose file**

Em `postgres`: `command: ["postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=top"]`. Em `backend`: `mem_limit: 2g` e, em `environment`, `NODE_OPTIONS: --max-old-space-size=1536`.

- [ ] **Step 2: Validate the compose**

Run: `docker compose --env-file /etc/dokploy/compose/espaco-whats-7oyzgd/code/.env -f docker-compose.dokploy.yml config | grep -E 'mem_limit|max-old-space|pg_stat_statements'`
Expected: as três configurações aparecem, com `mem_limit` de 2 GB no serviço `backend`. Não copie nem imprima o `.env`.

- [ ] **Step 3: Add the scripts**

Baseie-se em `sample.sh` e `pup/load.js` da pasta temporária desta sessão (`/tmp/claude-0/-root/3e253a1c-fa1b-4670-bf60-1650120d58ed/scratchpad`). Em `measure-login.js`, use `waitUntil: "load"` mais 4 s de espera, porque o socket mantém a rede ativa e `networkidle` não termina. `puppeteer-core` entra como instalação temporária, documentada no cabeçalho; não entra no `package.json`.

- [ ] **Step 4: Run them against production read-only**

Run: `scripts/perf/sample-postgres.sh espaco-whats-7oyzgd-postgres-1 60`
Expected: cerca de 40 transações por segundo, valor de antes do plano 1, e `Tags` perto de 427 leituras por minuto.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.dokploy.yml scripts/perf
git commit -m "ops: cap backend memory and enable query statistics

Peak was 748 MB over 7 days and reached 9 GB in the October incident with no
limit. Adds the read-only scripts used to measure before and after."
```
