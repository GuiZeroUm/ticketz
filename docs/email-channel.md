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
| `FRONTEND_URL` | sim (já existe) | Destino padrão do retorno: `${FRONTEND_URL}/connections?...`. Sem ela, o Gmail fica como não configurado, para não haver redirecionamento relativo ao host do backend. |
| `FRONTEND_CUSTOM_URL`, `FRONTEND_URL_REGEX` | já existem | As mesmas regras do CORS decidem para quais origens do frontend o callback pode voltar (ver "Multi-tenant" abaixo). |
| `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_AUDIENCE`, `GMAIL_PUBSUB_SERVICE_ACCOUNT` | não | Push do Gmail (Task 16). Sem elas, a sincronização usa polling. |

Sem as três primeiras ou sem `FRONTEND_URL`, `POST /email/oauth/google/start` responde `ERR_GMAIL_NOT_CONFIGURED` e nada é chamado no Google.

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

1. O admin escolhe Gmail em Conexões. O frontend chama `POST /email/oauth/google/start` com `{ name, queueId?, accountId? }`. A rota exige login, perfil admin e o canal habilitado (`assertEmailEnabled`).
   - `accountId` é usado para reconectar uma conta Gmail da própria empresa. Nesse caso, a URL leva `login_hint=<endereço da conta>`, para o Google já sugerir a caixa certa.
2. O backend gera:
   - um `state` de 32 bytes aleatórios (base64url), guardado no Redis em `email:oauth:state:<state>` por 600 s com `{ companyId, userId, name, queueId, codeVerifier, origin, accountId }`;
   - um par PKCE (S256).
   Depois devolve `{ url }` para a tela de consentimento, com:
   - `access_type=offline` e `prompt=consent`;
   - os dois escopos;
   - `include_granted_scopes=false`: a autorização incremental juntaria ao token as autorizações anteriores do mesmo client ID. Com `false`, o conjunto concedido é exatamente `gmail.readonly` + `gmail.send`.
3. O Google redireciona o navegador para `GET /email/oauth/google/callback`, que não exige login. O callback:
   - consome o `state` com get+del atômico; um `state` desconhecido, expirado ou já usado é recusado;
   - **não troca o código**. Guarda `{ registro do state, código }` no Redis com um *handle* novo, também de 32 bytes aleatórios, de uso único e válido por 300 s;
   - redireciona para `<origem>/connections?email=pending&handle=<handle>`.
4. O frontend, já logado, chama `POST /email/oauth/google/finish` com `{ handle }`. A rota exige login, perfil admin e o canal habilitado. O backend:
   - consome o handle com get+del atômico, depois de validar o formato;
   - recusa com `ERR_GMAIL_OAUTH_FAILED` (403) se quem chama não for o **mesmo usuário da mesma empresa** que iniciou o fluxo. O handle já foi consumido nesse ponto;
   - só então troca o código por tokens no servidor, com o `code_verifier`;
   - confere os escopos concedidos;
   - lê `users.getProfile` para obter o endereço e o `historyId`;
   - grava a conta, enfileira a sincronização e devolve a conta no mesmo formato público da listagem, sem segredos.

**Por que o passo extra (`finish`).** O callback chega sem sessão, porque o navegador volta do Google. Se ele trocasse o código e gravasse a conta, um admin mal-intencionado poderia mandar a URL de consentimento para outra pessoa. Se ela aceitasse, a caixa dela seria ligada à empresa do admin. Com o `finish`, a troca só acontece para o usuário logado que iniciou o fluxo. O handle na URL não serve para mais ninguém: é de uso único, vale 5 minutos e fica preso à empresa e ao usuário.

Erros do callback continuam voltando como `<origem>/connections?email=error&code=<código>`. Erros do `finish` vêm na resposta da API, como `{ error: "<código>" }`.

