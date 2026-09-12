const pt = {
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
