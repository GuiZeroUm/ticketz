# Integração SGA — AC Norte

## Uso

Acesse **Placas** na barra lateral. Busque placa, associado, CPF/CNPJ, telefone
ou contato; filtre a situação do veículo, boletos vencidos e vínculos.
Em **Ver detalhes**, consulte o associado, seus veículos e boletos em aberto.
**Consultar boleto** busca a linha digitável e o link atualizado diretamente na Hinova.

O vínculo com os contatos da empresa usa CPF/CNPJ em campos adicionais, depois
telefone brasileiro com DDD (com ou sem nono dígito) e e-mail. Nomes não geram
vínculos automáticos. Identificadores conflitantes, contatos duplicados e telefones
compartilhados entre documentos distintos exigem revisão. Administradores podem
pesquisar e vincular o contato correto, ou desvincular; essa escolha persiste nas
sincronizações. O vínculo pertence ao associado e vale para todos os seus veículos.

**Agendar mensagem** abre o agendamento nativo, com o contato e uma mensagem sobre
a placa preenchidos. Revise texto, data, horário e destinatário antes de salvar.
Os agendamentos ficam em **Agendamentos**. Isso cria uma mensagem agendada na
plataforma, não um evento/vistoria no SGA. O envio exige uma conexão WhatsApp ativa;
o dev AC Norte mantém as conexões desconectadas por padrão.

No atendimento, o painel do contato também mostra suas placas vinculadas e um
atalho para consultar pendências.

## Sincronização e financeiro

Sincronização na inicialização, a cada hora e sob demanda por administrador.
Uma falha preserva o último snapshot completo, com aviso e data da atualização.
Todos os estados de associados/veículos são percorridos com paginação. Boletos
das situações que a associação marca como `considerado_inadimplencia=Y` são
consultados sem limitar a data, incluindo débitos antigos. Só entram no total
vencido boletos não pagos com vencimento anterior ao dia atual em Rio Branco.
Valores são nominais; a consulta individual do boleto é feita ao abrir sua linha.

A dívida é agregada por associado; pode abranger mais de um veículo. O total geral
deduplica por boleto. Não some a dívida repetida nas linhas de veículos do mesmo
associado. A tela distingue as placas vinculadas a cada boleto.

## Implementação e configuração

- Branch de integração: `acnorte`. Desenvolvimento parte desse branch e recebe
  atualizações globais por merge de `main`.
- Endpoint fixo HTTPS: `https://api.hinova.com.br/api/sga/v2/`.
- `ACNORTE_SGA_ENABLED=true`, `ACNORTE_SGA_COMPANY_ID=9` e
  `ACNORTE_SGA_TOKEN` somente no backend do dev. O token autenticado não expira,
  conforme documentação Hinova; se revogado, substituir no ambiente do backend.
- Tanto ID configurado quanto slug `acnorte` são exigidos no servidor; outro
  tenant recebe 404 nas rotas do módulo. Tokens não são enviados ao navegador.
- `SgaSnapshots` guarda apenas dados necessários à tela; `SgaContactLinks`
  guarda escolhas manuais e o usuário/data da última alteração.
- Advisory lock PostgreSQL evita duas sincronizações simultâneas. Substituição
  transacional evita publicação de importação incompleta.
- Não há alteração de cadastro, emissão de cobrança nem mudança de vencimento
  na Hinova. A API é usada apenas para autenticação e leitura.

## Fontes verificadas

- [Documentação oficial API v2](https://api.hinova.com.br/api/sga/v2/doc/)
- Catálogo `api_data.json` da documentação, mais respostas reais do tenant.
- Histórico do token EZ CHAT: alterações nas permissões de associados, veículos,
  boletos e produtos. Esse histórico é de configuração das rotas, não um log
  de cada requisição executada pelo aplicativo anterior.

## Validação

Testes cobrem normalização de números, conflito entre identificadores,
desvínculo manual, contabilização de atraso, paginação, respostas vazias,
falha de API sem exposição de credenciais, isolamento por tenant, contatos de
outras empresas e preservação do snapshot anterior em falhas.