Se já existe uma conta Gmail com o mesmo endereço na empresa (precisando de reautenticação ou desconectada), o `finish` reutiliza essa linha. Assim os tickets dela continuam ligados à conta.
- Uma conta que só precisava de reautenticação mantém o cursor, porque o mesmo endereço é a mesma caixa. Assim não se perde o que chegou nesse meio-tempo.
- Uma conta desconectada recomeça com `{ historyId, initial: true }`.
- Numa reconexão com `accountId`, se o usuário autorizar outra caixa, a resposta é `ERR_GMAIL_ACCOUNT_MISMATCH` e nada é revogado.
- Se o endereço já está conectado por IMAP/SMTP na empresa, a resposta é `ERR_EMAIL_ACCOUNT_EXISTS`.
- A mesma caixa em outra empresa vira uma linha independente.

### Códigos de erro

Callback (`?email=error&code=`):

| Código | Quando |
| --- | --- |
| `ERR_GMAIL_STATE` | `state` inválido, expirado ou reutilizado, ou o usuário cancelou no Google. |
| `ERR_GMAIL_NOT_CONFIGURED` | Faltam as variáveis do Gmail. |
| `ERR_GMAIL_OAUTH_FAILED` | Não foi possível guardar o handle. |

`POST /email/oauth/google/finish` (`{ error }`):

| Código | Quando |
| --- | --- |
| `ERR_GMAIL_STATE` (400) | Handle inválido, expirado ou já usado. |
| `ERR_GMAIL_OAUTH_FAILED` (403) | Quem chama não é o usuário e a empresa que iniciaram o fluxo. |
| `ERR_GMAIL_OAUTH_FAILED` (400/502) | Falha na troca do código, na leitura do perfil ou outra falha inesperada. |
| `ERR_GMAIL_SCOPES_MISSING` (400) | O usuário desmarcou leitura ou envio. O token é revogado quando o endereço é conhecido e não está em uso em outra conta. |
| `ERR_GMAIL_NO_REFRESH_TOKEN` (400) | O Google não devolveu refresh token. |
| `ERR_GMAIL_ACCOUNT_MISMATCH` (409) | A reconexão de uma conta foi autorizada com outra caixa. |
| `ERR_EMAIL_ACCOUNT_EXISTS` (409) | O endereço já está conectado por IMAP/SMTP nesta empresa. |
| `ERR_GMAIL_NOT_CONFIGURED` (503) | Faltam as variáveis do Gmail. |
| `ERR_EMAIL_CHANNEL_DISABLED` (403) | O canal está desligado para a empresa. |

### Multi-tenant (subdomínios)

O Google aceita só URIs de redirecionamento fixas, por isso o callback é um só. O resultado, porém, precisa voltar ao subdomínio que iniciou o fluxo, porque o frontend guarda o resultado no `sessionStorage`, que é separado por origem.

No início do fluxo, o backend guarda a origem do frontend no `state`. Ele usa o header `Origin` ou, na falta dele, a origem do `Referer`. A origem só é guardada se passar por `isAllowedFrontendOrigin`, que aplica as mesmas regras do CORS: `FRONTEND_URL`, `FRONTEND_CUSTOM_URL` e `FRONTEND_URL_REGEX`. Além disso, precisa ser uma origem exata, sem caminho, query ou usuário. A regex precisa casar com a origem **inteira**, mesmo sem `$` no final. Assim `^https://.*\.espacowhats\.com\.br` não aceita `https://x.espacowhats.com.br.evil.com`. Se não passar, o backend guarda `FRONTEND_URL`.

No callback, a origem é validada de novo. Com `state` inválido, o redirecionamento vai para `FRONTEND_URL`. Nunca há redirecionamento para uma origem que não foi validada.

### Segredos

- O refresh token fica cifrado (`encryptSecret`) em `EmailAccount.credentials`, gravado só por `setCredentials`.
- O refresh token, o código e o `state` nunca aparecem em resposta, log, socket, redirecionamento ou URL. A revogação manda o token no corpo do `POST`. O redirecionamento do callback leva só o handle, que é de uso único, dura 5 minutos e serve apenas para o usuário que iniciou o fluxo.
- Os logs registram apenas ids e um motivo técnico curto, como `HTTP_400`.

### Desconectar e revogar

`DELETE /email/accounts/:id` chama `disableEmailAccount`. Para uma conta Gmail, essa função tenta revogar o token em `POST https://oauth2.googleapis.com/revoke` antes de apagar as credenciais. Uma falha na revogação só gera log, e a conta é desconectada mesmo assim.

