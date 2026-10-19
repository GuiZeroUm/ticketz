# Canal de e-mail (Gmail + IMAP/SMTP) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber e responder e-mails como atendimentos no Espaço Whats, por Gmail/Google Workspace (Gmail API) e por caixas IMAP/SMTP (iCloud e e-mail próprio). O canal é ligado ou desligado por empresa (tenant) nas telas de Configurações.

**Architecture:** Um módulo `backend/src/services/EmailServices/` tem dois adapters (`GmailApiAdapter`, `ImapSmtpAdapter`) com a mesma interface. Os dois entregam um `NormalizedEmail` a um único `IngestEmailService`, que resolve contato (`ContactIdentity`), ticket (um ticket por thread) e `Message` (`channel = "email"`), e guarda os metadados de e-mail em `EmailMessages`. A sincronização roda em filas Bull, com polling a cada minuto como base, mais push do Gmail (Pub/Sub) e IDLE do IMAP como aceleradores. O envio passa por `POST /messages/:ticketId` → `SendEmailService` → job `EmailSend`, com idempotência e sem reenvio automático quando o resultado é ambíguo.

**Tech Stack:** Backend Node 24 / TypeScript / Express / Sequelize 6 / Postgres / Bull. Novas dependências: `imapflow`, `nodemailer`, `mailparser`, `@googleapis/gmail`, `google-auth-library` (versões fixas; `sanitize-html` já existe). Frontend React 17 (JavaScript) / Material-UI v4.

**Spec:** `docs/superpowers/specs/2026-10-19-canal-email.md` (instrução de 18/10/2026 + pedido do Guilherme). Design: artefato https://claude.ai/artifact/FUn4TvVDR1GG5DqYzCrVhq, pranchetas "Atendimentos – Multicanal" e "Conexões – Multicanal".

## Decisões tomadas neste plano

- **OAuth Google dedicado à caixa (caminho 2 da spec), não Clerk.** Motivos: a caixa conectada costuma ser compartilhada e diferente do login; os jobs de sincronização precisam de refresh token próprio, e o Clerk não renova tokens do provedor de forma proativa. Os arquivos de login (`ClerkGoogleAuthService.ts`, `googleAuth.js`, `config/clerk.ts`) **não são tocados**. A Task 14 inclui o teste funcional com uma caixa Gmail de teste e registra a decisão em `docs/email-channel.md`.
- **Liga/desliga por tenant = setting `emailChannelEnabled` (`"true"`/`"false"`, padrão `"false"`).** Quem altera é o super admin, em Configurações › Empresas (`CompaniesManager`), igual a `campaignsEnabled`. O admin do tenant não consegue alterar esse valor via `PUT /settings/:key`.
- **Escopo de provedores:** Gmail (OAuth), iCloud (senha de app) e e-mail próprio (IMAP/SMTP). Hotmail/Outlook continua "Em breve" no seletor (exige OAuth Microsoft; fica para um plano próprio). Instagram não entra neste plano.
- **Ordem:** a base comum e o caminho IMAP/SMTP vêm antes do Gmail, porque podem ser testados de ponta a ponta localmente com um servidor GreenMail, sem projeto no Google Cloud. O Gmail depende de credenciais OAuth que o Guilherme precisa criar (ver Task 14).
- **Um ticket por thread de e-mail.** O ticket guarda `subject`, `emailAccountId` e `emailThreadKey`. `Ticket.whatsappId` fica `NULL` em tickets de e-mail.
- **Contato só com e-mail:** `Contact.number` passa a aceitar `NULL` apenas quando `Contact.channel = 'email'` (CHECK no banco). O e-mail é ligado ao contato por `ContactIdentities`, único por `(companyId, channel, externalId)`. A spec sugere incluir a conta no índice. Não incluímos porque o mesmo remetente escrevendo para duas caixas da empresa é a mesma pessoa. A conta que viu o endereço primeiro fica registrada em `emailAccountId`, só como informação.
- **E-mails enviados direto pela caixa (fora do sistema)** só entram quando pertencem a uma thread que já tem ticket. Um e-mail novo enviado pelo Gmail a outra pessoa não abre ticket.
- **Importação inicial:** últimas 24 h, no máximo 50 mensagens, entrando como `pending`.
- **Aliases:** o `From` de um envio é sempre o endereço da conta. Envio por alias fica fora deste plano. Um e-mail recebido num alias entra na conta normalmente, e "responder a todos" retira o endereço da conta da lista.
- **Bounces:** um aviso de não entrega (`multipart/report; report-type=delivery-status`, ou remetente `mailer-daemon`/`postmaster`) não abre ticket. Quando ele aponta para um envio nosso, esse envio passa a `failed` com `ERR_EMAIL_BOUNCED`. Quando não aponta, é descartado.
- **Negrito/itálico no compositor:** marcadores `*negrito*` e `_itálico_` (os mesmos do WhatsApp) no texto. O HTML enviado é gerado por `renderEmailHtml`.

## Global Constraints

- Não depender de `Company.whatsappMode`: o canal funciona em empresas `normal` e `meta`.
- Escopos Gmail exatamente `https://www.googleapis.com/auth/gmail.readonly` e `https://www.googleapis.com/auth/gmail.send`. Sem `gmail.modify`, sem `https://mail.google.com/`.
- Credenciais (senha de app, senha IMAP, refresh token) ficam cifradas com `encryptSecret`/`decryptSecret` (`backend/src/helpers/cryptoSecret.ts`). Nunca aparecem em resposta de API, log, Socket.IO ou `lastError`.
- Status de conta: `connecting | active | reauth_required | error | disabled`. Provider: `gmail_api | imap_smtp`. Preset: `gmail | icloud | custom`.
- Unicidade de mensagem: `(companyId, emailAccountId, providerMessageId)`. No IMAP, `providerMessageId = "<pasta>:<UIDVALIDITY>:<UID>"`.
- Limites (em `EmailServices/limits.ts`): `MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024`; `MAX_INBOUND_ATTACHMENTS_BYTES = 50 * 1024 * 1024`; `MAX_OUTBOUND_ATTACHMENTS_BYTES = 25 * 1024 * 1024`; `MAX_RECIPIENTS = 20`; `SYNC_BATCH_MAX = 100`; `INITIAL_IMPORT_HOURS = 24`; `INITIAL_IMPORT_MAX = 50`; `SUBJECT_FALLBACK_DAYS = 30`; `MAX_REFERENCES = 20`.
- Códigos de erro da API ficam como chaves (`ERR_EMAIL_*`); o frontend traduz com `i18n.t`. Todo texto de UI usa o i18n do frontend (AGENTS.md).
- Toda rota de e-mail, exceto `GET /email/availability` e o callback OAuth, chama `assertEmailEnabled(companyId)`.
- Jobs por empresa filtram com `runtimeCompanyWhere()` / `runtimeOwnsCompany()` (`helpers/tenantRuntime.ts`).
- Após editar o backend: `cd backend && npx eslint --fix src/**/*.ts`. Após editar o frontend: `cd frontend && npx prettier --write <arquivos>`.
- Testes backend: `cd backend && NODE_ENV=test npx jest <arquivo>` (sem banco; models mockados, como em `MetaWhatsAppServices/__tests__/HandleMetaInboundMessageService.spec.ts`).

## Review Focus

1. **A mesma mensagem chega duas vezes** (push duplicado, polling e IDLE ao mesmo tempo, job reexecutado) → uma única `Message`. Teste na Task 8 (`ingests the same providerMessageId once`) e na Task 11 (`dedupes sync jobs by account`).
2. **Tenant desligado com e-mails chegando** → nada é importado nem enviado enquanto estiver desligado. Ao religar, a sincronização continua do cursor guardado, sem perder mensagens. Teste na Task 11 (`skips accounts of disabled companies and keeps cursor`).
3. **E-mail hostil** (`<script>`, `onerror`, `javascript:` em link, imagem remota de rastreio, anexo de 100 MB) → HTML limpo, imagens remotas removidas, anexo grande registrado como ignorado e o resto da mensagem importado. Testes nas Tasks 5 e 6.
4. **Timeout durante o envio** → sem reenvio automático. A mensagem fica com status "envio não confirmado" e vira "enviada" quando a cópia aparece em Enviados. Teste na Task 12 (`marks ambiguous send as unknown and never retries`) e na Task 8 (`reconciles outbound copy by internetMessageId`).
5. **Contato sem telefone em recurso só de WhatsApp** (agendamento, campanha, push, seleção de contatos) → recusa clara ou o contato é ignorado, sem quebrar. Testes na Task 4.

---

### Task 1: Liga/desliga do e-mail por empresa (backend)

