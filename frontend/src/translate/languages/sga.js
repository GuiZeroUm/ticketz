const pt = {
  billing: {
    title: "Cobranças automáticas",
    subtitle: "Régua de cobrança AC Norte · SGA Hinova",
    back: "Voltar para placas",
    adminOnly: "Apenas administradores podem gerenciar cobranças.",
    loading: "Carregando cobranças",
    loadFailed: "Não foi possível carregar as cobranças desta empresa.",
    safeMode:
      "Modo de validação: envios automáticos bloqueados neste ambiente. Prévias e simulações não enviam mensagens aos clientes.",
    liveReady:
      "Envios reais disponíveis. A automação só funciona quando ativada, dentro da janela e com conexão ativa.",
    stale:
      "SGA sem uma sincronização concluída nos últimos 90 minutos. Envios reais ficam suspensos até a atualização.",
    settings: "Configuração de envio",
    enabled: "Ativar cobranças automáticas",
    connection: "Conexão de envio",
    selectConnection: "Selecione uma conexão",
    startHour: "A partir de (hora)",
    endHour: "Até (hora)",
    dailyLimit: "Limite diário",
    weekdays: "Dias da semana",
    days: {
      1: "Segunda",
      2: "Terça",
      3: "Quarta",
      4: "Quinta",
      5: "Sexta",
      6: "Sábado",
      7: "Domingo"
    },
    timingHelp:
      "Fuso: Rio Branco (Acre). Até uma cobrança por minuto, por boleto e etapa. Somente no dia exato da etapa; fins de semana desmarcados e etapas passadas não são recuperados depois. O limite diário pode deixar boletos sem envio nesse dia.",
    excluded: "IDs de contatos que não devem receber cobranças",
    excludedHelp:
      "Separe os IDs por vírgulas. Use para pedidos de interrupção, contestação ou exceções de atendimento.",
    termsReviewed:
      "Confirmei que os textos e prazos correspondem ao contrato e à política da AC Norte.",
    termsHelp:
      "As etapas após o vencimento afirmam suspensão da proteção e possíveis medidas de cobrança. Revise essas afirmações antes de ativar. A etapa de 30 dias também exige situação inativa/cancelada do associado na consulta atual ao SGA. O sistema não inativa contratos, protesta boletos nem registra dívidas no SPC/SERASA.",
    messages: "Mensagens e documentos",
    stages: {
      "-3": "3 dias antes",
      0: "No vencimento",
      1: "1 dia depois",
      3: "3 dias depois",
      5: "5 dias depois",
      25: "25 dias depois",
      30: "30 dias depois",
      90: "90 dias depois"
    },
    stepEnabled: "Habilitar esta etapa",
    withPdf: "PDF do boleto + mensagem",
    textOnly: "Mensagem de lembrete",
    variables:
      "Variáveis: [nome], [valor] e [vencimento]. Nenhum link é acrescentado automaticamente. [boleto] é opcional nos textos personalizados de cobrança.",
    save: "Salvar configuração",
    preview: "Ver prévia do teste",
    unsaved: "Salve as alterações antes de testar ou mudar a data.",
    downloadTestPdf: "Baixar PDF de demonstração",
    testHelp:
      "Destino de teste autorizado: {{number}}. O teste usa Guilherme Santos e um PDF fictício, sem valor. Nenhum boleto de cliente é encaminhado no teste.",
    realTestHelp:
      "Destino de teste autorizado: {{number}}. Boleto real autorizado: {{bill}}, consultado na API SGA a cada teste. O PDF real será enviado nas duas primeiras etapas. Não efetue pagamento por este teste; os prazos das etapas são simulados. Nenhuma mensagem será enviada ao associado.",
    notConfigured: "não configurado",
    noConnection:
      "Não há conexão de envio selecionada e conectada neste ambiente. A simulação funciona sem WhatsApp; o teste real requer uma conexão exclusiva do dev.",
    simulate: "Simular envio sem WhatsApp",
    sendTest: "Enviar teste ao número autorizado",
    connections: "Ver conexões",
    result: {
      SIMULATED:
        "Simulação registrada. Nenhuma mensagem foi enviada ao WhatsApp.",
      SENT: "Teste aceito pelo WhatsApp. Confira o recebimento no número autorizado.",
      SENDING:
        "Teste em processamento. Consulte o histórico antes de tentar novamente.",
      UNCERTAIN: "Resultado incerto. Não reenvie antes de verificar o WhatsApp."
    },
    audience: "Prévia de destinatários",
    date: "Data (Acre)",
    refresh: "Atualizar",
    counts:
      "{{total}} boletos nesta data · {{eligible}} candidatos · {{blocked}} bloqueados ou já processados",
    previewHelp:
      "Até 100 registros exibidos. Candidatos ainda passam por conferência de pagamento, vínculo, conexão, horário e limite diário antes do envio.",
    member: "Associado / contato",
    bill: "Boleto",
    due: "Vencimento",
    amount: "Valor",
    stage: "Etapa",
    status: "Situação",
    eligible: "Candidato para conferência",
    empty: "Nenhum boleto corresponde às etapas nesta data.",
    history: "Histórico de envios e testes",
    historyHelp:
      "Últimos 100 registros. Enviado significa aceito pelo WhatsApp, não confirmação de leitura. Falhas e resultados incertos não são reenviados automaticamente; revise o histórico antes de qualquer nova tentativa.",
    mode: "Modo",
    modes: { live: "Real", test: "Teste WhatsApp", simulation: "Simulação" },
    reasons: {
      UNLINKED: "Sem vínculo seguro",
      OPTED_OUT: "Contato excluído",
      INVALID_NUMBER: "Número inválido",
      SENT: "Enviado",
      SKIPPED: "Ignorado após conferência",
      FAILED: "Falha antes do envio — revisar",
      UNCERTAIN: "Envio incerto — não repetir",
      SENDING: "Enviando",
      PREPARING: "Preparando",
      SIMULATED: "Simulado, sem envio",
      NO_LONGER_ELIGIBLE: "Pago, cancelado, alterado ou fora da etapa",
      CONTRACT_NOT_INACTIVE: "SGA não confirma contrato inativo",
      CONTACT_CHANGED: "Contato ou vínculo alterado",
      OUTSIDE_WINDOW: "Fora da janela de envio",
      INTERRUPTED: "Processamento interrompido"
    }
  },
  title: "Placas",
  managedField: "SGA · atualizado automaticamente a cada hora",
  subtitle: "Veículos, associados e pendências do SGA Hinova",
  search: "Buscar placa, associado, CPF, telefone ou contato",
  sync: "Sincronizar SGA",
  syncing: "Sincronizando…",
  syncedAt: "Última sincronização: {{date}}",
  automatic:
    "Atualização automática a cada hora. Valores nominais dos boletos; juros e multas podem variar no SGA.",
  unavailable: "A integração SGA não está disponível para esta empresa.",
  notConfigured: "A credencial SGA ainda não está configurada.",
  firstSync:
    "Aguardando a primeira sincronização. Clique em Sincronizar SGA para importar os dados.",
  syncFailed:
    "Não foi possível atualizar o SGA. Os últimos dados disponíveis foram preservados. Tente sincronizar novamente.",
  vehicles: "Veículos",
  members: "Associados",
  linked: "Associados vinculados",
  overdueMembers: "Associados com atraso",
  overdueAmount: "Total vencido",
  overdueBills: "Boletos vencidos",
  all: "Todos",
  status: "Situação do veículo",
  debt: "Pendências do associado",
  overdue: "Com boletos vencidos",
  clear: "Sem boletos vencidos",
  link: "Vínculo com contato",
  unmatched: "Sem vínculo",
  ambiguous: "Revisar vínculo",
  plate: "Placa",
  vehicle: "Veículo",
  member: "Associado",
  contact: "Contato na plataforma",
  details: "Ver detalhes",
  close: "Fechar",
  noResults: "Nenhum veículo encontrado para estes filtros.",
  loading: "Carregando dados do SGA…",
  perPage: "Veículos por página",
  pageLabel: "{{from}}–{{to}} de {{count}}",
  document: "CPF/CNPJ",
  phones: "Telefones",
  email: "E-mail",
  contract: "Início do contrato",
  protectedValue: "Valor protegido",
  source: "Origem: SGA Hinova",
  relation: "Vínculo do associado",
  automaticLink: "Vinculado por {{method}}",
  manualLink: "Vínculo manual",
  noLink:
    "Nenhum contato vinculado. Um administrador pode selecionar o contato correto.",
  ambiguity:
    "Mais de um contato corresponde aos dados. Revise antes de agendar uma mensagem.",
  methods: {
    document: "CPF/CNPJ",
    phone: "telefone",
    email: "e-mail",
    manual: "seleção manual",
    unmatched: "sem correspondência",
    ambiguous: "correspondência ambígua"
  },
  selectContact: "Pesquisar contato para vincular",
  saveLink: "Vincular contato",
  removeLink: "Desvincular",
  editContact: "Abrir cadastro do contato",
  linkSaved: "Vínculo atualizado.",
  otherVehicles: "Veículos deste associado",
  bills: "Boletos em aberto do associado",
  billScope:
    "A dívida pertence ao associado. A coluna Placas indica os veículos de cada boleto; o valor do associado não deve ser somado novamente por veículo.",
  billNumber: "Nosso número",
  due: "Vencimento",
  amount: "Valor nominal",
  billStatus: "Situação",
  billVehicles: "Placas do boleto",
  memberOnly: "Sem veículo informado",
  overdueLabel: "Vencido",
  openLabel: "A vencer",
  noBills:
    "Nenhum boleto em aberto considerado para inadimplência na última sincronização.",
  getBill: "Consultar boleto",
  paymentLine: "Linha digitável",
  copyLine: "Copiar linha",
  copied: "Linha copiada.",
  openBill: "Abrir boleto",
  noPaymentLine: "A Hinova não retornou uma linha digitável para este boleto.",
  schedule: "Agendar mensagem",
  scheduleHelp:
    "O agendamento é criado na plataforma para o contato vinculado. Revise a mensagem e selecione a data. O envio requer uma conexão WhatsApp ativa.",
  draft:
    "Olá, {{name}}! Somos da AC Norte. Gostaríamos de conversar sobre seu veículo de placa {{plate}}.",
  contactVehicles: "Placas vinculadas",
  seeAll: "Ver placas e pendências",
  clearContactFilter: "Mostrar todos os contatos",
  filteredContact: "Exibindo veículos do contato selecionado",
  requestFailed: "Não foi possível concluir a operação. Tente novamente.",
  viewOnly: "Somente administradores podem sincronizar ou alterar vínculos."
};
const errors = {
  ERR_BILLING_RECIPIENT:
    "O WhatsApp não confirmou o número do destinatário. Nenhuma mensagem foi enviada.",
  ERR_BILLING_CONFIG:
    "Revise a configuração, os horários, as variáveis e a confirmação dos textos.",
  ERR_BILLING_CONNECTION:
    "Selecione uma conexão WhatsApp conectada desta empresa.",
  ERR_BILLING_SEND_DISABLED:
    "O envio automático está bloqueado neste ambiente de validação.",
  ERR_BILLING_BUSY:
    "Há um processamento em andamento. Aguarde um minuto e tente novamente.",
  ERR_BILLING_TEST_BILL:
    "O boleto real autorizado não pôde ser validado no SGA. Confira associado, situação de pagamento e configuração do teste. Nada foi enviado.",
  ERR_BILLING_TEST_NUMBER:
    "O número autorizado para teste ainda não foi configurado.",
  ERR_BILLING_PDF_URL:
    "O SGA retornou um link de boleto fora do formato seguro autorizado.",
  ERR_BILLING_PDF:
    "Não foi possível obter um PDF válido do boleto. Nada foi enviado.",
  ERR_BILLING_UNCERTAIN:
    "Não foi possível confirmar o resultado do envio. Confira o WhatsApp antes de repetir.",
  ERR_BILLING_FAILED:
    "Falha no processamento. Consulte o histórico e revise antes de tentar novamente.",
  ERR_SGA_DISABLED: pt.unavailable,
  ERR_SGA_NOT_CONFIGURED: pt.notConfigured,
  ERR_SGA_NOT_SYNCED: pt.firstSync,
  ERR_SGA_UNAVAILABLE: "A API Hinova está indisponível. Tente novamente.",
  ERR_SGA_ACCESS_DENIED:
    "A Hinova recusou o token ou a permissão desta consulta.",
  ERR_SGA_RESPONSE_INVALID:
    "A Hinova retornou dados inesperados. Tente sincronizar novamente.",
  ERR_SGA_PAGINATION:
    "A sincronização foi interrompida para evitar dados incompletos.",
  ERR_SGA_SYNC_FAILED: pt.syncFailed,
  ERR_SGA_MEMBER_NOT_FOUND: "Associado não encontrado.",
  ERR_SGA_CONTACT_INVALID: "Selecione um contato válido desta empresa.",
  ERR_SGA_VEHICLE_NOT_FOUND: "Veículo não encontrado.",
  ERR_SGA_BILL_NOT_FOUND: "Boleto não encontrado. Atualize os dados."
};
export const sgaMessages = {
  pt: { sga: pt, backendErrors: errors },
  pt_PT: { sga: pt, backendErrors: errors }
};