A revogação remove toda a autorização daquela conta Google para o nosso cliente OAuth. Por isso, se a mesma caixa continua conectada em outra empresa, a revogação é pulada e só as credenciais locais são apagadas. Pelo mesmo motivo, uma autorização parcial cujo endereço não pôde ser lido não é revogada. Isso foi inferido da documentação do Google e precisa ser confirmado no teste funcional.

### Rotação do refresh token (para a Task 15)

`getGmailAuthClient(account)` devolve um `OAuth2Client` que renova o access token sozinho. `invalid_grant` vira `EmailAuthError` e as outras falhas viram `EmailTransientError`, sem texto do servidor.

Se o Google devolver um refresh token novo, ele fica em `client.rotatedRefreshToken` e **não é gravado dentro da rodada de sincronização** (ruling R23). Quem usa o cliente chama `persistRotatedRefreshToken(account, client)` fora da rodada: no envio, ou depois da escrita final de status da rodada. Essa função grava só `credentials`, condicionada ao `updatedAt` atual e a um status diferente de `disabled`.

## Teste funcional (passo 5 da Task 14)

**Status: pendente.** Ele depende de um cliente OAuth real no Google Cloud, que este ambiente não tem. Os testes automatizados simulam todas as chamadas ao Google (`GmailOAuthService.spec.ts`).

Roteiro para o responsável:

1. Crie o cliente OAuth "Aplicativo da Web" em modo de teste, como descrito acima, e adicione uma caixa Gmail de teste como usuário de teste.
2. Preencha `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` e `GMAIL_OAUTH_REDIRECT_URI` no `.env` local e reinicie o backend.
3. Habilite o canal de e-mail para a empresa (super admin, em Configurações › Empresas).
4. Em Conexões, escolha Gmail e autorize leitura e envio. A volta deve ser para `/connections?email=pending&handle=...`. O frontend chama `POST /email/oauth/google/finish` e mostra "Gmail conectado com sucesso".
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
11. Abra a URL `...connections?email=pending&handle=...` logado com outro usuário. O `finish` deve ser recusado e a caixa não deve ser conectada.

Registre aqui a data e o resultado de cada item.

# Canal de e-mail: configuração, ambiente local e aceite

Esta parte vale para os três tipos de caixa (Gmail, iCloud e e-mail próprio) e para qualquer empresa, seja ela de WhatsApp por QR code (`whatsappMode = normal`) ou da API oficial da Meta (`whatsappMode = meta`). O canal de e-mail não lê `whatsappMode` nem `apiMode` em nenhum ponto.

## Variáveis de ambiente do canal

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `ENCRYPTION_KEY` | **sim** | Cifra senhas IMAP/SMTP, senhas de app e refresh tokens do Gmail (AES-256-GCM). É a mesma chave já usada para o token da Meta. Sem ela, conectar uma caixa falha e as caixas já conectadas não sincronizam. Gere uma vez com `openssl rand -hex 32` e não troque depois: trocar a chave obriga a reconectar todas as caixas. |
| `GMAIL_OAUTH_*`, `GMAIL_PUBSUB_*` | só para Gmail | Ver as seções do Gmail acima. iCloud e e-mail próprio não precisam delas. |
| `EMAIL_IMAP_IDLE` | não | IMAP IDLE (e-mail novo chega em cerca de 1 s). Vem ligado. Com `false`, sobra o polling de 1 minuto. |
| `EMAIL_IMAP_IDLE_MAX` | não | Máximo de conexões IDLE por processo do backend. O padrão é `200`, e `0` desliga. As caixas acima do limite continuam no polling de 1 minuto. |
| `EMAIL_ALLOW_PRIVATE_HOSTS` | **só desenvolvimento** | Com `true`, aceita servidor IMAP/SMTP em `localhost` ou numa rede privada (por exemplo, o GreenMail local). É **ignorada** quando `NODE_ENV=production`. Nunca use em produção: o bloqueio de hosts privados impede que um admin use o backend para sondar a rede interna. |
| `NODE_EXTRA_CA_CERTS` | **só desenvolvimento** | Caminho de um certificado extra em que o Node confia. Serve para o certificado de teste do GreenMail. O backend nunca desliga a verificação de TLS. O Node lê essa variável **ao iniciar**, então ela precisa estar no ambiente do processo: o `.env` não serve, porque o dotenv carrega depois. |

