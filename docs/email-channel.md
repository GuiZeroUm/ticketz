# Canal de e-mail: conexão do Gmail

## Decisão: OAuth Google dedicado à caixa (não Clerk)

O Gmail é conectado por um **fluxo OAuth próprio**, separado do login "Entrar com Google" (Clerk). A spec chama isso de caminho 2.

Motivos:

- A caixa conectada costuma ser compartilhada (por exemplo, `contato@empresa.com`) e é diferente da conta Google de quem faz login.
- A sincronização roda em segundo plano e precisa de um refresh token próprio. O Clerk não renova os tokens do provedor de forma proativa.
- O login continua pedindo só os escopos de identidade. Quem entra com Google **não** vê a tela de consentimento do Gmail.

Os arquivos do login (`ClerkGoogleAuthService.ts`, `googleAuth.js`, `config/clerk.ts`) não foram alterados.

## Variáveis de ambiente (backend)

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `GMAIL_OAUTH_CLIENT_ID` | sim | Client ID do cliente OAuth "Aplicativo da Web". |
| `GMAIL_OAUTH_CLIENT_SECRET` | sim | Client secret desse cliente. Nunca vai para o frontend. |
| `GMAIL_OAUTH_REDIRECT_URI` | sim | URL pública do callback, igual à cadastrada no Google. Exemplo: `https://app.espacowhats.com.br/backend/email/oauth/google/callback`. |
| `FRONTEND_URL` | já existe | Destino padrão do retorno: `${FRONTEND_URL}/connections?...`. |
| `FRONTEND_CUSTOM_URL`, `FRONTEND_URL_REGEX` | já existem | As mesmas regras do CORS decidem para quais origens do frontend o callback pode voltar (ver "Multi-tenant" abaixo). |
| `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_AUDIENCE`, `GMAIL_PUBSUB_SERVICE_ACCOUNT` | não | Push do Gmail (Task 16). Sem elas, a sincronização usa polling. |

Sem as três primeiras, `POST /email/oauth/google/start` responde `ERR_GMAIL_NOT_CONFIGURED` e nada é chamado no Google.

## Passo a passo no Google Cloud