**Files:**
- Create: `backend/src/services/EmailServices/EmailAccessService.ts`
- Create: `backend/src/routes/emailRoutes.ts` (só a rota de disponibilidade nesta task)
- Modify: `backend/src/routes/index.ts` (registrar `emailRoutes`)
- Modify: `backend/src/controllers/CompanyController.ts:41-42,73-74` (Yup `emailChannelEnabled: Yup.boolean()`)
- Modify: `backend/src/services/CompanyService/UpdateCompanyService.ts:209-258` e `CreateCompanyService.ts:274-300` (findOrCreate do Setting `emailChannelEnabled`, como `campaignsEnabled`)
- Modify: `backend/src/controllers/SettingController.ts:33-52` (bloquear chaves gerenciadas pelo super admin)
- Test: `backend/src/services/EmailServices/__tests__/EmailAccessService.spec.ts`, `backend/src/controllers/__tests__/SettingController.superManaged.spec.ts`

**Interfaces:**
- Produces: `emailEnabledForCompany(companyId: number): Promise<boolean>`; `assertEmailEnabled(companyId: number): Promise<void>` (lança `AppError("ERR_EMAIL_CHANNEL_DISABLED", 403)`); `EMAIL_SETTING_KEY = "emailChannelEnabled"`; rota `GET /email/availability` (isAuth) → `{ enabled: boolean }`; constante `SUPER_MANAGED_SETTING_KEYS = ["emailChannelEnabled"]` exportada de `SettingController.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it("is disabled when the setting is missing", async () => {
  jest.spyOn(Setting, "findOne").mockResolvedValue(null);
  await expect(emailEnabledForCompany(7)).resolves.toBe(false);
});
it("is enabled only for value 'true' on an active company", async () => {
  mockSetting("true"); mockCompany({ status: true });
  await expect(emailEnabledForCompany(7)).resolves.toBe(true);
});
it("assertEmailEnabled throws ERR_EMAIL_CHANNEL_DISABLED with 403", async () => {
  mockSetting("false");
  await expect(assertEmailEnabled(7)).rejects.toMatchObject({ message: "ERR_EMAIL_CHANNEL_DISABLED", statusCode: 403 });
});
// SettingController
it("rejects PUT /settings/emailChannelEnabled from a non-super admin with ERR_NO_PERMISSION 403", ...);
it("lets a super user update emailChannelEnabled", ...);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && NODE_ENV=test npx jest src/services/EmailServices/__tests__/EmailAccessService.spec.ts src/controllers/__tests__/SettingController.superManaged.spec.ts`
Expected: FAIL (módulo inexistente / update permitido)

- [ ] **Step 3: Implement**

`emailEnabledForCompany` lê o Setting com `GetCompanySetting(companyId, "emailChannelEnabled", "false")` e exige `Company.status` ativo. Em `SettingController.update`, recusar a chave em `SUPER_MANAGED_SETTING_KEYS` quando `!req.user.isSuper`, com o mesmo erro usado hoje para chaves `_`. Em Create/UpdateCompanyService, persistir `"true"`/`"false"` como em `campaignsEnabled`. Ao desligar, não apagar contas nem tickets: a sincronização apenas para (Task 11).