Portas aceitas para servidores próprios: IMAP 993 (TLS) ou 143 (STARTTLS) e SMTP 465 (TLS) ou 587 (STARTTLS). Outras portas são recusadas com `ERR_EMAIL_PORT_NOT_ALLOWED`.

## Como ligar o canal por empresa

O canal vem desligado em toda empresa. Só o super admin liga:

1. Entre como super admin e abra **Configurações › Empresas**.
2. Edite a empresa, mude **Canal de e-mail** para **Habilitado** e salve. Isso grava a setting `emailChannelEnabled = "true"` da empresa.
3. O admin da empresa passa a ver o e-mail em **Conexões** e no atendimento. Ele conecta a caixa em **Conexões › Nova conexão › E-mail** (Gmail, iCloud ou E-mail próprio).

O admin da empresa não consegue ligar o canal sozinho: `PUT /settings/emailChannelEnabled` responde 403.

Com o canal desligado:

- os menus somem (`GET /email/availability` devolve `{ "enabled": false }`);
- as rotas de e-mail e o envio respondem 403 `ERR_EMAIL_CHANNEL_DISABLED`;
- a sincronização e o IDLE param para as caixas da empresa;
- as caixas e o cursor ficam guardados.

Ao religar, o que chegou nesse intervalo entra no próximo tick (até 1 minuto).

## Servidor de e-mail local (GreenMail)

O `docker-compose-email-dev.yaml` sobe um GreenMail com três caixas de teste. Assim dá para testar o canal de ponta a ponta sem conta real. O caminho testado é o do **backend rodando direto do código** (`npm run dev:server`), com Postgres e Redis do `docker-compose-dev.yaml`.

| Caixa (login = endereço) | Senha | Papel |
| --- | --- | --- |
| `caixa-a@empresa-a.test` | `senha123` | Caixa da empresa A (conectada no Ticketz). |
| `caixa-b@empresa-b.test` | `senha123` | Caixa da empresa B. |
| `cliente@externo.test` | `senha123` | O "cliente", que escreve e recebe as respostas. |

### 1. Certificado de teste (uma vez)

O certificado que vem no GreenMail não tem o nome `localhost`, e o backend sempre verifica o certificado. Gere um certificado próprio na raiz do repositório. A pasta `greenmail-dev/` está no `.gitignore`.

```sh
mkdir -p greenmail-dev
cat > greenmail-dev/server.cnf <<'CNF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = localhost
[ext]
subjectAltName = DNS:localhost,DNS:host.docker.internal,IP:127.0.0.1
basicConstraints = critical,CA:TRUE
keyUsage = critical,digitalSignature,keyEncipherment,keyCertSign
extendedKeyUsage = serverAuth
CNF
openssl req -x509 -newkey rsa:2048 -nodes -days 825 -config greenmail-dev/server.cnf \
  -keyout greenmail-dev/server.key -out greenmail-dev/server.pem
openssl pkcs12 -export -name greenmail -in greenmail-dev/server.pem -inkey greenmail-dev/server.key \
  -passout pass:changeit -out greenmail-dev/greenmail.p12
chmod 644 greenmail-dev/greenmail.p12
```

### 2. Subir o GreenMail

```sh
docker compose -f docker-compose-email-dev.yaml up -d
```

Portas no host (só em `127.0.0.1`):

| Porta | Uso |
| --- | --- |
| 993 | IMAPS do backend. |
| 465 | SMTPS do backend. |
| 3025, 3143 | SMTP e IMAP sem TLS, para o lado do cliente. |
| 8083 | API REST do GreenMail. |

O GreenMail guarda tudo em memória: reiniciar o container apaga os e-mails.

### 3. Backend

No `backend/.env`, além do que você já usa:

