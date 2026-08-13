# ChatGPT MCP — implantação e breaking change

## Antes do deploy

Esta versão remove, sem endpoint substituto de escrita no MVP:

- `POST /api/messages/send`;
- o Bearer token armazenado em `Whatsapps.token`;
- a fila Bull `MessageQueue` usada exclusivamente por esse endpoint.

Execute no banco de produção e registre o resultado no chamado de implantação:

```sql
SELECT w.id, w.name, w."companyId", c.name AS company
FROM "Whatsapps" w
JOIN "Companies" c ON c.id = w."companyId"
WHERE NULLIF(BTRIM(w.token), '') IS NOT NULL
ORDER BY w."companyId", w.id;
```

Cada linha representa uma integração externa potencialmente afetada. Avise os clientes encontrados e confirme explicitamente a janela antes de executar as migrações. A migração `20260813020000-remove-legacy-whatsapp-api-token` apaga a coluna e não preserva os tokens.

Relatório executado em 13/08/2026 antes da publicação inicial:

- 2 conexões afetadas;
- conexão 3, tenant 1;
- conexão 2, tenant 2;
- nenhum token ou outro segredo foi registrado neste documento.

O deploy foi autorizado pelo responsável do projeto junto com o pedido explícito de commit e push. Esse registro não substitui o aviso aos dois clientes afetados.

## Variáveis obrigatórias

Em produção, configure:

- `MCP_BASE_URL=https://mcp.seu-dominio` (resource, issuer e origem do endpoint `/mcp`);
- `MCP_PRIVATE_KEY` em PEM PKCS#8, podendo usar `\n` literais;
- `MCP_PUBLIC_KEY` em PEM SPKI, podendo usar `\n` literais;
- `MCP_KEY_ID` estável;
- `MCP_CURSOR_SECRET` aleatório e estável;
- `MCP_TIMEZONE` (padrão: `America/Rio_Branco`);
- `FRONTEND_URL` com a origem pública da interface Ticketz.

Gere o par RSA fora do servidor de aplicação e armazene-o nos secrets do Railway:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out mcp-private.pem
openssl rsa -pubout -in mcp-private.pem -out mcp-public.pem
```

O backend recusa iniciar em produção sem as duas chaves. Não há chave da OpenAI nesta integração.

## Piloto

O piloto nasce desabilitado por tenant. Um superadministrador habilita a configuração protegida `_mcpEnabled` pelo endpoint administrativo. Habilite somente os dois tenants aprovados após concluir o checklist jurídico do plano.

```http
PUT /chatgpt/pilot/:companyId
Authorization: Bearer <JWT do superadministrador>
Content-Type: application/json

{"enabled":true}
```

Use a URL exibida em **Administração → ChatGPT** para criar uma integração Draft no Developer Mode. Valide discovery, OAuth e ferramentas primeiro no MCP Inspector e depois no ChatGPT.

## Retenção de auditoria

Agende diariamente no Postgres:

```sql
SELECT delete_expired_mcp_audits();
```

Isso aplica a retenção padrão de 90 dias. A auditoria não contém texto de conversa, prompt, nome, telefone, e-mail ou tokens.
