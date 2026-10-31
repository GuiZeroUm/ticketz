# Performance do Espaço Whats: índice dos planos

**Spec:** `/root/relatorio-performance-espaco-whats/relatorio.html` (publicado em https://claude.ai/artifact/4yer5grJcjtwxNm6jU3r6L). A seção "Plano, em ordem" é o escopo.

**Estado do repositório em 31/10/2026, conferido com `git ls-remote`:**

| Branch | SHA | Situação |
|---|---|---|
| `deploy` | `1d2562c` | Produção principal. Dokploy com auto deploy ligado |
| `main` | `f82d22b` | 4 commits atrás de `deploy`, sem commits próprios |
| `acnorte`, `acnorte-deploy` | `4c132be` | Produção AC Norte. Não contém os 4 commits. Dokploy com auto deploy desligado |
| `dev` | `9cb03be` | Fora do fluxo desta entrega |

O CI não roda desde 13/10, porque os deploys recentes foram feitos direto em `deploy`. Os workflows de release exigem CI verde, então o primeiro passo da entrega é colocar `main` em dia e provar que o CI passa.

## Planos

| # | Plano | Branch | Parte de | Toca em | Paralelo? |
|---|---|---|---|---|---|
| 1 | [Laço de cobrança](2026-10-31-01-laco-cobranca-acnorte.md) | `perf/acnorte-billing-loop` | `origin/acnorte` | `SgaBillingServices/*`, 1 migration | Sim |
| 2 | [Medição e limites](2026-10-31-02-medicao-e-limites.md) | `perf/observability-limits` | `origin/deploy` | Compose, nginx, `scripts/perf/`, repositório de observabilidade | Sim |
| 3 | [Imagens da Ajuda](2026-10-31-03-imagens-ajuda.md) | `perf/help-images` | `origin/deploy` | `helpers/`, `HelpController`, `scripts/` | Sim |
| 4 | [Carregamento do frontend](2026-10-31-04-carregamento-frontend.md) | `perf/frontend-load` | `origin/deploy` | `frontend/src` | Sim |
| 5 | [Lista, busca e cache](2026-10-31-05-lista-busca-cache.md) | `perf/tickets-search` | `origin/deploy` | `TicketServices/*`, `CheckSettings`, 1 migration | Sim |
| 6 | [Release e verificação](2026-10-31-06-release-verificacao.md) | nenhuma | `main` e `acnorte` | Produção | Não, roda por último |

Os planos 1 a 5 não compartilham arquivos. Cada um roda em uma worktree própria, com um subagente implementador e um revisor por tarefa. Só o plano 6 altera produção.

## Fora desta entrega

| Item do relatório | Decisão | Motivo |
|---|---|---|
| Separar API, WhatsApp e filas em processos | Adiado | As rotas e filas chamam `getWbot` no mesmo processo. Exige uma camada de comunicação nova, e o backend usa 2% de um núcleo |
| Tirar testes da VPS e trocar de plano | Decisão sua | Envolve custo e contrato de hospedagem. Nenhuma mudança de código |
| Cache de `Company` no `isAuth` | Cortado | 8 leituras por minuto. Atrasaria o bloqueio de empresa suspensa |
| Endpoint único de configurações | Cortado por enquanto | O frontend já tem cache. Reavaliar com a medição depois do plano 4 |
| Virtualização completa da conversa | Cortada | Rolagem e paginação do `MessagesList` tornam o risco alto. O `content-visibility` previsto como alternativa falhou no teste de rolagem (a conversa abriu 2.749 px acima do fim) e foi removido |
| Índice em `TicketTraking` | Adiado | 2,5 ms hoje. Decidir com os dados do `pg_stat_statements` |
| Refatorar `UpdateTicketService` e `handleMessage` | Fora | Não é performance. Merece um plano próprio com testes de caracterização |
| Migração para Go | Fora | Decisão do relatório |
| Stack `acnorte-fornecedores` | Fora | Roda a partir de `/root/dev/acnorte-fornecedores`, com banco próprio |