- [ ] **Step 4: Run tests to verify they pass** (mesmo comando) → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src && git commit -m "feat(email): per-company email channel toggle"
```

### Task 2: Liga/desliga do e-mail por empresa (frontend)

**Files:**
- Modify: `frontend/src/components/CompaniesManager/index.js` (campo `emailChannelEnabled` ao lado de `campaignsEnabled` em :441; coluna na lista ao lado de :714; leitura em `handleSelect` :926-955)
- Create: `frontend/src/hooks/useEmailAvailability/index.js`
- Create: `frontend/src/translate/languages/emailChannel.js` e registrar em `frontend/src/translate/languages/index.js` (mesmo padrão de `whatsappProviders.js`, mesmas línguas que esse arquivo cobre)

**Interfaces:**
- Consumes: `GET /email/availability`, `PUT /companies/:id` com `emailChannelEnabled: boolean`.
- Produces: `useEmailAvailability(): { enabled: boolean, loading: boolean }`. O hook busca ao montar, no `focus` da janela e no evento `window` `"email-availability-changed"`. O `CompaniesManager` dispara esse evento depois de salvar. Chaves de i18n em `emailChannel.*`, por exemplo `emailChannel.companies.enabled` = "Canal de e-mail".

- [ ] **Step 1:** Adicionar o select "Canal de e-mail" (Habilitado/Desabilitado) no formulário de empresa e a coluna na tabela.
- [ ] **Step 2:** Criar o hook seguindo `components/AgentPreview/AgentAvailability.js` (busca, foco e evento) e devolver `enabled = false` em erro.
- [ ] **Step 3: Verify**

Run: `cd frontend && npx prettier --write src/components/CompaniesManager/index.js src/hooks/useEmailAvailability/index.js src/translate/languages/emailChannel.js src/translate/languages/index.js && NODE_OPTIONS=--openssl-legacy-provider npm run build`
Expected: build sem erros. Manual: como super admin, ligar e desligar o campo de uma empresa, recarregar e conferir que o valor persiste. `GET /email/availability` logado nessa empresa reflete o valor.

- [ ] **Step 4: Commit** `git commit -m "feat(email): toggle email channel per company in settings"`

### Task 3: Migrations e models

**Files:**
- Create migrations em `backend/src/database/migrations/`:
  - `20261019100000-create-email-accounts.ts`
  - `20261019100100-create-contact-identities.ts`
  - `20261019100200-add-email-fields-to-tickets.ts`
  - `20261019100300-create-email-messages.ts`
  - `20261019100400-create-email-attachments.ts`
  - `20261019100500-allow-null-number-for-email-contacts.ts`
- Create models: `backend/src/models/EmailAccount.ts`, `ContactIdentity.ts`, `EmailMessage.ts`, `EmailAttachment.ts`
- Modify: `backend/src/models/Ticket.ts` (`emailAccountId`, `emailThreadKey`, `subject`, `BelongsTo EmailAccount`), `backend/src/models/Contact.ts:51-54` (`number` `AllowNull(true)`, remover `@Unique` do model, já que o índice real é `number_companyid_unique`; `HasMany ContactIdentity as "identities"`), `backend/src/database/index.ts` (registrar models)
- Test: `backend/src/__tests__/helpers/EmailAccountSerialization.spec.ts`

**Schema (colunas exatas):**
- `EmailAccounts`: `id`, `companyId` (FK Companies, CASCADE, NOT NULL), `provider` STRING NOT NULL CHECK in (`gmail_api`,`imap_smtp`), `preset` STRING NOT NULL CHECK in (`gmail`,`icloud`,`custom`), `name` STRING NOT NULL, `address` STRING NOT NULL (minúsculo), `status` STRING NOT NULL default `connecting` CHECK in os 5 status, `externalId` STRING NULL, `scopes` JSONB default `[]`, `imapHost`, `imapPort`, `imapSecure`, `smtpHost`, `smtpPort`, `smtpSecure` (NULL para gmail), `credentials` TEXT NULL (cifrado), `syncCursor` JSONB NULL, `lastSyncAt` DATE NULL, `lastError` JSONB NULL (`{code, at}`), `errorCount` INT default 0, `queueId` (FK Queues, SET NULL), `connectedByUserId` (FK Users, SET NULL), `watchExpiresAt` DATE NULL, timestamps. Índice único `email_accounts_company_address_unique (companyId, address)`.
- `ContactIdentities`: `id`, `companyId` (FK CASCADE), `contactId` (FK Contacts CASCADE), `channel` STRING NOT NULL, `externalId` STRING NOT NULL, `emailAccountId` (FK SET NULL, NULL), timestamps. Único `contact_identities_company_channel_external_unique (companyId, channel, externalId)`.
- `Tickets` + `emailAccountId` (FK EmailAccounts SET NULL), `emailThreadKey` STRING NULL, `subject` STRING(998) NULL. Índice `tickets_email_thread_idx (companyId, emailAccountId, emailThreadKey)`.
- `EmailMessages`: `id`, `companyId`, `emailAccountId` (FK SET NULL), `ticketId` (FK Tickets CASCADE), `messageId` STRING NOT NULL (= `Messages.id`), `direction` STRING CHECK in (`in`,`out`), `providerMessageId` STRING NULL, `providerThreadId` STRING NULL, `internetMessageId` STRING NULL, `inReplyTo` STRING NULL, `references` JSONB default `[]`, `subject` STRING(998), `fromAddress` JSONB, `toAddresses` JSONB, `ccAddresses` JSONB, `htmlSanitized` TEXT NULL, `receivedAt` DATE, `flags` JSONB default `[]`, `sendStatus` STRING NULL CHECK in (`queued`,`sent`,`failed`,`unknown`), `sendError` JSONB NULL, `userId` (FK SET NULL), `idempotencyKey` STRING NULL, timestamps. Único parcial `email_messages_provider_unique (companyId, emailAccountId, providerMessageId) WHERE providerMessageId IS NOT NULL`. Único parcial `email_messages_idempotency_unique (companyId, idempotencyKey) WHERE idempotencyKey IS NOT NULL`. Índice `(emailAccountId, internetMessageId)`.
- `EmailAttachments`: `id`, `companyId`, `emailMessageId` (FK CASCADE), `filename`, `contentType`, `size` INT, `storageKey` STRING NULL, `contentId` STRING NULL, `inline` BOOLEAN, `skippedReason` STRING NULL, timestamps.
- `Contacts`: `number` DROP NOT NULL + `CONSTRAINT contacts_number_required_unless_email CHECK ("number" IS NOT NULL OR "channel" = 'email')`. O `down` só restaura NOT NULL depois de apagar contatos com `number IS NULL` e `channel = 'email'` (comentar isso no arquivo).

**Interfaces:**
- Produces: `EmailAccount.prototype.getCredentials(): EmailCredentials | null` e `setCredentials(c: EmailCredentials | null): void`, com `type EmailCredentials = { password?: string; refreshToken?: string }`. `EmailAccount.prototype.toJSON()` remove `credentials` e `syncCursor`. `serializeEmailAccount(a: EmailAccount)` → `{ id, provider, preset, name, address, status, queueId, lastSyncAt, lastError, imapHost, imapPort, smtpHost, smtpPort, updatedAt }`.

- [ ] **Step 1: Write the failing test**

```ts
it("never serializes credentials or syncCursor", () => {
  const a = EmailAccount.build({ companyId: 1, provider: "imap_smtp", preset: "custom", name: "Contato", address: "c@x.com" });
  a.setCredentials({ password: "s3cret" });
  expect(JSON.stringify(a)).not.toContain("s3cret");
  expect(JSON.stringify(serializeEmailAccount(a))).not.toMatch(/credentials|s3cret|syncCursor/);
  expect(a.getCredentials()).toEqual({ password: "s3cret" });
});
```

- [ ] **Step 2:** Rodar o teste e conferir que FALHA (`EmailAccount` não existe).
- [ ] **Step 3:** Criar migrations e models no estilo de `20260920120000-create-push-subscriptions.ts` (createTable + addIndex; CHECKs por SQL cru dentro da transação).
- [ ] **Step 4: Verify**

Run: `cd backend && NODE_ENV=test npx jest src/__tests__/helpers/EmailAccountSerialization.spec.ts` → PASS. Com o Postgres do `docker-compose-dev.yaml` rodando: `npm run build && NODE_ENV=test npx sequelize db:migrate && NODE_ENV=test npx sequelize db:migrate:undo --name 20261019100000-create-email-accounts.js`. Esperado: sobe e desce as seis migrations sem erro.

- [ ] **Step 5: Commit** `git commit -m "feat(email): email accounts, messages, attachments and contact identities schema"`

### Task 4: Auditoria do que presume telefone

**Files (cada um com a guarda indicada):**
- `backend/src/services/PushNotificationServices/NotifyNewMessageService.ts:98`: `formatPhoneNumber` aceita `null`; para contato sem número, mostra `contact.email` ou o nome.
- `backend/src/services/ScheduleServices/CreateService.ts` e `UpdateService.ts`, além do envio agendado em `backend/src/queues.ts:404-417`: contato sem `number` → `AppError("ERR_CONTACT_HAS_NO_PHONE", 400)` na criação; no job, a entrega é marcada como falha com esse código, sem exceção.
- `backend/src/services/ContactListItemService/*` e `backend/src/queues/campaign.ts`: ignorar contatos com `number IS NULL`.
- `backend/src/services/ContactServices/UpdateContactService.ts` e `backend/src/controllers/ContactController.ts:305`: `CheckContactNumber` só roda quando `number` vem preenchido; contato `channel = "email"` pode ficar sem número.
- `backend/src/services/TicketServices/UpdateTicketService.ts:174,221,279`: confirmar (teste) que mensagens de avaliação, aceite e transferência não rodam para `channel = "email"`.
- `backend/src/services/TicketServices/CreateTicketService.ts`: sem alteração (tickets manuais continuam WhatsApp); teste garante que um contato sem número recebe `ERR_CONTACT_HAS_NO_PHONE`.
- Frontend: `components/TicketListItemCustom/index.js:116` e `components/AvatarContato/index.js` usam `contact.number || contact.email || contact.name` para a cor; `components/ContactModal` não exige número quando `contact.channel === "email"`.
- Test: `backend/src/services/__tests__/EmailContactPhoneGuards.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("NotifyNewMessageService does not throw for a contact without number", ...);
it("CreateScheduleService rejects contact without number with ERR_CONTACT_HAS_NO_PHONE", ...);
it("campaign recipients skip contacts with null number", ...);
it("UpdateContactService keeps number null for channel email", ...);
it("UpdateTicketService does not call SendWhatsAppMessage for channel email on close/accept/transfer", ...);
it("CreateTicketService rejects a contact without number with ERR_CONTACT_HAS_NO_PHONE", ...);
```

- [ ] **Step 2:** Rodar e conferir FAIL. **Step 3:** Aplicar as guardas listadas. **Step 4:** Rodar → PASS; `cd frontend && npx prettier --write <arquivos> && npm run build` (com `NODE_OPTIONS=--openssl-legacy-provider`).
- [ ] **Step 5: Commit** `git commit -m "fix(contacts): handle email-only contacts without phone number"`

### Task 5: Tipos, endereços, thread e HTML seguro

**Files:**
- Create: `backend/src/services/EmailServices/types.ts`, `limits.ts`, `addresses.ts`, `threading.ts`, `sanitizeEmailHtml.ts`, `renderEmailHtml.ts`, `normalizeParsedMail.ts`
- Test: `backend/src/services/EmailServices/__tests__/{addresses,threading,sanitizeEmailHtml,renderEmailHtml,normalizeParsedMail}.spec.ts`
- Modify: `backend/package.json` (adicionar `mailparser` e `@types/mailparser` com versão fixa)

**Interfaces (Produces):**

```ts
export type EmailAddress = { address: string; name?: string };
export type NormalizedAttachment = { filename: string; contentType: string; size: number; content: Buffer; contentId?: string; inline: boolean };
export type NormalizedEmail = {
  accountId: number; direction: "in" | "out";
  providerMessageId: string; providerThreadId?: string;
  internetMessageId?: string; inReplyTo?: string; references: string[];
  from: EmailAddress; replyTo: EmailAddress[]; to: EmailAddress[]; cc: EmailAddress[];
  subject: string; text: string; htmlSanitized?: string;
  attachments: NormalizedAttachment[]; receivedAt: Date; flags: string[];
  bounceOf?: string; // Message-ID do envio original quando o e-mail é um aviso de não entrega
};
export type OutgoingEmail = {
  from: EmailAddress; to: EmailAddress[]; cc: EmailAddress[]; subject: string;
  text: string; html: string; messageId: string; inReplyTo?: string; references: string[];
  attachments: { filename: string; contentType: string; path: string }[]; providerThreadId?: string;
};
normalizeEmailAddress(raw: string): string | null      // trim + minúsculas; null se inválido
parseAddressList(raw: string | string[]): { valid: EmailAddress[]; invalid: string[] }
normalizeSubject(subject: string): string               // remove prefixos Re:/RE:/Res:/RES:/Fwd:/FW:/Enc:/ENC: repetidos, trim, minúsculas
replySubject(subject: string, mode: "reply" | "replyAll" | "forward"): string // "Re: x" / "Fwd: x", sem duplicar prefixo
buildReferences(previous: string[], parentMessageId?: string): string[] // anexa o pai e mantém só os últimos MAX_REFERENCES
sanitizeEmailHtml(html: string): string
renderEmailHtml(text: string): string
normalizeParsedMail(parsed: ParsedMail, meta: { accountId: number; direction: "in" | "out"; providerMessageId: string; providerThreadId?: string; flags?: string[] }): NormalizedEmail
```

- [ ] **Step 1: Write the failing tests** (asserções principais)

```ts
expect(normalizeEmailAddress("  Carla <Compras@BomPreco.com.br> ")).toBe("compras@bompreco.com.br");
expect(normalizeEmailAddress("not-an-email")).toBeNull();
expect(parseAddressList("a@x.com, bad, B <b@y.com>")).toEqual({ valid: [{ address: "a@x.com" }, { address: "b@y.com", name: "B" }], invalid: ["bad"] });
expect(normalizeSubject("RES: Re: FW: Proposta")).toBe("proposta");
expect(replySubject("Re: Proposta", "reply")).toBe("Re: Proposta");
expect(replySubject("Proposta", "forward")).toBe("Fwd: Proposta");
expect(buildReferences(Array.from({ length: 25 }, (_, i) => `<${i}@x>`), "<p@x>")).toHaveLength(20);
// sanitize
const out = sanitizeEmailHtml('<p onclick="x()">oi</p><script>alert(1)</script><a href="javascript:x">l</a><img src="https://track.example/p.gif"><style>body{}</style>');
expect(out).toBe('<p>oi</p><a>l</a>');
expect(sanitizeEmailHtml('<a href="https://x.com">x</a>')).toBe('<a href="https://x.com" target="_blank" rel="noopener noreferrer nofollow">x</a>');
// render
expect(renderEmailHtml("Olá *João*\n_obrigado_ <b>")).toBe("<p>Olá <strong>João</strong><br>\n<em>obrigado</em> &lt;b&gt;</p>");
// normalize
it("uses text part, falls back to html-to-text when text is empty, and sanitizes html", ...);
it("maps inReplyTo, references array and Message-ID from headers", ...);
it("detects a delivery-status report and sets bounceOf from the embedded message's Message-ID", ...);
```

- [ ] **Step 2:** Rodar e conferir FAIL. **Step 3:** Implementar. `sanitizeEmailHtml` usa `sanitize-html` com allowlist de tags de texto/tabela; links só `http`, `https` e `mailto`; nenhuma `img` (as inline viram anexos); `style`, `script`, `iframe`, `form` e atributos `on*` removidos. **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(email): normalized email types, address, threading and html helpers"`

### Task 6: Armazenamento de anexos por empresa

**Files:**
- Create: `backend/src/services/EmailServices/EmailAttachmentStorage.ts`
- Test: `backend/src/services/EmailServices/__tests__/EmailAttachmentStorage.spec.ts`

**Interfaces:**
- Consumes: `privateFiles.directory` (`backend/src/config/privateFiles.ts`), limites da Task 5.
- Produces: `saveInboundAttachments(companyId: number, emailMessageId: number, atts: NormalizedAttachment[]): Promise<EmailAttachment[]>`; `openAttachment(companyId: number, attachmentId: number): Promise<{ attachment: EmailAttachment; stream: ReadStream }>` (lança `AppError("ERR_EMAIL_ATTACHMENT_NOT_FOUND", 404)` quando o anexo não é da empresa); `safeInlineContentType(contentType: string): string` (devolve o próprio tipo para `image/png|jpeg|gif|webp` e `application/pdf`, senão `application/octet-stream`).

- [ ] **Step 1: Write the failing tests**

```ts
it("stores files under <private>/email/<companyId>/<emailMessageId>/ with a random name, never the original filename", ...);
it("skips an attachment over MAX_ATTACHMENT_BYTES with skippedReason 'too_large' and stores the rest", ...);
it("skips attachments after the message total passes MAX_INBOUND_ATTACHMENTS_BYTES with 'message_too_large'", ...);
it("openAttachment of another company's attachment throws ERR_EMAIL_ATTACHMENT_NOT_FOUND", ...);
it("safeInlineContentType('text/html') === 'application/octet-stream'", ...);
```

- [ ] **Step 2–4:** FAIL → implementar (nome no disco `uuidv4()`; `filename` limpo de `/`, `\` e controle) → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(email): per-company private attachment storage"`

### Task 7: Contato do e-mail

**Files:**
- Create: `backend/src/services/EmailServices/FindOrCreateEmailContactService.ts`
- Test: `.../__tests__/FindOrCreateEmailContactService.spec.ts`

**Interfaces:**
- Produces: `FindOrCreateEmailContactService({ companyId, address, name, emailAccountId }: { companyId: number; address: string; name?: string; emailAccountId: number }): Promise<Contact>`

Regra, nesta ordem, sob um `Mutex` por `companyId:address` (padrão de `FindOrCreateMetaContactService`): (1) `ContactIdentity` `(companyId, "email", address)` existe → devolve o contato; (2) exatamente **um** `Contact` da empresa com `email` igual (minúsculas) → cria a identidade apontando para ele; (3) senão, cria `Contact { name: name || address, number: null, email: address, channel: "email", companyId }` + identidade. Nunca une por nome.

- [ ] **Step 1: Write the failing tests**

```ts
it("returns the contact of an existing identity", ...);
it("links to the single existing contact with the same email", ...);
it("creates a new email-only contact when two contacts share the email", ...);
it("never matches by name", ...);
it("creates one contact under concurrent calls for the same address", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): resolve contacts by email identity"`

### Task 8: Ingestão (ticket por thread + mensagem)

**Files:**
- Create: `backend/src/services/EmailServices/IngestEmailService.ts`, `FindOrCreateEmailTicketService.ts`
- Test: `.../__tests__/IngestEmailService.spec.ts`

**Interfaces:**
- Consumes: Task 5 (tipos e threading), Task 6 (`saveInboundAttachments`), Task 7, `CreateMessageService` (`services/MessageServices/CreateMessageService.ts:77`), emissão de ticket como em `UpdateTicketService`.
- Produces: `IngestEmailService(account: EmailAccount, email: NormalizedEmail): Promise<{ status: "created" | "duplicate" | "reconciled" | "ignored"; ticketId?: number; messageId?: string }>`; `FindOrCreateEmailTicketService({ account, contact, threadKey, subject, reopen }): Promise<{ ticket: Ticket; justCreated: boolean }>`.

Algoritmo de thread (decidido aqui):
1. Se já existe `EmailMessage (companyId, emailAccountId, providerMessageId)` → `duplicate`. Se a mensagem é um bounce (`flags` contém `"bounce"`): com `bounceOf` igual ao `internetMessageId` de um envio da conta, esse envio vira `failed` com `sendError { code: "ERR_EMAIL_BOUNCED" }`, `Message.ack = -1`, e emite update; em qualquer caso → `ignored`.
2. Se `direction === "out"` e existe `EmailMessage` da conta com o mesmo `internetMessageId` e `direction = "out"` → grava `providerMessageId`; se `sendStatus` é `unknown` ou `queued`, muda para `sent` e `Message.ack = 1` → `reconciled`.
3. `threadKey`: com `providerThreadId` (Gmail) → `"g:" + providerThreadId`. Senão, procura `EmailMessage` da conta cujo `internetMessageId` esteja em `[inReplyTo, ...references]` e usa a `emailThreadKey` do ticket dele. Senão, fallback conservador: ticket da conta não fechado, com `normalizeSubject(subject)` igual, com o mesmo endereço da contraparte e `updatedAt` dentro de `SUBJECT_FALLBACK_DAYS`. Senão, nova chave `"m:" + (internetMessageId || providerMessageId)`.
4. Contraparte: `from` quando é entrada; quando é saída, o primeiro de `to`. Saída sem ticket existente → `ignored`.
5. Ticket: aberto/pendente com a mesma `(companyId, emailAccountId, emailThreadKey)` → reutiliza. Fechado e entrada → reabre como `pending`. Nenhum → cria com `channel "email"`, `status "pending"`, `queueId = account.queueId`, `whatsappId = null`, `subject`, `unreadMessages` incrementado na entrada.
6. `Message`: `id = uuidv4()`, `channel "email"`, `body = text`, `fromMe = direction === "out"`, `read = fromMe`, `ack = fromMe ? 1 : 0`, `dataJson = JSON.stringify({ source: "email", emailMessageId })` (JSON válido, porque `MessagesList` faz `JSON.parse`). `ticket.lastMessage = subject || text` (até 255 caracteres).
7. `EmailMessage` + anexos (Task 6) na mesma transação da `Message`; o websocket sai depois do commit.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates contact, pending ticket with subject/queue from account and an email Message", ...);
it("ingests the same providerMessageId once", ...);              // Review Focus 1
it("threads by Gmail providerThreadId", ...);
it("threads a reply by In-Reply-To/References", ...);
it("falls back to subject+counterpart only within 30 days and for open tickets", ...);
it("reopens a closed ticket as pending on inbound reply", ...);
it("ignores an outbound message with no existing thread", ...);
it("reconciles outbound copy by internetMessageId and marks unknown as sent", ...);  // Review Focus 4
it("never sets whatsappId and stores valid JSON in dataJson", ...);
it("keeps importing the message when an attachment is skipped", ...);   // Review Focus 3
it("a bounce marks the original outbound as failed ERR_EMAIL_BOUNCED and creates no ticket", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): ingest normalized emails into tickets"`

### Task 9: Endpoint de servidor seguro (anti-SSRF) e presets

**Files:**
- Create: `backend/src/services/EmailServices/mailEndpoint.ts`, `presets.ts`
- Test: `.../__tests__/mailEndpoint.spec.ts`

**Interfaces:**
- Produces: `resolveSafeMailEndpoint({ host, port, kind }: { host: string; port: number; kind: "imap" | "smtp" }): Promise<{ address: string; servername: string; port: number }>`. Lança `AppError("ERR_EMAIL_HOST_NOT_ALLOWED", 400)` para host bloqueado e `AppError("ERR_EMAIL_PORT_NOT_ALLOWED", 400)` para porta fora da lista. Também `EMAIL_PRESETS = { icloud: { imap: { host: "imap.mail.me.com", port: 993, secure: true }, smtp: { host: "smtp.mail.me.com", port: 587, secure: false } } }`.

Regras: portas IMAP `993, 143`; SMTP `465, 587`. Host precisa ser nome DNS com ponto (IP literal recusado). Resolve com `dns.promises.lookup(host, { all: true })` e recusa quando **qualquer** endereço é loopback, privado (10/8, 172.16/12, 192.168/16), link-local (169.254/16, fe80::/10), CGNAT (100.64/10), 0/8, multicast, ULA (fc00::/7) ou `::1`. Devolve o primeiro IP aceito. Quem conecta usa `address` como host e `servername` para TLS/SNI, o que evita DNS rebinding entre a validação e a conexão. Nada segue redirecionamentos. Em `NODE_ENV !== "production"`, `EMAIL_ALLOW_PRIVATE_HOSTS=true` libera hosts privados para o GreenMail local.

- [ ] **Step 1: Write the failing tests**

```ts
it("rejects localhost, 127.0.0.1 literal and a name resolving to 10.0.0.5", ...);
it("rejects a name where one of several A records is private", ...);
it("rejects port 25 for smtp and 110 for imap", ...);
it("returns the resolved public IP plus servername for imap.mail.me.com:993", ...);
it("ignores EMAIL_ALLOW_PRIVATE_HOSTS in production", ...);
```

- [ ] **Step 2–4:** FAIL → implementar (mock de `dns.promises.lookup`) → PASS. **Step 5:** `git commit -m "feat(email): ssrf-safe mail endpoint resolution"`

### Task 10: ImapSmtpAdapter

**Files:**
- Create: `backend/src/services/EmailServices/adapters/EmailProviderAdapter.ts`, `adapters/ImapSmtpAdapter.ts`, `adapters/errors.ts`, `adapters/index.ts`
- Modify: `backend/package.json` (`imapflow`, `nodemailer`, `@types/nodemailer`, versões fixas; o Dockerfile usa `node:24`, que atende o requisito do ImapFlow)
- Test: `.../__tests__/ImapSmtpAdapter.spec.ts`

**Interfaces:**

```ts
export type EmailCursor = Record<string, unknown>;
export interface EmailProviderAdapter {
  fetchChanges(account: EmailAccount): Promise<{ emails: NormalizedEmail[]; cursor: EmailCursor; hasMore: boolean }>;
  send(account: EmailAccount, mail: OutgoingEmail): Promise<{ providerMessageId?: string; providerThreadId?: string }>;
}
export class EmailAuthError extends Error {}          // credencial recusada → reauth_required
export class EmailTransientError extends Error {}     // falha antes de qualquer envio; pode tentar de novo
export class EmailSendRejectedError extends Error { constructor(public code: string) { super(code); } } // recusa definitiva
export class EmailSendAmbiguousError extends Error {} // pode ter saído; nunca repetir
getAdapter(provider: "gmail_api" | "imap_smtp"): EmailProviderAdapter
testImapSmtp(config: { address: string; password: string; imap: {host;port;secure}; smtp: {host;port;secure} }): Promise<void> // lança EmailAuthError ou AppError("ERR_EMAIL_CONNECTION_FAILED", 400)
```

Comportamento:
- Conexão sempre via `resolveSafeMailEndpoint` (Task 9), com TLS (`secure` ou STARTTLS obrigatório; `requireTLS: true` no SMTP 587).
- Cursor `{ folders: { [path]: { uidValidity: string; lastUid: number } } }`. Pastas: `INBOX` e a pasta com special-use `\Sent`, quando existir.
- Primeira execução (sem cursor): busca `SINCE` agora menos `INITIAL_IMPORT_HOURS`, no máximo `INITIAL_IMPORT_MAX`.
- `UIDVALIDITY` diferente do cursor → a pasta recomeça de `uidNext - 1` (sem reimportar tudo); o ocorrido é logado.
- Busca `UID > lastUid` em ordem, no máximo `SYNC_BATCH_MAX` (`hasMore` quando passa disso). `simpleParser` → `normalizeParsedMail` com `providerMessageId = \`${path}:${uidValidity}:${uid}\``; `direction = "out"` na pasta Sent.
- `send`: `nodemailer` com `messageId`, `inReplyTo`, `references`, anexos por `path`. Resposta 2xx → ok. Código 5xx → `EmailSendRejectedError("ERR_EMAIL_REJECTED_<código>")`. Falha de conexão ou autenticação antes do comando `DATA` → `EmailTransientError`/`EmailAuthError`. Timeout ou queda depois de `DATA` → `EmailSendAmbiguousError`.

- [ ] **Step 1: Write the failing tests** (`jest.mock("imapflow")`, `jest.mock("nodemailer")`)

```ts
it("first sync imports only the last 24h, at most 50, and records uidValidity/lastUid per folder", ...);
it("next sync fetches UID > lastUid and sets hasMore over 100", ...);
it("resets a folder cursor when UIDVALIDITY changes without reimporting history", ...);
it("marks Sent folder messages as direction 'out'", ...);
it("maps an IMAP AUTHENTICATIONFAILED to EmailAuthError", ...);
it("send maps 550 to EmailSendRejectedError, ECONNREFUSED to EmailTransientError and a timeout after DATA to EmailSendAmbiguousError", ...);
it("connects to the resolved IP with servername set to the hostname", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): imap/smtp adapter"`

### Task 11: Fila de sincronização e estado da conta

**Files:**
- Create: `backend/src/queues/email.ts`, `backend/src/services/EmailServices/SyncEmailAccountService.ts`, `EmailAccountStatusService.ts`
- Modify: `backend/src/queues.ts:892` (`startEmailQueue()` dentro de `startQueueProcess`)
- Test: `.../__tests__/SyncEmailAccountService.spec.ts`, `backend/src/queues/__tests__/email.spec.ts`

**Interfaces:**
- Produces:
  - `emailQueue` (Bull `"EmailSync"`, `runtimeQueueOptions()`).
  - `enqueueAccountSync(accountId: number): Promise<void>` (`jobId: \`sync-${accountId}\``, `removeOnComplete: true`).
  - `startEmailQueue(): void`, que registra o job repetível `"EmailSyncTick"` (`repeat: { cron: "* * * * *" }`) e os processadores `"EmailSyncAccount"` (concorrência 5) e `"EmailSend"` (Task 12).
  - `SyncEmailAccountService(accountId: number): Promise<{ ingested: number; hasMore: boolean }>`.
  - `markAccountError(account, err)` e `markAccountActive(account)`, que emitem `company-${companyId}-emailAccount` `{ action: "update", account: serializeEmailAccount(account) }` para a sala `company-${companyId}-admin`.

Regras:
- O tick enfileira só contas `status IN ('active','error')` de empresas com `emailEnabledForCompany`, filtradas por `runtimeCompanyWhere()`.
- `SyncEmailAccountService` repete a checagem de habilitação. Se a empresa está desligada, sai sem tocar no cursor.
- Ingere todas as mensagens e só depois grava `syncCursor` e `lastSyncAt` (entrega pelo menos uma vez; a ingestão é idempotente). Com `hasMore`, re-enfileira.
- Erros: `EmailAuthError` → `reauth_required` e `lastError {code: "ERR_EMAIL_AUTH", at}`. Outros erros → `errorCount++`; quando chega a 3, `status = "error"`. Sucesso → `errorCount = 0`, `active`, `lastError = null`. `lastError` nunca leva mensagem crua do servidor.

- [ ] **Step 1: Write the failing tests**

```ts
it("skips accounts of disabled companies and keeps cursor", ...);   // Review Focus 2
it("saves cursor only after all emails are ingested", ...);
it("re-enqueues when hasMore", ...);
it("sets reauth_required on EmailAuthError and emits the serialized account without credentials", ...);
it("sets error after 3 consecutive failures and resets on success", ...);
it("dedupes sync jobs by account", ...);   // Review Focus 1: mesmo jobId
it("tick ignores accounts outside runtimeCompanyWhere", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): background sync queue and account status"`

### Task 12: Envio (responder, responder a todos, encaminhar)

**Files:**
- Create: `backend/src/services/EmailServices/SendEmailService.ts`, `ProcessEmailSendJob.ts`
- Modify: `backend/src/controllers/MessageController.ts:196-213` (ramos `else if (channel === "email")`, para texto e para anexos)
- Test: `.../__tests__/SendEmailService.spec.ts`, `.../__tests__/ProcessEmailSendJob.spec.ts`

**Interfaces:**
- Consumes: Tasks 5, 10 e 11.
- Produces: `SendEmailService({ ticket, userId, mode, to, cc, subject, body, files, idempotencyKey }: { ticket: Ticket; userId: number; mode: "reply" | "replyAll" | "forward"; to?: string; cc?: string; subject?: string; body: string; files?: Express.Multer.File[]; idempotencyKey: string }): Promise<Message>`; `ProcessEmailSendJob(emailMessageId: number): Promise<void>`.

Campos que `MessageController.store` lê do FormData quando o ticket é de e-mail: `body`, `mode`, `to`, `cc`, `subject`, `idempotencyKey`, `medias[]`.

Regras:
- Verifica `assertEmailEnabled(ticket.companyId)`, `ticket.companyId === req.user.companyId`, `ticket.emailAccountId` presente e conta `active`. Senão, `ERR_EMAIL_ACCOUNT_UNAVAILABLE` 409. O acesso do usuário ao ticket segue a mesma regra das outras mensagens.
- Destinatários padrão (quando `to` não vem): reply → `replyTo[0] || from` da última entrada; replyAll → isso + `to`/`cc` da última entrada, sem o endereço da própria conta e sem repetidos; forward → `to` obrigatório (`ERR_EMAIL_RECIPIENT_REQUIRED` 400).
- `parseAddressList` com qualquer inválido → `ERR_EMAIL_INVALID_RECIPIENT` 400. Mais de `MAX_RECIPIENTS` → `ERR_EMAIL_TOO_MANY_RECIPIENTS` 400. Anexos acima de `MAX_OUTBOUND_ATTACHMENTS_BYTES` → `ERR_EMAIL_ATTACHMENTS_TOO_LARGE` 400.
- `messageId = \`<${uuidv4()}@${domínio de account.address}>\``. Em reply/replyAll, `inReplyTo` = `internetMessageId` da última entrada e `references = buildReferences(refs dela, ela)`. `subject = replySubject(ticket.subject, mode)` quando não vem. No forward, o corpo leva o original citado e os anexos do original são copiados.
- `idempotencyKey` repetida para a mesma empresa → devolve a `Message` existente sem novo job.
- Cria `Message` (`ack 0`, `fromMe`, `channel "email"`) + `EmailMessage` (`direction "out"`, `sendStatus "queued"`, `userId`) e enfileira `"EmailSend"` com `jobId: \`send-${emailMessageId}\``, `attempts: 1`. Esse registro é a trilha de auditoria (quem, quando, para quem).
- Job: só envia quando `sendStatus === "queued"`. Sucesso → `sent`, `ack 1`, `providerMessageId`. `EmailSendRejectedError` → `failed`, `Message.error = { code }`, `ack -1`. `EmailSendAmbiguousError` → `unknown` e **sem** nova tentativa. `EmailTransientError` → re-enfileira até 3 vezes com backoff de 30 s, 2 min e 10 min, e depois `failed`. `EmailAuthError` → `failed` + conta `reauth_required`. Cada mudança emite `appMessage` `update`.
- Nada no fluxo de sincronização chama `SendEmailService`.

- [ ] **Step 1: Write the failing tests**

```ts
it("reply defaults to Reply-To/From of last inbound and threads with In-Reply-To/References", ...);
it("replyAll includes to/cc minus own address, without duplicates", ...);
it("forward requires to and copies original attachments", ...);
it("rejects invalid, too many recipients and oversize attachments with the ERR_ codes", ...);
it("rejects when company disabled or account not active", ...);
it("returns the existing message for a repeated idempotencyKey without enqueueing", ...);
it("marks ambiguous send as unknown and never retries", ...);    // Review Focus 4
it("retries transient failures up to 3 times then fails", ...);
it("does nothing when job runs for a message no longer queued", ...);
it("MessageController.store routes channel email to SendEmailService", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): queued, idempotent email replies"`

### Task 13: API de contas, thread e anexos

**Files:**
- Modify: `backend/src/routes/emailRoutes.ts`; create `backend/src/controllers/EmailController.ts`, `backend/src/services/EmailServices/EmailAccountService.ts`, `GetEmailThreadService.ts`
- Modify: `backend/src/middleware/isAdmin.ts:20` (`path.startsWith("/email/accounts") || path.startsWith("/email/oauth")` → `"connections"`)
- Modify: `backend/src/services/TicketServices/ListTicketsService.ts` (parâmetro opcional `channel` filtra `Ticket.channel`; include `emailAccount` com `["id","name","address","preset"]`) e `ShowTicketService.ts` (mesmo include)
- Test: `backend/src/__tests__/services/EmailRoutes.spec.ts` (supertest, padrão de `MobileAuthRoutes.spec.ts`)

**Rotas:**

| Método e caminho | Middleware | Corpo / retorno |
| --- | --- | --- |
| `GET /email/availability` | isAuth | `{ enabled }` (Task 1) |
| `GET /email/accounts` | isAuth, isAdmin | `serializeEmailAccount[]` da empresa |
| `POST /email/accounts/test` | isAuth, isAdmin | `{ preset: "icloud"\|"custom", address, password, imap?, smtp? }` → `204` ou erro `ERR_EMAIL_*` |
| `POST /email/accounts` | isAuth, isAdmin | mesmo corpo + `name`, `queueId?` → testa, cria `active`, enfileira sync → `201` conta serializada |
| `PUT /email/accounts/:id` | isAuth, isAdmin | `{ name?, queueId?, password? }`; nova senha testa de novo e volta a `active` |
| `DELETE /email/accounts/:id` | isAuth, isAdmin | `disableEmailAccount(account)`: apaga credenciais, `status = disabled`; tickets ficam (as Tasks 14 e 16 acrescentam a revogação e o fim do watch do Gmail dentro dessa função) |
| `POST /email/accounts/:id/sync` | isAuth, isAdmin | `enqueueAccountSync` → `202` |
| `GET /email/tickets/:ticketId/thread` | isAuth | `{ account, subject, messages: [{ messageId, direction, from, to, cc, date, text, htmlSanitized, sendStatus, attachments: [{id, filename, size, contentType, skippedReason}] }] }` |
| `GET /email/attachments/:id` | isAuth | stream com `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, tipo de `safeInlineContentType` |

Todas, exceto `availability`, chamam `assertEmailEnabled`. `queueId` precisa ser da empresa. Conta, ticket e anexo de outra empresa → `404` (não `403`). `GET /thread` usa a mesma regra de acesso de `GET /messages/:ticketId`. Preset `icloud` ignora `imap`/`smtp` vindos do cliente e usa `EMAIL_PRESETS`.

- [ ] **Step 1: Write the failing tests**

```ts
it("returns 403 ERR_EMAIL_CHANNEL_DISABLED on every email route when disabled", ...);
it("lists accounts without credentials", ...);
it("company B gets 404 for company A account, thread and attachment", ...);
it("rejects a queueId from another company", ...);
it("creates an icloud account using presets even if client sends other hosts", ...);
it("DELETE wipes credentials, sets disabled and keeps tickets", ...);
it("GET /tickets?channel=email returns only email tickets", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): authenticated email accounts, thread and attachment routes"`

### Task 14: Conectar Gmail (OAuth dedicado)

**Files:**
- Create: `backend/src/config/gmail.ts`, `backend/src/services/EmailServices/GmailOAuthService.ts`
- Modify: `backend/src/routes/emailRoutes.ts`, `EmailController.ts`; `backend/package.json` (`google-auth-library`, versão fixa)
- Create: `docs/email-channel.md` (decisão OAuth dedicado × Clerk; variáveis; passo a passo no Google Cloud; aviso de verificação OAuth para escopo restrito)
- Test: `.../__tests__/GmailOAuthService.spec.ts`

**Interfaces:**
- Produces: `getGmailConfig(): { enabled: boolean; clientId: string; clientSecret: string; redirectUri: string; frontendUrl: string; pubsubTopic?: string; pubsubAudience?: string; pubsubServiceAccount?: string }`, com variáveis `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI`, `FRONTEND_URL`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_AUDIENCE`, `GMAIL_PUBSUB_SERVICE_ACCOUNT`. `enabled` exige as três primeiras.
- `StartGmailOAuthService({ companyId, userId, name, queueId }): Promise<{ url: string }>`
- `CompleteGmailOAuthService({ code, state, error }): Promise<{ redirectTo: string }>`
- `revokeGmailAccount(account: EmailAccount): Promise<void>`
- `getGmailAuthClient(account: EmailAccount): OAuth2Client` (lança `EmailAuthError` em `invalid_grant`)
- Rotas: `POST /email/oauth/google/start` (isAuth, isAdmin) → `{ url }`; `GET /email/oauth/google/callback` (sem auth) → `302`.

Regras:
- `state` = 32 bytes aleatórios em base64url, guardado no Redis (`libs/cache.ts`) como `email:oauth:state:<state>` → `{ companyId, userId, name, queueId, codeVerifier }`, com TTL de 600 s, consumido uma vez (get + del atômico).
- URL: `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, os dois escopos da Global Constraints, PKCE S256.
- Callback: `error` ou `state` inválido/expirado → redireciona para `${FRONTEND_URL}/connections?email=error&code=ERR_GMAIL_STATE`. Troca do código no servidor. Sem `refresh_token` → `ERR_GMAIL_NO_REFRESH_TOKEN`. Escopo concedido sem um dos dois → `ERR_GMAIL_SCOPES_MISSING` e revoga o token.
- `users.getProfile` (`emailAddress`, `historyId`) → upsert por `(companyId, address)`: `provider "gmail_api"`, `preset "gmail"`, `status "active"`, `scopes` concedidos, `credentials.refreshToken`, `syncCursor { historyId, initial: true }`, `connectedByUserId`. Depois, `enqueueAccountSync` e redirecionamento com `email=connected`.
- A mesma caixa em outra empresa é permitida (duas linhas independentes).
- Revogação: `POST https://oauth2.googleapis.com/revoke`; uma falha só gera log. `disableEmailAccount` (Task 13) chama `revokeGmailAccount` antes de apagar as credenciais quando `provider === "gmail_api"`.
- Nada em `ClerkGoogleAuthService.ts`, `googleAuth.js` ou `config/clerk.ts` muda.

- [ ] **Step 1: Write the failing tests**

```ts
it("start builds a URL with offline access, PKCE and exactly gmail.readonly + gmail.send", ...);
it("callback rejects unknown, expired or reused state", ...);
it("callback fails with ERR_GMAIL_SCOPES_MISSING and revokes when send scope is not granted", ...);
it("callback fails with ERR_GMAIL_NO_REFRESH_TOKEN", ...);
it("callback upserts an active gmail account bound to the state's companyId and userId", ...);
it("refresh failure with invalid_grant raises EmailAuthError", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Teste funcional (passo 1 da spec):** com um cliente OAuth "Web" em modo de teste no Google Cloud (usuário de teste adicionado) e as variáveis no `.env` local, conectar uma caixa Gmail de teste por `POST /email/oauth/google/start`. Conferir em `EmailAccounts` o endereço, os `scopes` e o `status active`. Desconectar e conferir que o acesso some em https://myaccount.google.com/permissions. Conferir que "Entrar com Google" continua funcionando sem a tela de consentimento de e-mail. Registrar o resultado em `docs/email-channel.md`.
- [ ] **Step 6: Commit** `git commit -m "feat(email): dedicated Gmail OAuth connect and revoke"`

### Task 15: GmailApiAdapter

**Files:**
- Create: `backend/src/services/EmailServices/adapters/GmailApiAdapter.ts` (registrar em `adapters/index.ts`)
- Modify: `backend/package.json` (`@googleapis/gmail`, versão fixa)
- Test: `.../__tests__/GmailApiAdapter.spec.ts`

**Interfaces:**
- Consumes: `getGmailAuthClient` (Task 14), `normalizeParsedMail` (Task 5), interface e erros da Task 10.
- Produces: `GmailApiAdapter implements EmailProviderAdapter`. Cursor `{ historyId: string; initial?: boolean }`.

Regras:
- `initial: true` → `messages.list` com `q: "newer_than:1d -in:chats"` e `maxResults: INITIAL_IMPORT_MAX`, paginado. Depois, `history.list` desde o `historyId` guardado antes da importação, para fechar a janela de corrida (duplicatas descartadas pela ingestão).
- Incremental: `history.list({ startHistoryId, historyTypes: ["messageAdded"] })` paginado até `SYNC_BATCH_MAX`. Para cada id: `messages.get({ format: "raw" })` → `simpleParser` → `normalizeParsedMail` com `providerMessageId = id`, `providerThreadId = threadId`. `direction = "out"` se `labelIds` tem `SENT`; ignora `DRAFT`, `SPAM`, `TRASH`, `CHAT`.
- HTTP 404 no `history.list` (cursor expirado) → refaz como `initial` com o `historyId` atual de `getProfile`.
- 401/`invalid_grant` → `EmailAuthError`. 429/5xx no `fetch` → `EmailTransientError`.
- `send`: monta o MIME com `nodemailer/lib/mail-composer` e chama `users.messages.send({ raw: base64url, threadId })`. 2xx → `{ providerMessageId: id, providerThreadId: threadId }`. 400/403 → `EmailSendRejectedError("ERR_GMAIL_SEND_<status>")`. 429 ou 5xx **com resposta** → `EmailTransientError`. Timeout ou socket sem resposta → `EmailSendAmbiguousError`.

- [ ] **Step 1: Write the failing tests** (mock do cliente Gmail)

```ts
it("initial import lists newer_than:1d max 50 then catches up via history from the saved historyId", ...);
it("incremental sync maps SENT label to direction out and skips DRAFT/SPAM", ...);
it("expired historyId (404) triggers a safe resync with the current historyId", ...);
it("send posts base64url raw with threadId and returns ids", ...);
it("send maps 403 to rejected, 503 to transient and a socket timeout to ambiguous", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): gmail api adapter"`

### Task 16: Push do Gmail (Pub/Sub) e renovação do watch

**Files:**
- Create: `backend/src/services/EmailServices/GmailWatchService.ts`, `backend/src/controllers/GmailPushController.ts`, `backend/src/routes/gmailPushRoutes.ts` (registrar em `routes/index.ts`)
- Modify: `backend/src/queues/email.ts` (job repetível diário `"GmailWatchRenew"`, `cron: "0 4 * * *"`)
- Test: `.../__tests__/GmailWatchService.spec.ts`, `backend/src/__tests__/services/GmailPushRoute.spec.ts`

**Interfaces:**
- Produces: `watchGmailAccount(account): Promise<void>` (só quando `pubsubTopic` existe; `users.watch({ topicName, labelIds: ["INBOX", "SENT"], labelFilterBehavior: "include" })`, grava `watchExpiresAt`); `stopGmailWatch(account): Promise<void>` (chamado por `disableEmailAccount`, da Task 13); `CompleteGmailOAuthService` (Task 14) chama `watchGmailAccount` depois do upsert; `renewExpiringWatches(): Promise<number>` (renova as contas Gmail `active` com `watchExpiresAt` em menos de 48 h); rota `POST /webhooks/gmail/push` (sem isAuth).

Webhook: valida `Authorization: Bearer <OIDC>` com `OAuth2Client.verifyIdToken({ audience: pubsubAudience })` e exige `email === pubsubServiceAccount` e `email_verified`; senão `401`. Decodifica `message.data` (`{ emailAddress, historyId }`), busca **todas** as contas Gmail `active` com esse endereço em empresas habilitadas (pode haver mais de uma empresa), chama `enqueueAccountSync` para cada uma e responde `204` logo. Corpo malformado → `204` com log, para o Pub/Sub não reenviar. Sem `pubsubTopic`, nada disso roda e o polling da Task 11 continua sendo o caminho.

- [ ] **Step 1: Write the failing tests**

```ts
it("rejects missing/invalid OIDC token and wrong service account with 401", ...);
it("enqueues sync for every active account with the address and answers 204", ...);
it("duplicate notifications enqueue the same jobId", ...);
it("renewExpiringWatches renews only accounts expiring within 48h", ...);
it("does nothing when GMAIL_PUBSUB_TOPIC is not set", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): gmail pubsub push and daily watch renewal"`

### Task 17: IDLE do IMAP

**Files:**
- Create: `backend/src/services/EmailServices/ImapIdleManager.ts`
- Modify: `backend/src/server.ts` (iniciar depois de `startQueueProcess` quando `EMAIL_IMAP_IDLE !== "false"`; parar no graceful shutdown)
- Test: `.../__tests__/ImapIdleManager.spec.ts`

**Interfaces:**
- Produces: `ImapIdleManager.start(): Promise<void>`, `ImapIdleManager.refresh(): Promise<void>` (chamado a cada tick da Task 11), `ImapIdleManager.stop(): Promise<void>`.

Regras: mantém uma conexão ImapFlow na `INBOX` por conta `imap_smtp` `active` de empresa habilitada, filtrada por `runtimeOwnsCompany`. Só usa IDLE quando o servidor anuncia a capability `IDLE`. Evento `exists` → `enqueueAccountSync`. Queda → reconecta com backoff de 5 s a 5 min. Conta que saiu (desabilitada, empresa desligada, `reauth_required`) → fecha a conexão. Falha de autenticação → não reconecta (o polling marca `reauth_required`). Limite `EMAIL_IMAP_IDLE_MAX` (padrão 200) conexões por processo; acima disso, só polling.

- [ ] **Step 1: Write the failing tests**

```ts
it("opens one IDLE connection per eligible account and enqueues sync on exists", ...);
it("does not use IDLE when the capability is missing", ...);
it("closes connections for disabled companies on refresh", ...);
it("stops reconnecting after an auth failure", ...);
it("respects EMAIL_IMAP_IDLE_MAX", ...);
```

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** `git commit -m "feat(email): imap idle for near real-time sync"`

### Task 18: Tela de Conexões (design "Conexões – Multicanal")

**Files:**
- Modify: `frontend/src/pages/Connections/index.js` (chips de filtro Todas/WhatsApp/E-mail com contagem; linhas de e-mail na mesma tabela; botão "Adicionar conexão" abre o seletor)
- Create: `frontend/src/hooks/useEmailAccounts/index.js`, `frontend/src/components/AddConnectionModal/index.js`, `frontend/src/components/EmailAccountModal/index.js`
- Modify: `frontend/src/translate/languages/emailChannel.js`

**Interfaces:**
- Consumes: rotas da Task 13 e da Task 14; socket `company-${companyId}-emailAccount`; `useEmailAvailability` (Task 2).
- Produces: `useEmailAccounts(): { accounts, loading, reload }`.

Comportamento (o texto vem da prancheta; as chaves de i18n ficam em `emailChannel.connections.*`):
- Com o canal desligado, a página fica exatamente como hoje: sem chips, sem seletor.
- Seletor em três grupos. WhatsApp: os fluxos atuais (QR Code / API Oficial conforme `whatsappMode`). E-mail: Gmail, iCloud, E-mail próprio; "Hotmail / Outlook" desabilitado com a tag "Em breve". O grupo Instagram não aparece.
- Gmail: nome da conexão + fila de entrada + passos "Como funciona", depois botão "Continuar com o Google" → `POST /email/oauth/google/start` → `window.location.assign(url)`. Ao voltar com `?email=connected|error&code=`, mostra toast traduzido e limpa a query.
- iCloud: e-mail, senha de app e o texto de ajuda da Apple. E-mail próprio: e-mail, senha, IMAP host/porta, SMTP host/porta, SSL/TLS. Os dois têm "Testar conexão" (`POST /email/accounts/test`) e "Salvar conexão".
- Linha de e-mail: chip do provedor (cores da prancheta), nome, endereço, status (Conectado / Aguardando / "Senha inválida" para `reauth_required` em iCloud ou e-mail próprio / "Autorização expirada" para `reauth_required` em Gmail / Erro), última atualização. Ações: Sincronizar agora, Desconectar conta, Atualizar senha de app (abre o modal com só a senha) ou Reconectar Gmail (refaz o OAuth).

- [ ] **Step 1:** Implementar o hook e os modais. **Step 2:** Integrar na página.
- [ ] **Step 3: Verify:** `cd frontend && npx prettier --write <arquivos> && NODE_OPTIONS=--openssl-legacy-provider npm run build`. Esperado: build sem erros. Manual com GreenMail (Task 20): criar uma conta "E-mail próprio", ver "Conectado"; trocar a senha no servidor e ver "Senha inválida" depois do próximo tick; desligar o canal da empresa e ver a página voltar ao formato atual.
- [ ] **Step 4: Commit** `git commit -m "feat(email): email connections in the connections page"`

### Task 19: Atendimentos — lista, thread e compositor (design "Atendimentos – Multicanal")

**Files:**
- Modify: `frontend/src/components/TicketsManagerTabs/index.js` (chips de canal Todos/WhatsApp/E-mail quando o canal está habilitado; passa `channel` para `useTickets`), `frontend/src/hooks/useTickets/index.js` (parâmetro `channel`), `frontend/src/components/TicketListItemCustom/index.js` (ícone do canal, assunto em destaque para e-mail, nome da conta de e-mail no lugar de `ticket.whatsapp?.name`)
- Modify: `frontend/src/components/Ticket/index.js:215` (quando `ticket.channel === "email"`, renderizar `EmailThreadView` + `EmailComposer` no lugar de `MessagesList` + `CompositorAtendimento`)
- Create: `frontend/src/components/EmailThreadView/index.js`, `frontend/src/components/EmailComposer/index.js`, `frontend/src/components/EmailHtmlFrame/index.js`
- Modify: `frontend/src/translate/languages/emailChannel.js`

**Interfaces:**
- Consumes: `GET /email/tickets/:ticketId/thread`, `GET /email/attachments/:id` (baixado com o axios autenticado, `responseType: "blob"`), `POST /messages/:ticketId` (FormData: `body`, `mode`, `to`, `cc`, `subject`, `idempotencyKey`, `medias`), socket `company-${companyId}-appMessage` na sala do ticket (refaz a busca da thread).
- Produces: `<EmailHtmlFrame html={string} />`, que renderiza `<iframe sandbox="" srcDoc={html} referrerPolicy="no-referrer">` e ajusta a altura pelo `onLoad`; sem `allow-scripts`, sem `allow-same-origin`.

Comportamento:
- Thread: cabeçalho com assunto e "{{n}} mensagens". Cada e-mail mostra iniciais, nome, `<endereço>`, "para …", data, corpo (`EmailHtmlFrame` quando há `htmlSanitized`; senão texto com quebras) e anexos (nome, tamanho, download; anexo ignorado aparece como "Anexo não importado (muito grande)").
- Status de envio por mensagem de saída: na fila / enviado / falhou (com o código traduzido) / "envio não confirmado" para `unknown`.
- Compositor: abas Responder / Responder a todos / Encaminhar; De (somente leitura: `nome <endereço>` da conta); Para; Cc; Assunto (preenchido com `replySubject`); corpo com botões B e I (envolvem a seleção com `*` / `_`); anexos; botão "Enviar e-mail". Um `idempotencyKey` (`uuid`) é gerado por rascunho e renovado só depois de um envio aceito. Erros `ERR_EMAIL_*` aparecem traduzidos.
- Conta `reauth_required` ou `disabled` → faixa de aviso acima do compositor ("A autorização desta caixa venceu. Reconecte em Conexões.") e botão de enviar desabilitado.

- [ ] **Step 1:** `EmailHtmlFrame` e `EmailThreadView`. **Step 2:** `EmailComposer`. **Step 3:** Integrar no ticket, na lista e nos filtros.
- [ ] **Step 4: Verify:** `cd frontend && npx prettier --write <arquivos> && NODE_OPTIONS=--openssl-legacy-provider npm run build` → sem erros. Manual com GreenMail: enviar um e-mail de fora com HTML contendo `<script>` e um anexo PDF. O ticket aparece em "Aguardando" com o assunto; o script não executa (sem alerta, sem erro no console do app); o PDF baixa. Responder a todos com Cc e conferir no GreenMail os cabeçalhos `In-Reply-To` e `References` e os destinatários.
- [ ] **Step 5: Commit** `git commit -m "feat(email): email threads and composer in the inbox"`

### Task 20: Ambiente local, documentação e aceite

**Files:**
- Create: `docker-compose-email-dev.yaml` (serviço `greenmail/standalone` com versão fixa, IMAP 3993/SMTP 3465 em TLS, dois usuários de teste)
- Modify: `docs/email-channel.md` (variáveis `ENCRYPTION_KEY` obrigatória, `GMAIL_*`, `EMAIL_IMAP_IDLE`, `EMAIL_IMAP_IDLE_MAX`, `EMAIL_ALLOW_PRIVATE_HOSTS` só para desenvolvimento; como ligar o canal por empresa; checklist de aceite)
- Modify: `.env-backend-local` **não** (o Guilherme ajusta as variáveis locais à mão; o doc traz os comandos)

- [ ] **Step 1: Rodar tudo**

Run: `cd backend && npx eslint --fix src/**/*.ts && npm run build && NODE_ENV=test npx jest src/services/EmailServices src/__tests__/services/EmailRoutes.spec.ts src/__tests__/services/GmailPushRoute.spec.ts src/services/__tests__/EmailContactPhoneGuards.spec.ts`
Expected: lint limpo, build ok, todos os testes PASS. Depois, `NODE_ENV=test npx jest` inteiro sem regressões.

- [ ] **Step 2: Aceite (spec), com GreenMail e com a caixa Gmail de teste**, conferindo cada item:
  1. Receber e responder um e-mail real pela conta correta (Gmail e e-mail próprio).
  2. Reiniciar o backend: a conversa continua lá e nenhuma mensagem é duplicada.
  3. Duas empresas, uma caixa em cada: a empresa B recebe 404 na conta, na thread e no anexo da A.
  4. "Entrar com Google" funciona sem pedir acesso ao e-mail.
  5. Revogar o acesso no Google (ou trocar a senha no GreenMail): a conta mostra "Autorização expirada"/"Senha inválida" e o compositor avisa.
  6. Anexo, Cc, responder a todos, reconexão, cursor expirado (`historyId` antigo forçado no banco), push duplicado e envio com timeout (GreenMail parado durante o envio → "envio não confirmado", sem reenvio).
  7. Desligar o canal da empresa: menus e rotas somem/recusam e a sincronização para. Religar: os e-mails recebidos nesse intervalo entram.
- [ ] **Step 3: Commit** `git commit -m "docs(email): local mail server, setup guide and acceptance checklist"`

---

## Fora deste plano (próximos planos)

- Hotmail/Outlook (OAuth Microsoft/Graph) e Instagram Direct.
- Verificação OAuth do Google e avaliação de segurança (CASA) para liberar o Gmail a clientes fora da lista de usuários de teste. O app funciona em modo de teste (até 100 usuários de teste) até lá. Isso precisa estar resolvido antes de prometer o Gmail a todos os clientes.
- Chatbot/filas automáticas para tickets de e-mail: tickets entram na fila da conta, sem chatbot.
