# Deploy do Espaço Whats no Dokploy

O ambiente de produção do Dokploy acompanha a branch `deploy`, nunca a branch
`main` diretamente. O workflow `Validate and release to Dokploy` executa os
testes e builds de backend e frontend, valida o Compose e só então avança a
branch `deploy` para o commit aprovado. O GitHub App do Dokploy inicia o deploy
quando essa branch é atualizada.

## Garantias do deploy

- PostgreSQL, Redis, uploads públicos e arquivos privados usam volumes
  persistentes.
- Backend e frontend têm health checks e atualização `start-first`.
- Uma atualização que não ficar saudável aciona rollback do serviço.
- Segredos ficam no ambiente do Compose no Dokploy e não são versionados.
- O domínio oficial não faz parte desta etapa. O ambiente começa em um hostname
  técnico temporário.

## Fluxo normal

1. Envie o commit para `main`.
2. Aguarde o workflow `Validate and release to Dokploy` concluir.
3. O workflow atualiza `deploy`.
4. O Dokploy constrói a nova versão, mantém a anterior atendendo enquanto a nova
   passa pelo health check e troca o tráfego somente depois disso.

Se qualquer verificação falhar, `deploy` não é alterada e nenhuma implantação é
iniciada.

## Banco de dados

O backend executa migrações Sequelize durante a inicialização. Migrações já
publicadas não devem ser editadas; mudanças de schema devem ser aditivas e
compatíveis com a versão anterior, porque ela permanece ativa até a nova ficar
saudável.

Antes da primeira carga, restaure o dump com `--no-owner --no-acl`. Depois da
restauração, inicie o backend para aplicar somente as migrações ainda pendentes.

## Validação operacional

- `GET /backend/api/platform/v1/health` deve retornar `status: ok`.
- A página inicial e o login devem responder pelo hostname técnico.
- O tenant `Teste` deve abrir no hostname técnico com o prefixo `teste.`.
- PostgreSQL e Redis não devem publicar portas diretamente na internet.