1. No [Google Cloud Console](https://console.cloud.google.com/), use o projeto do Espaço Whats ou crie um projeto novo.
2. Em **APIs e serviços › Biblioteca**, ative a **Gmail API**.
3. Em **APIs e serviços › Tela de consentimento OAuth** (Google Auth Platform):
   - Tipo de usuário **Externo**. Enquanto o app estiver em teste, adicione os e-mails das caixas de teste em **Usuários de teste**.
   - Em **Acesso a dados (escopos)**, adicione só estes dois:
     - `https://www.googleapis.com/auth/gmail.readonly` (restrito)
     - `https://www.googleapis.com/auth/gmail.send` (sensível)
   - Não adicione `gmail.modify` nem `https://mail.google.com/`.
4. Em **Credenciais › Criar credenciais › ID do cliente OAuth**, escolha **Aplicativo da Web**:
   - Em **URIs de redirecionamento autorizados**, cadastre exatamente o valor de `GMAIL_OAUTH_REDIRECT_URI`. Para desenvolvimento local, cadastre também `http://localhost:8080/email/oauth/google/callback`.
   - Origens JavaScript não são necessárias, porque a troca do código acontece no servidor.
5. Copie o Client ID e o Client secret para o `.env` do backend e reinicie o backend.

Recomendação: use um cliente OAuth **diferente** do usado pelo login. Assim os escopos e a tela de consentimento de cada um ficam separados.

### Verificação OAuth (importante antes de abrir para clientes)

`gmail.readonly` é um escopo **restrito** e `gmail.send` é **sensível**. Em modo de teste, só os usuários de teste conseguem conectar, e o refresh token expira em 7 dias. Para publicar o app para qualquer conta Google, é preciso:

- passar pela verificação do app OAuth (política de privacidade, domínio verificado, vídeo do fluxo);
- passar pela **avaliação de segurança** exigida para escopos restritos quando os dados ficam no servidor. É feita por um avaliador terceiro, é anual e tem custo.

Planeje isso antes de prometer o Gmail para todos os clientes. iCloud e e-mail próprio (IMAP/SMTP) não dependem disso.

## Como o fluxo funciona

1. O admin escolhe Gmail em Conexões. O frontend chama `POST /email/oauth/google/start` com `{ name, queueId? }`. A rota exige login, perfil admin e o canal habilitado (`assertEmailEnabled`).
2. O backend gera:
   - um `state` de 32 bytes aleatórios (base64url), guardado no Redis em `email:oauth:state:<state>` por 600 s com `{ companyId, userId, name, queueId, codeVerifier, origin }`;
   - um par PKCE (S256).
   Depois devolve `{ url }` para a tela de consentimento, com `access_type=offline`, `prompt=consent`, `include_granted_scopes=false` e os dois escopos.
3. O Google redireciona o navegador para `GET /email/oauth/google/callback`, que não exige login. O backend faz, nesta ordem:
   - consome o `state` com get+del atômico; um `state` desconhecido, expirado ou já usado é recusado;
   - confere se o canal continua habilitado;
   - troca o código por tokens no servidor, com o `code_verifier`;
   - confere os escopos concedidos;
   - lê `users.getProfile` para obter o endereço e o `historyId`;
   - grava a conta e enfileira a sincronização.
4. A resposta é sempre um `302` para `<origem>/connections?email=connected` ou `<origem>/connections?email=error&code=<código>`.

Se já existe uma conta Gmail com o mesmo endereço na empresa (precisando de reautenticação ou desconectada), o callback reutiliza essa linha. Assim os tickets dela continuam ligados à conta. Uma conta que só precisava de reautenticação mantém o cursor, para não perder o que chegou nesse meio-tempo. Uma conta desconectada recomeça com `{ historyId, initial: true }`. Se o endereço já está conectado por IMAP/SMTP na empresa, o callback recusa com `ERR_EMAIL_ACCOUNT_EXISTS`. A mesma caixa em outra empresa vira uma linha independente.

### Códigos de retorno (`?code=`)

| Código | Quando |
| --- | --- |
| `ERR_GMAIL_STATE` | `state` inválido, expirado ou reutilizado, ou o usuário cancelou no Google. |
| `ERR_GMAIL_SCOPES_MISSING` | O usuário desmarcou leitura ou envio. O token recebido é revogado. |
| `ERR_GMAIL_NO_REFRESH_TOKEN` | O Google não devolveu refresh token. |
| `ERR_GMAIL_NOT_CONFIGURED` | Faltam as variáveis do Gmail. |
| `ERR_EMAIL_CHANNEL_DISABLED` | O canal foi desligado para a empresa durante o fluxo. |
| `ERR_EMAIL_ACCOUNT_EXISTS` | O endereço já está conectado por IMAP/SMTP nesta empresa. |
| `ERR_GMAIL_OAUTH_FAILED` | Falha na troca do código, na leitura do perfil ou outra falha inesperada. |

### Multi-tenant (subdomínios)

O Google aceita só URIs de redirecionamento fixas, por isso o callback é um só. O resultado, porém, precisa voltar ao subdomínio que iniciou o fluxo, porque o frontend guarda o resultado no `sessionStorage`, que é separado por origem.

No início do fluxo, o backend guarda a origem do frontend no `state`. Ele usa o header `Origin` ou, na falta dele, a origem do `Referer`. A origem só é guardada se passar por `isAllowedFrontendOrigin`, que aplica as mesmas regras do CORS: `FRONTEND_URL`, `FRONTEND_CUSTOM_URL` e `FRONTEND_URL_REGEX`. Além disso, precisa ser uma origem exata, sem caminho, query ou usuário. Se não passar, o backend guarda `FRONTEND_URL`.

No callback, a origem é validada de novo. Com `state` inválido, o redirecionamento vai para `FRONTEND_URL`. Nunca há redirecionamento para uma origem que não foi validada.

### Segredos

- O refresh token fica cifrado (`encryptSecret`) em `EmailAccount.credentials`, gravado só por `setCredentials`.
- O refresh token, o código e o `state` nunca aparecem em resposta, log, socket, redirecionamento ou URL. A revogação manda o token no corpo do `POST`.
- Os logs registram apenas ids e um motivo técnico curto, como `HTTP_400`.

### Desconectar e revogar

`DELETE /email/accounts/:id` chama `disableEmailAccount`. Para uma conta Gmail, essa função tenta revogar o token em `POST https://oauth2.googleapis.com/revoke` antes de apagar as credenciais. Uma falha na revogação só gera log, e a conta é desconectada mesmo assim.

A revogação remove toda a autorização daquela conta Google para o nosso cliente OAuth. Por isso, se a mesma caixa continua conectada em outra empresa, a revogação é pulada e só as credenciais locais são apagadas. Isso foi inferido da documentação do Google e precisa ser confirmado no teste funcional.

### Rotação do refresh token (para a Task 15)

`getGmailAuthClient(account)` devolve um `OAuth2Client` que renova o access token sozinho. `invalid_grant` vira `EmailAuthError` e as outras falhas viram `EmailTransientError`, sem texto do servidor.

Se o Google devolver um refresh token novo, ele fica em `client.rotatedRefreshToken` e **não é gravado dentro da rodada de sincronização** (ruling R23). Quem usa o cliente chama `persistRotatedRefreshToken(account, client)` fora da rodada: no envio, ou depois da escrita final de status da rodada. Essa função grava só `credentials`, condicionada ao `updatedAt` atual e a um status diferente de `disabled`.

## Teste funcional (passo 5 da Task 14)

**Status: pendente.** Ele depende de um cliente OAuth real no Google Cloud, que este ambiente não tem. Os testes automatizados simulam todas as chamadas ao Google (`GmailOAuthService.spec.ts`).

Roteiro para o responsável:

1. Crie o cliente OAuth "Aplicativo da Web" em modo de teste, como descrito acima, e adicione uma caixa Gmail de teste como usuário de teste.
2. Preencha `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` e `GMAIL_OAUTH_REDIRECT_URI` no `.env` local e reinicie o backend.
3. Habilite o canal de e-mail para a empresa (super admin, em Configurações › Empresas).
4. Em Conexões, escolha Gmail e autorize leitura e envio. A volta deve ser para `/connections`, com o aviso "Gmail conectado com sucesso".
5. Na tabela `EmailAccounts`, confira:
   - `address` correto;
   - `provider = gmail_api` e `status = active`;
   - `scopes` com exatamente `gmail.readonly` e `gmail.send`;
   - `credentials` cifrado.
6. Repita a conexão desmarcando "enviar e-mail". O retorno deve ser `ERR_GMAIL_SCOPES_MISSING`, e o app não deve aparecer em https://myaccount.google.com/permissions.
7. Desconecte a caixa em Conexões e confira que o acesso some de https://myaccount.google.com/permissions.
8. Faça logout e entre com "Entrar com Google". O login deve funcionar **sem** a tela de consentimento do Gmail.
9. Opcional, para multi-tenant: inicie a conexão a partir de um subdomínio de tenant e confira que a volta é para o mesmo subdomínio.
10. Opcional: conecte a mesma caixa em duas empresas, desconecte uma e confira que a outra continua sincronizando.

Registre aqui a data e o resultado de cada item.