```sh
ENCRYPTION_KEY=<valor gerado com openssl rand -hex 32>
EMAIL_ALLOW_PRIVATE_HOSTS=true
# opcional; já vem ligado
EMAIL_IMAP_IDLE=true
```

`NODE_ENV` não pode ser `production`. Inicie o backend passando o certificado no ambiente do processo:

```sh
cd backend
NODE_EXTRA_CA_CERTS="$PWD/../greenmail-dev/server.pem" npm run dev:server
```

Backend em container (`docker-compose-local.yaml`): a imagem usa `NODE_ENV=production`, então `EMAIL_ALLOW_PRIVATE_HOSTS` é ignorada e o GreenMail é recusado. Para testar o canal com o GreenMail, rode o backend pelo código, como acima.

### 4. Conectar as caixas

1. Ligue o canal para a empresa (super admin, ver acima).
2. Como admin da empresa, abra **Conexões › Nova conexão › E-mail › E-mail próprio** e preencha:
   - **E-mail:** `caixa-a@empresa-a.test`; **Senha:** `senha123`;
   - **IMAP:** `localhost`, porta 993, TLS;
   - **SMTP:** `localhost`, porta 465, TLS.
3. **Testar conexão** e salvar. A conta aparece como ativa.

Para testar duas empresas, repita com `caixa-b@empresa-b.test` na outra empresa.

### 5. Mandar e ler e-mails como o cliente

Com `curl`, que já vem no macOS:

```sh
printf 'From: Cliente <cliente@externo.test>\r\nTo: caixa-a@empresa-a.test\r\nSubject: Primeiro contato\r\nMessage-ID: <primeiro-contato-1@externo.test>\r\n\r\nOla, quero um orcamento.\r\n' > /tmp/mail.txt
curl smtp://127.0.0.1:3025 --mail-from cliente@externo.test --mail-rcpt caixa-a@empresa-a.test --upload-file /tmp/mail.txt

# o que chegou na caixa do cliente (as respostas do atendente)
curl "imap://127.0.0.1:3143/INBOX" -u cliente@externo.test:senha123 -X "SEARCH ALL"
curl "imap://127.0.0.1:3143/INBOX;UID=1;SECTION=HEADER.FIELDS%20(FROM%20SUBJECT%20IN-REPLY-TO)" -u cliente@externo.test:senha123
```

Um cliente de e-mail, como o Thunderbird, também funciona com `cliente@externo.test` em `127.0.0.1`: IMAP na porta 3143 e SMTP na 3025, sem TLS.

Outras ações pela API do GreenMail:

```sh
# criar outra caixa
curl -X POST localhost:8083/api/user -H 'Content-Type: application/json' \
  -d '{"email":"outra@externo.test","login":"outra@externo.test","password":"senha123"}'
# apagar todos os e-mails
curl -X POST localhost:8083/api/mail/purge
```

### Problemas comuns

| Sintoma | Causa |
| --- | --- |
| `ERR_EMAIL_HOST_NOT_ALLOWED` | Falta `EMAIL_ALLOW_PRIVATE_HOSTS=true`, ou o backend está com `NODE_ENV=production`. |
| `ERR_EMAIL_CONNECTION_FAILED` logo no teste | O backend não confia no certificado. Inicie com `NODE_EXTRA_CA_CERTS` no ambiente, não no `.env`. Confira com `openssl s_client -connect localhost:993 -CAfile greenmail-dev/server.pem`, que deve terminar em `Verify return code: 0`. |
| `ERR_EMAIL_PORT_NOT_ALLOWED` | Porta diferente de 993/143 (IMAP) ou 465/587 (SMTP). Use as portas mapeadas do compose. |
| `ERR_EMAIL_AUTH_FAILED` | Login ou senha errados. O login é o endereço completo. |

## Checklist de aceite

Rodado em 2026-10-19 contra o backend real (`node dist/server.js`), o GreenMail 2.1.13 e duas empresas:

- **Empresa Meta:** `whatsappMode = meta`, caixa `alpha@empresa-a.test`;
- **Empresa QR:** `whatsappMode = normal`, caixa `beta@empresa-b.test`.

