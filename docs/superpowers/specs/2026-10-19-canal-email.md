# Instrução de implementação — Gmail e e-mail empresarial no EspaçoWhats

> Cópia da instrução enviada por Guilherme Santos em 19/10/2026, seguida do pedido dele na mesma mensagem:
> **"quero implementar primeiro o email, deixar ele funcional. Quero poder ativar e desativar essa funcionalidade para cada tenant, nas telas de configurações."**
>
> Design de referência: artefato https://claude.ai/artifact/FUn4TvVDR1GG5DqYzCrVhq, pranchetas "Atendimentos – Multicanal" e "Conexões – Multicanal".

**Revisado em 18/10/2026.** Objetivo: receber e enviar e-mails dentro da caixa de atendimento do EspaçoWhats, usando Gmail/Google Workspace ou uma caixa empresarial IMAP + SMTP. O design da interface já foi definido pelo proprietário; implemente o fluxo nesse design. Este canal deve funcionar em empresas com WhatsApp oficial e em empresas com WhatsApp por QR, sem depender de `Company.whatsappMode`.

## Ponto de partida verificado no código

- O login “Entrar com Google” usa Clerk em `frontend/src/services/googleAuth.js` e `backend/src/services/AuthServices/ClerkGoogleAuthService.ts`. O backend verifica a identidade e emite **tokens de login do próprio EspaçoWhats**. Hoje ele não cria uma conexão de caixa postal nem demonstra ter escopos Gmail.
- O repositório usa backend Node/TypeScript/Express/Sequelize/Postgres/Bull e frontend React 17/JavaScript. `Ticket` e `Message` possuem `channel`, mas `Ticket.whatsappId`, o envio e o contato estão orientados a WhatsApp. `Contact.number` é obrigatório; não invente números para representar e-mail.
- Leia `AGENTS.md` e preserve o login Google existente. O endereço de login pode ser diferente da caixa postal compartilhada que a empresa deseja conectar.

## Arquitetura recomendada

Crie um canal `email` com dois adapters: `GmailApiAdapter` e `ImapSmtpAdapter`. Ambos devem entregar um objeto interno normalizado (`accountId`, `threadId`, `providerMessageId`, `internetMessageId`, `from`, `to`, `cc`, `subject`, `text`, `htmlSanitized`, anexos, timestamps, flags) a um mesmo serviço de tickets. A conexão deve pertencer à empresa e ter permissões por usuário/fila. Uma empresa pode conectar várias caixas.

| Tipo de caixa | Receber | Enviar | Autorização |
| --- | --- | --- | --- |
| Gmail/Google Workspace | Gmail API: sincronização inicial, `users.watch`, Pub/Sub e `history.list` | `users.messages.send` com mensagem MIME codificada em base64url | Consentimento OAuth Google para a **caixa**, separado da autorização de login; escopos mínimos. |
| Provedor IMAP/SMTP | IMAP com `IDLE` quando disponível e varredura periódica de recuperação | SMTP sobre TLS | OAuth2/XOAUTH2 ou credencial específica aceita pelo provedor, nunca pressupor que senha normal funcionará. |

