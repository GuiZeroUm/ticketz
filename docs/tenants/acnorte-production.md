# AC Norte: promoção para produção

Produção: https://acnorte.espacowhats.com.br. Tenant/companyId: 9.

## Separação

- `acnorte` é a branch de desenvolvimento; `acnorte-deploy` recebe apenas versões validadas pelo workflow `release-acnorte.yml`.
- O serviço Dokploy **AC Norte Produção** usa `docker-compose.acnorte-production.yml`, com promoção manual. Não confundir com AC Norte dev.
- O banco PostgreSQL, Redis e volumes public/private continuam sendo os originais da produção geral. Não há cópia de dados do dev, nem banco separado para este tenant.
- A aplicação geral usa `TENANT_RUNTIME_EXCLUDED_COMPANY_IDS=9`. A aplicação dedicada usa `TENANT_RUNTIME_COMPANY_ID=9` e `QUEUE_PREFIX=acnorte-production`.
- Credenciais ficam em `Whatsapps.session` e `BaileysKeys`. Redis compartilha os segredos JWT. **Nunca executar duas instâncias proprietárias das mesmas sessões. Nunca usar logout/reset para manutenção.**
- O autostart inicia somente sessões com credenciais persistidas. Uma conexão já desconectada sem credenciais continua desconectada.
- Tarefas financeiras e globais continuam na aplicação geral. SGA e tarefas operacionais do AC Norte executam apenas na instância dedicada.
- O dev mantém seu próprio banco/Redis/volumes e `WHATSAPP_AUTOSTART_ENABLED=false`. Nunca compartilhar credenciais de produção com dev.

## Atualizações

1. Integrar a produção global (`deploy`) em `acnorte`, preservando as customizações. Resolver conflitos e validar no AC Norte dev.
2. Exigir CI verde (backend, frontend, WaCalls e manifests). Revisar todas as migrações pendentes: somente mudanças retrocompatíveis no banco compartilhado.
3. Fazer backups do banco, arquivos, Redis e configuração; manter tags das imagens anteriores. Ensaiar migrações em cópia isolada quando houver mudanças de schema.
4. Executar o workflow manual **Release AC Norte candidate to Dokploy** com o SHA completo de `acnorte`. Ele promove a `acnorte-deploy` apenas se contém a base global e passou na validação.
5. Publicar **AC Norte Produção** no Dokploy. Não publicar o compose dev. Não executar seeds em produção; o compose dedicado executa somente migrations e o servidor.
6. Validar saúde HTTP/HTTPS, login, atendimentos, contatos, SGA, filas e reconexão das sessões existentes sem QR Code. Conferir também a saúde dos demais tenants.

## Homologação das cobranças

O primeiro rollout mantém `ACNORTE_BILLING_SEND_ENABLED=false` e a configuração do tenant desativada. `ACNORTE_BILLING_TEST_NUMBER` define exclusivamente o destino do botão de teste. O compose de produção força vazias as duas variáveis de seleção de boleto real: os testes usam PDF sintético **SEM VALOR — NÃO PAGAR**, nunca os boletos de homologação do dev.

Um teste de horário pode ser cadastrado em **Agendamentos**, como envio único, público **selecionado** com apenas o contato autorizado e fuso `America/Rio_Branco`. Ele verifica o agendador operacional, não a elegibilidade de boletos da régua SGA. Confira a data UTC correspondente, `nextRunAt`, uma única entrega pendente e o isolamento `QUEUE_PREFIX=acnorte-production`. Esse teste não ativa cobranças aos associados. Após o horário, o histórico deve ser consultado; cadastro agendado não é confirmação antecipada de entrega.

## Retorno seguro

Para voltar apenas a versão do AC Norte, manter o isolamento e usar a imagem anterior dedicada. Para desfazer a separação, primeiro parar o backend dedicado, confirmar que encerrou, então remover a exclusão 9 do backend geral e reiniciá-lo. Nunca inverter essa ordem. Manter migrações aditivas; não executar `db:migrate:undo`, `db:seed:all`, `docker compose down -v` nem restaurar um dump antigo sobre dados novos de produção.

Os volumes externos são referências a dados existentes; não são recursos descartáveis deste projeto. O link de código-fonte na tela Sobre deve permanecer acessível conforme AGPL.