Tudo foi feito pela API HTTP, logado como o admin de cada empresa e como o super admin. As duas empresas tiveram o mesmo resultado em todos os itens. Os testes automatizados (`npx jest`) rodaram completos, sem regressão.

| # | Item | Resultado |
| --- | --- | --- |
| A | Ligar o canal nas duas empresas pelo super admin e conectar uma caixa própria em cada uma. | OK. Antes de ligar: 403 `ERR_EMAIL_CHANNEL_DISABLED`. Senha errada no teste: `ERR_EMAIL_AUTH_FAILED`. Credenciais cifradas no banco. |
| B | Cliente escreve com Cc e anexo, o ticket aparece e o atendente responde pela API. | OK nas duas empresas. A resposta chega ao cliente com `From` = caixa da empresa e `In-Reply-To`/`References` certos. Também verificados: anexo nos dois sentidos, responder a todos (o Cc recebe), Cc digitado no compositor, resposta do cliente caindo no mesmo ticket, HTML sanitizado (`<script>` removido) e `*negrito*`/`_itálico_` virando `<strong>`/`<em>`. |
| C | IMAP IDLE. | OK. Com IDLE, o e-mail entra em cerca de 0,5 s (4 de 4 amostras). Só com polling, entra em 10,8 s, 40,4 s e 51,6 s (tick de 1 minuto). |
| D | Reiniciar o backend. | OK. Conversas intactas e nenhuma linha duplicada em `EmailMessages` (mesma contagem antes e depois, em três reinícios). Um e-mail recebido com o backend parado entrou no primeiro tick depois da subida. |
| E | Isolamento entre empresas. | OK. A empresa B recebe 404 na conta (PUT, sync, DELETE), na thread e no anexo da empresa A. A listagem da B mostra só a caixa dela. |
| F | Senha inválida. | OK. A conta vai para `reauth_required` com `lastError.code = ERR_EMAIL_AUTH`, que o compositor mostra pela thread. O envio é recusado com `ERR_EMAIL_ACCOUNT_UNAVAILABLE`. Corrigir a senha em Conexões reativa a conta, e o e-mail recebido durante a reautenticação entra em seguida. |
| G | Envio com o servidor fora do ar. | OK. Servidor parado (conexão recusada): o envio fica `queued`, é refeito e é entregue **uma vez** quando o servidor volta. Servidor travado depois do `DATA`: o envio fica `unknown` (`ERR_EMAIL_SEND_AMBIGUOUS`, "envio não confirmado") e **não** é reenviado. Repetir a requisição com a mesma `idempotencyKey` não cria outro envio. |
| H | Desligar e religar o canal. | OK. Desligado: rotas e envio respondem 403, `lastSyncAt` para e a outra empresa continua normal. Religado: o e-mail recebido no intervalo entra no tick seguinte e o IDLE volta. |
| I | Regressão do WhatsApp. | OK. As suítes de WhatsApp (QR e Meta) passam. Nenhum ponto do canal de e-mail decide nada por `whatsappMode` ou `apiMode`. |

Limitação conhecida (IMAP): se uma pasta for recriada no servidor (o `UIDVALIDITY` muda, o que é raro: migração de servidor ou caixa apagada e criada de novo), o cursor recomeça do fim da pasta. Os e-mails que chegaram entre a última sincronização e a recriação não são importados. Trocar a senha não muda o `UIDVALIDITY`.

Pendentes, para o responsável, porque dependem de contas reais (os itens do Gmail também precisam do projeto no Google Cloud):

- Gmail: conectar, receber e responder um e-mail real; e "Entrar com Google" sem pedir acesso ao e-mail (roteiro em "Teste funcional" acima).
- Gmail: revogar o acesso em https://myaccount.google.com/permissions. A conta deve mostrar "Autorização expirada" e o compositor deve avisar.
- Gmail: cursor expirado. Grave um `historyId` antigo em `EmailAccounts.syncCursor`; a próxima rodada deve refazer a janela recente sem duplicar.
- Gmail: push duplicado. O mesmo aviso do Pub/Sub entregue duas vezes deve gerar uma única rodada.
- iCloud com senha de app: conectar uma caixa real e repetir os itens B e F.