A [Gmail API](https://developers.google.com/workspace/gmail/api/guides) é a escolha indicada pelo Google para aplicações web que precisam acessar uma caixa Gmail. O [push do Gmail](https://developers.google.com/workspace/gmail/api/guides/push) usa Cloud Pub/Sub e o `watch` precisa ser renovado ao menos a cada sete dias; [sincronização incremental](https://developers.google.com/workspace/gmail/api/guides/sync) usa o histórico. Para Gmail via IMAP/SMTP, o Google exige o escopo amplo `https://mail.google.com/`; por isso prefira Gmail API com escopos mais específicos. [Referência XOAUTH2](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol).

## Como ampliar a integração Google existente

Implemente um comando “Conectar Gmail” **depois** do login. Não peça acesso à caixa postal a todos os usuários que apenas entram no sistema. Existem dois caminhos compatíveis com a infraestrutura atual; escolha um após um teste funcional e documente a decisão:

1. **Reutilizar Clerk com escopos adicionais.** O Clerk permite solicitar escopos extras na conexão social Google e obter o token do provedor no backend via `getUserOauthAccessToken()`. Teste no SDK e no fluxo customizado exatos instalados, confira os escopos realmente concedidos e a disponibilidade de token atualizado em jobs de background. Não presuma que o token de login do EspaçoWhats é um token Gmail. O Clerk informa que não atualiza proativamente tokens do provedor. [Conexões sociais e escopos](https://clerk.com/docs/tanstack-react-start/guides/configure/auth-strategies/social-connections/overview), [token do provedor](https://clerk.com/docs/reference/backend/user/get-user-oauth-access-token).
2. **Fluxo OAuth Google dedicado à caixa postal.** Reaproveite o projeto Google Cloud, se adequado, mas crie consentimento incremental, callback backend, `state` contra CSRF, troca do código no servidor e acesso offline/refresh token para sincronização autônoma. Vincule a caixa autorizada a `companyId` e ao usuário operador que iniciou o vínculo. Esse caminho é preferível quando a caixa é compartilhada, difere do login ou o Clerk não sustenta os jobs. [Boas práticas OAuth do Google](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).

Escopos mínimos para um MVP de leitura e envio: `gmail.readonly` + `gmail.send`; peça `gmail.modify` só se a aplicação alterar marcadores/estado de leitura no Gmail. `gmail.readonly` é **restrito**; `gmail.send` é **sensível**. Aplicativo público pode precisar de verificação OAuth, e dados de escopo restrito transmitidos/armazenados no servidor exigem avaliação de segurança do Google. Planeje isso antes de prometer ativação para todos os clientes. [Tabela oficial de escopos](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Dados e migrations

Crie `EmailAccount` (ou `ChannelConnection` compartilhada com Instagram) com `id`, `companyId`, `provider` (`gmail_api|imap_smtp`), endereço autorizado, nome de exibição, estado (`connecting|active|reauth_required|error|disabled`), identificador externo da conta, permissões/escopos, dados de servidores quando IMAP, credenciais **cifradas** via mecanismo de segredo do projeto, cursor de sincronização, data da última sincronização e metadados de erro sem segredo. Nunca exponha refresh tokens em API, logs ou Socket.IO.

Crie uma identidade de contato por canal, por exemplo `ContactIdentity(companyId, channel, accountId, externalId, contactId)`, onde `externalId` para e-mail é o endereço normalizado. Mantenha `Contact` como perfil da pessoa e preserve contatos WhatsApp existentes. Planeje a migração de `Contact.number` obrigatório para aceitar contatos só com e-mail **após auditar todos os serviços que presumem telefone**; use índices únicos por empresa, canal e conta. Não una automaticamente duas pessoas apenas por nome parecido.

Para tickets e mensagens, acrescente vínculo com a conta de e-mail e campos de threading sem reusar `whatsappId` como ID de e-mail: `providerThreadId`, `providerMessageId`, `Message-ID`, `In-Reply-To`, `References`, assunto, remetentes/destinatários, `receivedAt`, flags e vínculo com anexos. `Message.channel=email` pode ser reutilizado, desde que o renderizador e os fluxos WhatsApp não processem esse registro como JID ou telefone. Garanta unicidade e idempotência por `(companyId, emailAccountId, providerMessageId)`; para IMAP considere `mailbox + UIDVALIDITY + UID`, além de `Message-ID` como apoio.

## Entrada de mensagens

1. **Gmail:** após consentimento, descubra o endereço da caixa, registre `watch` com Pub/Sub e guarde o `historyId` inicial; faça importação inicial limitada e paginada; depois processe `history.list` a partir desse cursor para fechar a janela de corrida. Renove o `watch` em job diário. O webhook Pub/Sub deve verificar origem/autenticidade da notificação, responder rapidamente e enfileirar processamento. Use `history.list` para buscar mudanças seguintes; se o cursor expirar, refaça sincronização segura com deduplicação. Sincronize também mensagens enviadas pela própria caixa para evitar conversas incompletas.
2. **IMAP:** conecte por TLS, descubra recursos do servidor, acompanhe INBOX via `IDLE` se disponível, reconecte quando necessário e faça polling periódico de recuperação. Preserve cursor por pasta e `UIDVALIDITY`; sincronize Sent quando possível. A opção de servidor arbitrário requer proteção contra SSRF: validar hostname/portas e impedir destinos internos mesmo após resolução DNS/redirecionamento.
3. Parseie MIME e anexos com limite de tamanho, verificação de tipo e armazenamento por empresa. Sanitize HTML antes de mostrar na UI; nunca execute conteúdo ativo. Separe anexos da mensagem e controle acesso por `companyId`.
4. Agrupe respostas por identificadores de thread e cabeçalhos, com fallback conservador para assunto/remetentes. Tratamento de múltiplos destinatários, CC, resposta a todos, encaminhamento e aliases deve ser explícito.

## Saída de mensagens

- Gmail: construir MIME com `From` autorizado, `To`, `Cc`, `Subject`, `Message-ID`, `In-Reply-To`, `References` e anexos; chamar `users.messages.send`; gravar o ID retornado e reconciliar a cópia em Sent. [Guia oficial de envio](https://developers.google.com/workspace/gmail/api/guides/sending).
- IMAP/SMTP: usar SMTP sobre TLS e autenticação permitida pelo provedor; só marcar `sent` após confirmação do servidor e reconciliar com a pasta Sent, se ela existir. Tratar recusas, rate limits e bounces sem repetir envios ambíguos.
- Toda rota de envio deve verificar empresa, usuário, conta e destinatários; aplicar idempotência, fila e trilha de auditoria. Evite enviar em massa como efeito colateral da sincronização.

## Bibliotecas recomendadas

- `googleapis` ou cliente HTTP oficial/compatível para Gmail API; pin de versão e revisão de escopos.
- [ImapFlow](https://github.com/postalsys/imapflow) para IMAP; confira o requisito atual de Node.js antes de instalar. [Nodemailer](https://nodemailer.com/smtp) para SMTP; [MailParser](https://nodemailer.com/extras/mailparser) para MIME.
- [EmailEngine](https://github.com/postalsys/emailengine/blob/master/README.md) é alternativa pronta com Gmail, IMAP, SMTP e webhooks, mas tem **licença comercial** após o teste. Avalie custo e necessidade de mais um serviço antes de adotá-lo.
- Para Microsoft 365, implemente OAuth2/Graph ou XOAUTH2 conforme o provedor, pois autenticação básica pode estar desabilitada. [Microsoft Learn](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth).

## Ordem de execução e aceite

1. Prove o consentimento e acesso a uma caixa Gmail de teste sem alterar o login existente. Registre escopos, renovação e desconexão.
2. Crie migrations, adapters, sincronização, normalização de contato/ticket e rotas autenticadas. Integre com o design existente.
3. Teste com duas empresas, duas caixas, resposta, anexos, CC, reconexão, cursor expirado, duplicação de webhook, envio com timeout e revogação OAuth. Execute build e testes relevantes.

**Aceite:** receber e responder a um e-mail real pela conta correta; a conversa reaparece após reinício do servidor; outra empresa não acessa a caixa; login Google continua funcionando sem consentimento de e-mail; usuário recebe estado claro quando a autorização vence.
