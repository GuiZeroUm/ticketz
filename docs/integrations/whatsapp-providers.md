# Métodos WhatsApp por empresa

Issues: [#97](https://github.com/GuiZeroUm/ticketz/issues/97), [#98](https://github.com/GuiZeroUm/ticketz/issues/98).

## Contrato

A empresa nasce com `whatsappMode: "normal"` (não oficial/Baileys) ou `"meta"` (Cloud API oficial). A escolha aparece no cadastro do superadmin, do parceiro e no cadastro público, quando habilitado. Na edição o campo é somente leitura. Serviços de atualização e trigger PostgreSQL rejeitam mudança em qualquer direção, mesmo sem conexões ou depois de excluir uma conexão.

A API de empresas e parceiros usa `whatsappMode`; a API de plataforma aceita `whatsapp_mode` ou `whatsappMode` e devolve `whatsapp_mode`. Chamadores legados que omitem o campo continuam criando `normal`. Valores diferentes de `normal`/`meta` são inválidos.

Cada conexão deriva `apiMode` da empresa: `baileys` ou `official`. O cliente não escolhe nem altera o provedor da conexão. Excluir/recriar a conexão não muda o método da empresa. Isso impede a transição de método dentro da empresa; não representa garantia contra bloqueios externos de números pela Meta.

## Extração da ACNorte

Base do sistema geral: `origin/main` em `10bec24d`. Fonte da integração oficial: `origin/acnorte` em `f5a344cf`. O porte é seletivo; não mescla a branch inteira.

Compartilhados: conexão Meta, credenciais criptografadas, assinatura de webhook, entrada de mensagens e recibos, texto/mídia/reações/leitura, janela de atendimento, templates aprovados e integração com filas/chatbot de texto e menus.

Continuam exclusivos da branch ACNorte: SGA/Hinova, régua de cobrança e boletos, políticas particulares de acesso e nomes de contatos, autenticação mobile e configurações do runtime dedicado. Nenhuma dessas regras é ativada para novas empresas oficiais. A disponibilidade da Cloud API agora depende do método da empresa, sem allowlist de cliente.

## Configuração do servidor

Fornecer no ambiente do backend (secret manager ou env_file privado, nunca no Git):

- `META_APP_ID`, `META_APP_SECRET`: aplicativo da plataforma.
- `META_CONFIG_ID`: configuração Embedded Signup.
- `META_WEBHOOK_VERIFY_TOKEN`: segredo para verificar o webhook.
- `ENCRYPTION_KEY`: chave estável para criptografar os tokens persistidos. Não rotacionar sem migrar os tokens; ao reutilizar banco/credenciais existentes, preservar a chave correspondente.
- `META_GRAPH_API_VERSION`: versão usada no Graph client; padrão herdado `v21.0`.

O aplicativo Meta precisa estar configurado para os domínios e o onboarding comercial usado pela plataforma. Os IDs públicos são expostos por `GET /whatsapp/meta/config`; segredos e tokens não são devolvidos à interface.

Webhook: `<URL pública do backend>/webhooks/meta/whatsapp`, considerando o prefixo `/backend` quando usado no proxy. GET exige o verify token; POST exige assinatura HMAC sobre os bytes originais com o app secret. Preservar os filtros `TENANT_RUNTIME_*`: um runtime não processa empresas pertencentes a outro. Se runtimes compartilham um aplicativo Meta, o encaminhamento do webhook deve entregar os eventos ao runtime responsável; o filtro não faz proxy automaticamente.

Criar empresa oficial, criar conexão e usar **Conectar via Meta**. O fluxo manual existente permanece restrito a superadmin (`POST /whatsapp/:id/meta/manual-connect`) para provisionamento administrativo autorizado. Nunca colar tokens em issues, logs ou chat.

Um `metaPhoneNumberId` não pode ser associado a duas conexões. Desconectar um número não deve remover a assinatura de outro número ativo da mesma WABA.

## Recursos e limites

| Recurso | Não oficial | Oficial |
| --- | --- | --- |
| Conexão | QR/pareamento existente | Embedded Signup ou provisionamento superadmin |
| Atendimento, texto, mídia manual, leitura e reações | Fluxo existente | Serviços Cloud API |
| Chatbot | Fluxo existente | Texto e menus; o adaptador herdado não implementa mídia automática dos fluxos |
| Fora da janela de atendimento | Fluxo existente | Template aprovado; o backend valida a janela |
| Templates no chat | Não se aplica | Templates de texto aprovados; cabeçalhos de mídia não entram nessa seleção |
| Grupos, privacidade, importação de agenda do WhatsApp, edição/exclusão/encaminhamento de mensagens | Fluxo existente | Sem suporte nesta extração |
| Campanhas e agendamentos atuais | Fluxo existente | Bloqueados antes de criar envio incompatível |
| Chamadas por sessões QR (WaCalls/Wavoip) | Piloto existente | Bloqueadas para conexões oficiais |

O processamento de webhook preserva o desenho herdado: responde ao provedor antes de concluir o processamento e registra falhas. Não há fila durável de reprocessamento adicionada nesta extração. Testes automatizados com Graph API simulada não substituem homologação com um número autorizado.

## Migrações e publicação

1. Fazer backup e verificar empresas com conexões de métodos diferentes antes do rollout. A migração interrompe com rollback ao encontrar uma empresa mista, sem tentar desconectar ou converter números.
2. A migração de campos Meta usa o mesmo identificador histórico da ACNorte. Em banco onde já foi executada, o Sequelize não a repete.
3. A migração de empresas preserva o campo existente quando presente, identifica conexões oficiais e mantém as demais empresas como `normal`. Acrescenta CHECK e trigger de imutabilidade.
4. A migração de unicidade exige IDs oficiais não duplicados. Inconsistências devem ser revisadas explicitamente, sem remover conexões automaticamente.
5. Publicar código e executar migrações pelo processo habitual. Não executar `npm test` do backend em banco existente: seus hooks migram, fazem seed e desfazem migrações.
6. Antes de liberar clientes, homologar entrada/saída de texto e mídia, recibos, template e desconexão/reconexão em um número oficial autorizado e no ambiente não oficial de teste. Não usar números ativos de clientes para testar transições.

Reverter apenas a aplicação exige manter os campos/provedor persistidos; não desfazer as migrações Meta em banco com credenciais/conexões oficiais. Esta entrega faz commit/push em branch de trabalho, sem atualizar `deploy`, `acnorte-deploy` ou containers de produção.

## Verificação reproduzível

- Backend: `cd backend && npm run build`.
- Testes Meta: `NODE_ENV=test npx jest --runInBand --coverage=false --testPathPattern='MetaWhatsAppServices|TicketServiceWindowService|FindOrCreateTicketServiceMeta|ShowTicketFromUUIDService|SendWhatsAppMedia.spec|SocketSendWhatsappUpdate.spec'`.
- Regressão: `NODE_ENV=test npx jest --runInBand --coverage=false --forceExit --testPathPattern='WbotServices/__tests__|ScheduleServices/__tests__|CampaignService/__tests__|VoiceServices/__tests__|WhatsappService/__tests__|CompanyLifecycle|PlatformTenantLifecycle|tenantRuntime'`. Essa seleção contém handles Redis legados; `--forceExit` encerra o runner após o resultado, sem mudar o código de produção.
- Frontend: `cd frontend && npm ci && npm run build` e `CI=true npm test -- --watchAll=false --runInBand --coverage=false --testPathPattern='CompanyWhatsAppModeField|MetaEmbeddedSignupButton|TemplateMessageModal|officialApiRestriction|MessageInputCustom'`.
- Migrações: executar `backend/scripts/test-whatsapp-provider-migrations.cjs` com `WHATSAPP_MIGRATION_TEST_URL` apontando exclusivamente para PostgreSQL descartável. O script cria e exclui seu próprio banco aleatório. Validado com PostgreSQL 16, incluindo schema novo, schema ACNorte, imutabilidade bidirecional, unicidade e rollback de empresa mista.

As chamadas externas nos testes são simuladas. O lint geral do backend contém erros anteriores de tipos `any` e variáveis não utilizadas; esses arquivos alheios à extração não foram reformulados.

Resultado da validação desta extração em 28/09/2026: build backend aprovado; build frontend aprovado com avisos existentes; seleção combinada backend com 44 suítes/185 testes aprovados; frontend com 9 suítes/30 testes aprovados; cenários de migração em PostgreSQL 16 aprovados. Sem testes de envio em contas reais e sem deploy de produção.
