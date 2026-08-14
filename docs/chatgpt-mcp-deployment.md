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

## Dados expostos ao ChatGPT

As ferramentas de leitura continuam nos dois escopos já concedidos
(`conversations:read` e `reports:read`). As respostas rápidas estreiam a escrita
em dois escopos novos, `quick_messages:read` e `quick_messages:write`:

| Ferramenta | Escopo | Conteúdo |
| --- | --- | --- |
| `get_espaco_whats_context` | `conversations:read` | Tenant, atendentes, filas, tags, datas comemorativas, variáveis de agendamento, limites e capacidades |
| `get_conversation_stats` | `reports:read` | Agregados determinísticos de conversas e mensagens |
| `get_attendant_metrics` | `reports:read` | Volume, avaliação, espera e atendimento por atendente |
| `list_conversations` | `conversations:read` | Metadados das conversas, incluindo apelido, aniversário e idioma do contato |
| `list_contacts` | `conversations:read` | Diretório de contatos com apelido, aniversário (dia/mês), idioma, tags e campos personalizados |
| `list_schedules` | `conversations:read` | Agendamentos únicos, de aniversário e de data comemorativa, com público, próxima ocorrência, modelo de mensagem e contadores de entrega |
| `read_conversation` / `read_conversations` | `conversations:read` | Texto das mensagens, notas internas e dados do contato |
| `list_quick_messages` | `quick_messages:read` | Respostas rápidas visíveis ao usuário conectado, com atalho, texto e dono |
| `create_quick_message` | `quick_messages:write` | **Escrita.** Cria uma resposta rápida em nome do usuário conectado |
| `update_quick_message` | `quick_messages:write` | **Escrita.** Edita o atalho e/ou o texto de uma resposta rápida existente |

O aniversário do contato guarda apenas dia e mês, então as respostas nunca
permitem inferir idade ou ano. A auditoria não registra o texto livre dos
filtros `contact` e `search` nem o campo `message` das respostas rápidas,
mantendo nome, telefone, e-mail e conteúdo fora dos registros.

## Escrita de respostas rápidas

Uma resposta rápida é um modelo de texto que o atendente dispara depois pelo
atalho `/` no chat: criá-la **não envia mensagem para ninguém**. Não existe
ferramenta de exclusão — remover continua sendo ação do usuário na tela.

Limites da escrita, todos herdados do que já valia na interface:

- só administradores conectam o ChatGPT (`validateAccessToken` exige
  `profile === "admin"`), então só administradores escrevem;
- a escrita alcança exatamente o que `list_quick_messages` enxerga, que é o
  mesmo `FindService` da tela — com a configuração `quickMessages` em
  `individual` (padrão), apenas as respostas do próprio usuário;
- `update_quick_message` preserva o dono original do registro;
- atalho é normalizado (sem a `/` inicial), não aceita espaços e não pode
  repetir um atalho já visível, porque a tabela não tem índice único;
- o registro nasce com `companyId` e `userId` vindos do grant, nunca do payload.

### Reconexão obrigatória

Escopo novo não é concedido retroativamente: os grants existentes guardam
apenas os escopos aprovados na hora do consentimento. Uma conexão criada antes
desta versão continua funcionando normalmente para leitura e **não precisa ser
revogada**, mas as três ferramentas de resposta rápida nem sequer aparecem no
`tools/list` dela — o registro é filtrado pelos escopos do grant, para não
oferecer ao modelo uma ferramenta que sempre falharia.

Para liberar a escrita, reautorize o conector em **ChatGPT → Configurações →
Conectores → Espaço Whats**, refazendo o login (slug do tenant, e-mail e senha)
na tela de consentimento. Nenhuma variável de ambiente muda nesta versão.

## Retenção de auditoria

Agende diariamente no Postgres:

```sql
SELECT delete_expired_mcp_audits();
```

Isso aplica a retenção padrão de 90 dias. A auditoria não contém texto de conversa, prompt, nome, telefone, e-mail ou tokens.
