const ptConnections = {
  filters: {
    label: "Filtrar por canal",
    all: "Todas",
    whatsapp: "WhatsApp",
    email: "E-mail"
  },
  search: {
    placeholder: "Buscar conexão"
  },
  summary: {
    whatsapp: {
      label: "WhatsApp",
      empty: "Nenhuma conexão",
      total: { one: "{{count}} conexão", other: "{{count}} conexões" },
      connected: { one: "{{count}} conectada", other: "{{count}} conectadas" },
      waiting: { one: "{{count}} aguardando", other: "{{count}} aguardando" },
      disconnected: {
        one: "{{count}} desconectada",
        other: "{{count}} desconectadas"
      }
    },
    email: {
      label: "E-mail",
      empty: "Nenhuma conta conectada",
      accounts: { one: "{{count}} conta", other: "{{count}} contas" },
      attention: {
        one: "{{count}} precisa de atenção",
        other: "{{count}} precisam de atenção"
      }
    }
  },
  table: {
    channel: "Canal",
    account: "Conta",
    default: "Padrão do canal"
  },
  providers: {
    whatsapp: "WhatsApp",
    whatsappApi: "WhatsApp API",
    gmail: "Gmail",
    outlook: "Hotmail",
    icloud: "iCloud",
    custom: "E-mail próprio"
  },
  status: {
    active: { label: "Conectado", title: "Conexão estabelecida!" },
    connecting: {
      label: "Aguardando",
      title: "Aguardando a primeira sincronização da caixa"
    },
    invalidPassword: {
      label: "Senha inválida",
      title: "A senha de app foi revogada ou expirou"
    },
    authExpired: {
      label: "Autorização expirada",
      title: "Reconecte a conta Google para continuar recebendo e-mails"
    },
    error: { label: "Erro", title: "Falha ao sincronizar a caixa de e-mail" },
    disabled: {
      label: "Desconectado",
      title: "A conta foi desconectada e não está sendo sincronizada"
    }
  },
  note: {
    imap: "IMAP/SMTP · {{host}}",
    metaCloudApi: "Meta Cloud API"
  },
  actions: {
    add: "Adicionar conexão",
    syncNow: "Sincronizar agora",
    disconnect: "Desconectar conta",
    updateAppPassword: "Atualizar senha de app",
    updatePassword: "Atualizar senha",
    reconnectGmail: "Reconectar Gmail",
    edit: "Editar conexão"
  },
  confirm: {
    disconnectTitle: "Desconectar conta de e-mail",
    disconnectMessage:
      "A caixa deixa de ser sincronizada e as credenciais salvas são apagadas. Os atendimentos existentes continuam no sistema."
  },
  toasts: {
    syncQueued: "Sincronização iniciada",
    disconnected: "Conta de e-mail desconectada",
    saved: "Conexão salva",
    updated: "Conexão atualizada",
    passwordUpdated: "Senha atualizada",
    testOk: "Conexão testada com sucesso",
    gmailConnected: "Gmail conectado com sucesso"
  },
  picker: {
    title: "Adicionar conexão",
    subtitle: "Escolha o canal que você quer atender.",
    footer:
      "Cada conexão aparece nos atendimentos com o ícone do canal e o nome que você der.",
    soon: "Em breve",
    groups: {
      whatsapp: "WhatsApp",
      email: "E-mail"
    },
    options: {
      whatsappQr: {
        label: "WhatsApp (QR Code)",
        hint: "Leia o QR Code com o celular da empresa"
      },
      whatsappApi: {
        label: "WhatsApp API Oficial",
        hint: "Conecte pela Meta Cloud API"
      },
      gmail: { label: "Gmail", hint: "Entrar com a conta Google" },
      outlook: {
        label: "Hotmail / Outlook",
        hint: "Entrar com a conta Microsoft"
      },
      icloud: { label: "iCloud", hint: "E-mail do iCloud com senha de app" },
      custom: {
        label: "E-mail próprio",
        hint: "Domínio da empresa via IMAP e SMTP"
      }
    }
  },
  form: {
    back: "Voltar",
    close: "Fechar",
    cancel: "Cancelar",
    test: "Testar conexão",
    save: "Salvar conexão",
    name: "Nome da conexão",
    nameHelp: "Aparece nos atendimentos ao lado do ícone do canal",
    queue: "Fila de entrada",
    noQueue: "Sem fila",
    footer: "Você pode editar o nome e a fila depois, em Editar conexão.",
    required: "Obrigatório",
    invalidEmail: "E-mail inválido",
    invalidPort: "Porta inválida",
    gmail: {
      title: "Gmail",
      subtitle: "Os e-mails da caixa de entrada viram atendimentos.",
      namePlaceholder: "Comercial",
      howTitle: "Como funciona",
      step1: "Você entra com a conta Google e autoriza o acesso.",
      step2: "Novos e-mails chegam como atendimentos na fila escolhida.",
      step3: "As respostas saem pelo próprio Gmail, com sua assinatura.",
      button: "Continuar com o Google"
    },
    icloud: {
      title: "iCloud",
      subtitle: "Conecte um e-mail @icloud.com, @me.com ou @mac.com.",
      namePlaceholder: "Diretoria",
      address: "E-mail do iCloud",
      addressPlaceholder: "nome@icloud.com",
      password: "Senha de app",
      passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
      help: "Não use a senha do Apple ID. Gere uma senha de app em appleid.apple.com › Iniciar sessão e segurança › Senhas de app."
    },
    custom: {
      title: "E-mail próprio",
      subtitle: "Use o e-mail do domínio da sua empresa.",
      namePlaceholder: "Contato",
      address: "E-mail",
      addressPlaceholder: "contato@suaempresa.com.br",
      password: "Senha",
      passwordPlaceholder: "Senha da caixa de e-mail",
      imapHost: "Servidor de entrada (IMAP)",
      imapHostPlaceholder: "imap.suaempresa.com.br",
      smtpHost: "Servidor de saída (SMTP)",
      smtpHostPlaceholder: "smtp.suaempresa.com.br",
      port: "Porta",
      secure: "Usar conexão segura (SSL/TLS)"
    },
    edit: {
      title: "Editar conexão",
      save: "Salvar"
    },
    password: {
      titleApp: "Atualizar senha de app",
      titleMailbox: "Atualizar senha",
      subtitle: "{{address}} · a nova senha é testada antes de ser salva.",
      save: "Salvar senha"
    }
  },
  errors: {
    generic: "Não foi possível concluir a operação.",
    ERR_EMAIL_CHANNEL_DISABLED:
      "O canal de e-mail não está habilitado para esta empresa.",
    ERR_EMAIL_HOST_NOT_ALLOWED:
      "Este servidor não é permitido. Use o endereço público do servidor IMAP/SMTP.",
    ERR_EMAIL_PORT_NOT_ALLOWED:
      "Esta porta não é permitida para o servidor de e-mail.",
    ERR_EMAIL_CONNECTION_FAILED:
      "Não foi possível conectar ao servidor de e-mail. Confira o servidor, a porta e a opção SSL/TLS.",
    ERR_EMAIL_AUTH:
      "E-mail ou senha incorretos. No iCloud, use uma senha de app.",
    ERR_GMAIL_STATE:
      "A autorização do Google expirou ou é inválida. Tente conectar de novo.",
    ERR_GMAIL_NO_REFRESH_TOKEN:
      "O Google não liberou o acesso contínuo à caixa. Remova o acesso em myaccount.google.com/permissions e conecte de novo.",
    ERR_GMAIL_SCOPES_MISSING:
      "Para conectar o Gmail, autorize a leitura e o envio de e-mails na tela do Google."
  }
};

const enConnections = {
  filters: {
    label: "Filter by channel",
    all: "All",
    whatsapp: "WhatsApp",
    email: "Email"
  },
  search: {
    placeholder: "Search connection"
  },
  summary: {
    whatsapp: {
      label: "WhatsApp",
      empty: "No connections",
      total: { one: "{{count}} connection", other: "{{count}} connections" },
      connected: { one: "{{count}} connected", other: "{{count}} connected" },
      waiting: { one: "{{count}} waiting", other: "{{count}} waiting" },
      disconnected: {
        one: "{{count}} disconnected",
        other: "{{count}} disconnected"
      }
    },
    email: {
      label: "Email",
      empty: "No accounts connected",
      accounts: { one: "{{count}} account", other: "{{count}} accounts" },
      attention: {
        one: "{{count}} needs attention",
        other: "{{count}} need attention"
      }
    }
  },
  table: {
    channel: "Channel",
    account: "Account",
    default: "Channel default"
  },
  providers: {
    whatsapp: "WhatsApp",
    whatsappApi: "WhatsApp API",
    gmail: "Gmail",
    outlook: "Hotmail",
    icloud: "iCloud",
    custom: "Custom email"
  },
  status: {
    active: { label: "Connected", title: "Connection established!" },
    connecting: {
      label: "Waiting",
      title: "Waiting for the first mailbox sync"
    },
    invalidPassword: {
      label: "Invalid password",
      title: "The app password was revoked or has expired"
    },
    authExpired: {
      label: "Authorization expired",
      title: "Reconnect the Google account to keep receiving emails"
    },
    error: { label: "Error", title: "Failed to sync the mailbox" },
    disabled: {
      label: "Disconnected",
      title: "The account was disconnected and is not being synced"
    }
  },
  note: {
    imap: "IMAP/SMTP · {{host}}",
    metaCloudApi: "Meta Cloud API"
  },
  actions: {
    add: "Add connection",
    syncNow: "Sync now",
    disconnect: "Disconnect account",
    updateAppPassword: "Update app password",
    updatePassword: "Update password",
    reconnectGmail: "Reconnect Gmail",
    edit: "Edit connection"
  },
  confirm: {
    disconnectTitle: "Disconnect email account",
    disconnectMessage:
      "The mailbox stops syncing and the saved credentials are deleted. Existing tickets stay in the system."
  },
  toasts: {
    syncQueued: "Sync started",
    disconnected: "Email account disconnected",
    saved: "Connection saved",
    updated: "Connection updated",
    passwordUpdated: "Password updated",
    testOk: "Connection tested successfully",
    gmailConnected: "Gmail connected successfully"
  },
  picker: {
    title: "Add connection",
    subtitle: "Choose the channel you want to serve.",
    footer:
      "Each connection shows up in tickets with the channel icon and the name you give it.",
    soon: "Coming soon",
    groups: {
      whatsapp: "WhatsApp",
      email: "Email"
    },
    options: {
      whatsappQr: {
        label: "WhatsApp (QR Code)",
        hint: "Scan the QR Code with the company phone"
      },
      whatsappApi: {
        label: "WhatsApp Official API",
        hint: "Connect through the Meta Cloud API"
      },
      gmail: { label: "Gmail", hint: "Sign in with the Google account" },
      outlook: {
        label: "Hotmail / Outlook",
        hint: "Sign in with the Microsoft account"
      },
      icloud: { label: "iCloud", hint: "iCloud email with an app password" },
      custom: {
        label: "Custom email",
        hint: "Company domain via IMAP and SMTP"
      }
    }
  },
  form: {
    back: "Back",
    close: "Close",
    cancel: "Cancel",
    test: "Test connection",
    save: "Save connection",
    name: "Connection name",
    nameHelp: "Shown in tickets next to the channel icon",
    queue: "Inbound queue",
    noQueue: "No queue",
    footer: "You can edit the name and queue later, in Edit connection.",
    required: "Required",
    invalidEmail: "Invalid email",
    invalidPort: "Invalid port",
    gmail: {
      title: "Gmail",
      subtitle: "Inbox emails become tickets.",
      namePlaceholder: "Sales",
      howTitle: "How it works",
      step1: "You sign in with the Google account and authorize access.",
      step2: "New emails arrive as tickets in the chosen queue.",
      step3: "Replies are sent by Gmail itself, with your signature.",
      button: "Continue with Google"
    },
    icloud: {
      title: "iCloud",
      subtitle: "Connect an @icloud.com, @me.com or @mac.com address.",
      namePlaceholder: "Board",
      address: "iCloud email",
      addressPlaceholder: "name@icloud.com",
      password: "App password",
      passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
      help: "Don't use the Apple ID password. Create an app password at appleid.apple.com › Sign-In and Security › App-Specific Passwords."
    },
    custom: {
      title: "Custom email",
      subtitle: "Use your company domain email.",
      namePlaceholder: "Contact",
      address: "Email",
      addressPlaceholder: "contact@yourcompany.com",
      password: "Password",
      passwordPlaceholder: "Mailbox password",
      imapHost: "Incoming server (IMAP)",
      imapHostPlaceholder: "imap.yourcompany.com",
      smtpHost: "Outgoing server (SMTP)",
      smtpHostPlaceholder: "smtp.yourcompany.com",
      port: "Port",
      secure: "Use secure connection (SSL/TLS)"
    },
    edit: {
      title: "Edit connection",
      save: "Save"
    },
    password: {
      titleApp: "Update app password",
      titleMailbox: "Update password",
      subtitle: "{{address}} · the new password is tested before saving.",
      save: "Save password"
    }
  },
  errors: {
    generic: "The operation could not be completed.",
    ERR_EMAIL_CHANNEL_DISABLED:
      "The email channel is not enabled for this company.",
    ERR_EMAIL_HOST_NOT_ALLOWED:
      "This server is not allowed. Use the public address of the IMAP/SMTP server.",
    ERR_EMAIL_PORT_NOT_ALLOWED: "This port is not allowed for the mail server.",
    ERR_EMAIL_CONNECTION_FAILED:
      "Could not connect to the mail server. Check the server, port and SSL/TLS option.",
    ERR_EMAIL_AUTH: "Wrong email or password. For iCloud, use an app password.",
    ERR_GMAIL_STATE:
      "The Google authorization expired or is invalid. Try connecting again.",
    ERR_GMAIL_NO_REFRESH_TOKEN:
      "Google did not grant ongoing access to the mailbox. Remove the access at myaccount.google.com/permissions and connect again.",
    ERR_GMAIL_SCOPES_MISSING:
      "To connect Gmail, allow reading and sending emails on the Google screen."
  }
};

const ptInbox = {
  filters: {
    label: "Canal",
    groupLabel: "Filtrar por canal",
    all: "Todos",
    whatsapp: "WhatsApp",
    email: "E-mail"
  },
  noSubject: "(sem assunto)",
  thread: {
    count: { one: "{{count}} mensagem", other: "{{count}} mensagens" },
    to: "para {{list}}",
    cc: "cc {{list}}",
    today: "Hoje",
    yesterday: "Ontem",
    loading: "Carregando e-mails…",
    loadError: "Não foi possível carregar os e-mails deste atendimento.",
    retry: "Tentar de novo",
    empty: "Nenhum e-mail nesta conversa ainda.",
    frameTitle: "Conteúdo do e-mail de {{from}}",
    attachmentSkipped: "Anexo não importado (muito grande)",
    download: "Baixar {{name}}",
    replyTo: "responder para {{list}}",
    oversize:
      "Mensagem grande demais para ser importada; abra na caixa de e-mail original."
  },
  status: {
    queued: "Na fila",
    sent: "Enviado",
    failed: "Falhou",
    failedWithReason: "Falhou: {{reason}}",
    unknown: "Envio não confirmado",
    partial: "Enviado — alguns destinatários foram recusados",
    unknownHint:
      "O servidor não confirmou o envio. A mensagem não é reenviada automaticamente e passa a enviada quando a cópia aparecer na caixa."
  },
  composer: {
    modesLabel: "Tipo de resposta",
    reply: "Responder",
    replyAll: "Responder a todos",
    forward: "Encaminhar",
    from: "De",
    to: "Para",
    cc: "Cc",
    subject: "Assunto",
    body: "Corpo do e-mail",
    placeholder: "Escreva sua resposta",
    recipientsPlaceholder: "Separe os endereços por vírgula",
    bold: "Negrito",
    italic: "Itálico",
    attach: "Anexar arquivo",
    removeAttachment: "Remover {{name}}",
    send: "Enviar e-mail",
    sending: "Enviando…",
    reauth: "A autorização desta caixa venceu. Reconecte em Conexões.",
    replyPrefix: "Re:",
    forwardPrefix: "Enc:"
  },
  errors: {
    generic: "Não foi possível enviar o e-mail. Tente de novo em instantes."
  },
  contacts: {
    noPhone: "sem telefone"
  }
};

const enInbox = {
  filters: {
    label: "Channel",
    groupLabel: "Filter by channel",
    all: "All",
    whatsapp: "WhatsApp",
    email: "Email"
  },
  noSubject: "(no subject)",
  thread: {
    count: { one: "{{count}} message", other: "{{count}} messages" },
    to: "to {{list}}",
    cc: "cc {{list}}",
    today: "Today",
    yesterday: "Yesterday",
    loading: "Loading emails…",
    loadError: "Could not load the emails of this ticket.",
    retry: "Try again",
    empty: "No emails in this conversation yet.",
    frameTitle: "Email content from {{from}}",
    attachmentSkipped: "Attachment not imported (too large)",
    download: "Download {{name}}",
    replyTo: "reply to {{list}}",
    oversize:
      "Message too large to be imported; open it in the original mailbox."
  },
  status: {
    queued: "Queued",
    sent: "Sent",
    failed: "Failed",
    failedWithReason: "Failed: {{reason}}",
    unknown: "Delivery not confirmed",
    partial: "Sent — some recipients were refused",
    unknownHint:
      "The server did not confirm the send. The message is not resent automatically and becomes sent once the copy shows up in the mailbox."
  },
  composer: {
    modesLabel: "Reply type",
    reply: "Reply",
    replyAll: "Reply all",
    forward: "Forward",
    from: "From",
    to: "To",
    cc: "Cc",
    subject: "Subject",
    body: "Email body",
    placeholder: "Write your reply",
    recipientsPlaceholder: "Separate addresses with commas",
    bold: "Bold",
    italic: "Italic",
    attach: "Attach file",
    removeAttachment: "Remove {{name}}",
    send: "Send email",
    sending: "Sending…",
    reauth:
      "This mailbox authorization has expired. Reconnect it in Connections.",
    replyPrefix: "Re:",
    forwardPrefix: "Fwd:"
  },
  errors: {
    generic: "The email could not be sent. Try again in a moment."
  },
  contacts: {
    noPhone: "no phone"
  }
};

// Merged into the app-wide `backendErrors` map so toastError translates these
// codes anywhere they come back from the API.
const ptBackendErrors = {
  ERR_CONTACT_HAS_NO_PHONE:
    "Este contato não tem telefone. Atendimentos e agendamentos de WhatsApp precisam de um número.",
  ERR_EMAIL_CHANNEL_DISABLED:
    "O canal de e-mail não está habilitado para esta empresa.",
  ERR_EMAIL_ACCOUNT_UNAVAILABLE:
    "A caixa de e-mail deste atendimento não está disponível. Confira a conexão em Conexões.",
  ERR_EMAIL_RECIPIENT_REQUIRED: "Informe ao menos um destinatário.",
  ERR_EMAIL_INVALID_RECIPIENT:
    "Há um endereço de e-mail inválido nos destinatários.",
  ERR_EMAIL_TOO_MANY_RECIPIENTS:
    "Muitos destinatários. O limite é de 20 por e-mail.",
  ERR_EMAIL_ATTACHMENTS_TOO_LARGE: "Os anexos passam do limite de 25 MB.",
  ERR_EMAIL_ATTACHMENT_NOT_FOUND: "Anexo não encontrado.",
  ERR_EMAIL_BOUNCED: "O servidor de destino recusou a entrega.",
  ERR_EMAIL_AUTH: "A caixa recusou o acesso. Reconecte a conta em Conexões.",
  ERR_EMAIL_CONNECTION_FAILED:
    "Não foi possível conectar ao servidor de e-mail.",
  ERR_EMAIL_AUTH_FAILED:
    "A autorização desta caixa venceu. Reconecte em Conexões.",
  ERR_EMAIL_CREDENTIALS_MISSING:
    "Esta caixa está sem credenciais salvas. Reconecte em Conexões.",
  ERR_EMAIL_TRANSIENT:
    "O servidor de e-mail não respondeu depois de várias tentativas. Tente enviar de novo.",
  ERR_EMAIL_SEND_AMBIGUOUS:
    "O servidor não confirmou o envio. Confira a caixa antes de reenviar.",
  ERR_EMAIL_ATTACHMENT_MISSING:
    "Um anexo não está mais disponível. Anexe o arquivo de novo e reenvie.",
  ERR_EMAIL_INVALID_MESSAGE:
    "A mensagem não pôde ser enviada: verifique os destinatários e os anexos.",
  ERR_EMAIL_REJECTED: "O servidor de e-mail recusou o envio.",
  ERR_EMAIL_PARTIAL_REJECTION:
    "O e-mail foi enviado, mas alguns destinatários foram recusados pelo servidor.",
  ERR_EMAIL_PROVIDER_NOT_SUPPORTED:
    "Este tipo de caixa de e-mail ainda não é suportado.",
  ERR_EMAIL_HOST_NOT_ALLOWED:
    "Este servidor de e-mail não é permitido. Use o endereço público do servidor.",
  ERR_EMAIL_PORT_NOT_ALLOWED:
    "Esta porta não é permitida para o servidor de e-mail.",
  ERR_EMAIL_MESSAGE_SKIPPED:
    "Um e-mail não pôde ser importado e foi ignorado. Os demais continuam chegando normalmente.",
  ERR_EMAIL_ACCOUNT_NOT_FOUND: "Conta de e-mail não encontrada.",
  ERR_EMAIL_ACCOUNT_EXISTS: "Esta caixa de e-mail já está conectada.",
  ERR_EMAIL_INVALID_ACCOUNT:
    "Os dados da conta de e-mail são inválidos. Confira os campos e tente de novo.",
  ERR_EMAIL_SEND_FAILED: "Não foi possível enviar o e-mail.",
  ERR_INVALID_CHANNEL: "Canal inválido para esta operação.",
  ERR_EMAIL_EMPTY_MESSAGE:
    "Escreva uma mensagem ou anexe um arquivo antes de enviar.",
  ERR_EMAIL_INVALID_MODE: "Tipo de resposta inválido.",
  ERR_EMAIL_INVALID_TICKET: "Este atendimento não é de e-mail.",
  ERR_EMAIL_INVALID_IDEMPOTENCY_KEY:
    "Não foi possível identificar este envio. Recarregue a página e tente de novo.",
  ERR_EMAIL_IDEMPOTENCY_CONFLICT:
    "Este envio conflita com outro já registrado. Recarregue a página e tente de novo.",
  ERR_EMAIL_SYNC_ENQUEUE_FAILED:
    "Não foi possível iniciar a sincronização agora. Tente de novo em instantes.",
  ERR_EMAIL_SYNC_FAILED:
    "Falha ao sincronizar a caixa de e-mail. Uma nova tentativa é feita automaticamente.",
  ERR_GMAIL_OAUTH_FAILED:
    "Não foi possível concluir a conexão com o Google. Tente conectar de novo.",
  ERR_GMAIL_NOT_CONFIGURED:
    "A conexão com o Gmail não está configurada neste servidor. Fale com o administrador do sistema.",
  ERR_GMAIL_ACCOUNT_MISMATCH:
    "A conta Google escolhida não é a da conexão que você está reconectando. Entre com a mesma conta."
};

const enBackendErrors = {
  ERR_CONTACT_HAS_NO_PHONE:
    "This contact has no phone number. WhatsApp tickets and schedules need a number.",
  ERR_EMAIL_CHANNEL_DISABLED:
    "The email channel is not enabled for this company.",
  ERR_EMAIL_ACCOUNT_UNAVAILABLE:
    "The mailbox of this ticket is not available. Check the connection in Connections.",
  ERR_EMAIL_RECIPIENT_REQUIRED: "Enter at least one recipient.",
  ERR_EMAIL_INVALID_RECIPIENT: "One of the recipients is not a valid email.",
  ERR_EMAIL_TOO_MANY_RECIPIENTS:
    "Too many recipients. The limit is 20 per email.",
  ERR_EMAIL_ATTACHMENTS_TOO_LARGE: "Attachments exceed the 25 MB limit.",
  ERR_EMAIL_ATTACHMENT_NOT_FOUND: "Attachment not found.",
  ERR_EMAIL_BOUNCED: "The destination server refused delivery.",
  ERR_EMAIL_AUTH:
    "The mailbox refused access. Reconnect the account in Connections.",
  ERR_EMAIL_CONNECTION_FAILED: "Could not connect to the mail server.",
  ERR_EMAIL_AUTH_FAILED:
    "This mailbox authorization has expired. Reconnect it in Connections.",
  ERR_EMAIL_CREDENTIALS_MISSING:
    "This mailbox has no saved credentials. Reconnect it in Connections.",
  ERR_EMAIL_TRANSIENT:
    "The mail server did not respond after several attempts. Try sending again.",
  ERR_EMAIL_SEND_AMBIGUOUS:
    "The server did not confirm the send. Check the mailbox before resending.",
  ERR_EMAIL_ATTACHMENT_MISSING:
    "An attachment is no longer available. Attach the file again and resend.",
  ERR_EMAIL_INVALID_MESSAGE:
    "The message could not be sent: check the recipients and attachments.",
  ERR_EMAIL_REJECTED: "The mail server rejected the message.",
  ERR_EMAIL_PARTIAL_REJECTION:
    "The email was sent, but the server refused some recipients.",
  ERR_EMAIL_PROVIDER_NOT_SUPPORTED:
    "This type of mailbox is not supported yet.",
  ERR_EMAIL_HOST_NOT_ALLOWED:
    "This mail server is not allowed. Use the server's public address.",
  ERR_EMAIL_PORT_NOT_ALLOWED: "This port is not allowed for the mail server.",
  ERR_EMAIL_MESSAGE_SKIPPED:
    "An email could not be imported and was skipped. The others keep arriving normally.",
  ERR_EMAIL_ACCOUNT_NOT_FOUND: "Email account not found.",
  ERR_EMAIL_ACCOUNT_EXISTS: "This mailbox is already connected.",
  ERR_EMAIL_INVALID_ACCOUNT:
    "The email account details are invalid. Check the fields and try again.",
  ERR_EMAIL_SEND_FAILED: "The email could not be sent.",
  ERR_INVALID_CHANNEL: "Invalid channel for this operation.",
  ERR_EMAIL_EMPTY_MESSAGE: "Write a message or attach a file before sending.",
  ERR_EMAIL_INVALID_MODE: "Invalid reply type.",
  ERR_EMAIL_INVALID_TICKET: "This ticket is not an email ticket.",
  ERR_EMAIL_INVALID_IDEMPOTENCY_KEY:
    "This send could not be identified. Reload the page and try again.",
  ERR_EMAIL_IDEMPOTENCY_CONFLICT:
    "This send conflicts with another one already recorded. Reload the page and try again.",
  ERR_EMAIL_SYNC_ENQUEUE_FAILED:
    "The sync could not be started right now. Try again in a moment.",
  ERR_EMAIL_SYNC_FAILED:
    "Failed to sync the mailbox. It is retried automatically.",
  ERR_GMAIL_OAUTH_FAILED:
    "The connection with Google could not be completed. Try connecting again.",
  ERR_GMAIL_NOT_CONFIGURED:
    "Gmail connection is not configured on this server. Contact the system administrator.",
  ERR_GMAIL_ACCOUNT_MISMATCH:
    "The Google account you chose is not the one of the connection you are reconnecting. Sign in with the same account."
};

const pt = {
  emailChannel: {
    companies: {
      enabled: "Canal de e-mail",
      on: "Habilitado",
      off: "Desabilitado"
    },
    connections: ptConnections,
    inbox: ptInbox
  },
  backendErrors: ptBackendErrors
};

const ptPT = {
  emailChannel: {
    companies: pt.emailChannel.companies,
    connections: {
      ...ptConnections,
      form: {
        ...ptConnections.form,
        custom: {
          ...ptConnections.form.custom,
          addressPlaceholder: "contacto@suaempresa.pt",
          imapHostPlaceholder: "imap.suaempresa.pt",
          smtpHostPlaceholder: "smtp.suaempresa.pt"
        }
      }
    },
    inbox: ptInbox
  },
  backendErrors: { ...ptBackendErrors }
};

const en = {
  emailChannel: {
    companies: {
      enabled: "Email channel",
      on: "Enabled",
      off: "Disabled"
    },
    connections: enConnections,
    inbox: enInbox
  },
  backendErrors: enBackendErrors
};

// Other languages: only the strings added for the Gmail finish step, Reply-To,
// the oversize notice and the remaining error codes; the rest of the email
// channel falls back like the other overlays.
const extraLanguage = ({ replyTo, oversize, errors }) => ({
  emailChannel: { inbox: { thread: { replyTo, oversize } } },
  backendErrors: errors
});

const esExtra = extraLanguage({
  replyTo: "responder a {{list}}",
  oversize:
    "Mensaje demasiado grande para importarlo; ábrelo en el buzón de correo original.",
  errors: {
    ERR_EMAIL_MESSAGE_SKIPPED:
      "Un correo no se pudo importar y se omitió. Los demás siguen llegando con normalidad.",
    ERR_EMAIL_ACCOUNT_NOT_FOUND: "Cuenta de correo no encontrada.",
    ERR_EMAIL_ACCOUNT_EXISTS: "Este buzón de correo ya está conectado.",
    ERR_EMAIL_INVALID_ACCOUNT:
      "Los datos de la cuenta de correo no son válidos. Revisa los campos e inténtalo de nuevo.",
    ERR_EMAIL_SEND_FAILED: "No se pudo enviar el correo.",
    ERR_INVALID_CHANNEL: "Canal no válido para esta operación.",
    ERR_EMAIL_EMPTY_MESSAGE:
      "Escribe un mensaje o adjunta un archivo antes de enviar.",
    ERR_EMAIL_INVALID_MODE: "Tipo de respuesta no válido.",
    ERR_EMAIL_INVALID_TICKET: "Esta atención no es de correo.",
    ERR_EMAIL_INVALID_IDEMPOTENCY_KEY:
      "No se pudo identificar este envío. Recarga la página e inténtalo de nuevo.",
    ERR_EMAIL_IDEMPOTENCY_CONFLICT:
      "Este envío entra en conflicto con otro ya registrado. Recarga la página e inténtalo de nuevo.",
    ERR_EMAIL_SYNC_ENQUEUE_FAILED:
      "No se pudo iniciar la sincronización ahora. Inténtalo de nuevo en unos instantes.",
    ERR_EMAIL_SYNC_FAILED:
      "Error al sincronizar el buzón de correo. Se reintenta automáticamente.",
    ERR_GMAIL_OAUTH_FAILED:
      "No se pudo completar la conexión con Google. Intenta conectar de nuevo.",
    ERR_GMAIL_NOT_CONFIGURED:
      "La conexión con Gmail no está configurada en este servidor. Habla con el administrador del sistema.",
    ERR_GMAIL_ACCOUNT_MISMATCH:
      "La cuenta de Google elegida no es la de la conexión que estás reconectando. Inicia sesión con la misma cuenta."
  }
});

const frExtra = extraLanguage({
  replyTo: "répondre à {{list}}",
  oversize:
    "Message trop volumineux pour être importé ; ouvrez-le dans la boîte mail d'origine.",
  errors: {
    ERR_EMAIL_MESSAGE_SKIPPED:
      "Un e-mail n'a pas pu être importé et a été ignoré. Les autres continuent d'arriver normalement.",
    ERR_EMAIL_ACCOUNT_NOT_FOUND: "Compte e-mail introuvable.",
    ERR_EMAIL_ACCOUNT_EXISTS: "Cette boîte mail est déjà connectée.",
    ERR_EMAIL_INVALID_ACCOUNT:
      "Les informations du compte e-mail ne sont pas valides. Vérifiez les champs et réessayez.",
    ERR_EMAIL_SEND_FAILED: "L'e-mail n'a pas pu être envoyé.",
    ERR_INVALID_CHANNEL: "Canal non valide pour cette opération.",
    ERR_EMAIL_EMPTY_MESSAGE:
      "Écrivez un message ou joignez un fichier avant d'envoyer.",
    ERR_EMAIL_INVALID_MODE: "Type de réponse non valide.",
    ERR_EMAIL_INVALID_TICKET: "Ce ticket n'est pas un ticket e-mail.",
    ERR_EMAIL_INVALID_IDEMPOTENCY_KEY:
      "Cet envoi n'a pas pu être identifié. Rechargez la page et réessayez.",
    ERR_EMAIL_IDEMPOTENCY_CONFLICT:
      "Cet envoi est en conflit avec un autre déjà enregistré. Rechargez la page et réessayez.",
    ERR_EMAIL_SYNC_ENQUEUE_FAILED:
      "La synchronisation n'a pas pu démarrer pour le moment. Réessayez dans un instant.",
    ERR_EMAIL_SYNC_FAILED:
      "Échec de la synchronisation de la boîte mail. Une nouvelle tentative est faite automatiquement.",
    ERR_GMAIL_OAUTH_FAILED:
      "La connexion avec Google n'a pas pu être finalisée. Essayez de vous reconnecter.",
    ERR_GMAIL_NOT_CONFIGURED:
      "La connexion Gmail n'est pas configurée sur ce serveur. Contactez l'administrateur du système.",
    ERR_GMAIL_ACCOUNT_MISMATCH:
      "Le compte Google choisi n'est pas celui de la connexion que vous reconnectez. Connectez-vous avec le même compte."
  }
});

const deExtra = extraLanguage({
  replyTo: "Antwort an {{list}}",
  oversize:
    "Nachricht zu groß für den Import; öffne sie im ursprünglichen Postfach.",
  errors: {
    ERR_EMAIL_MESSAGE_SKIPPED:
      "Eine E-Mail konnte nicht importiert werden und wurde übersprungen. Die übrigen kommen weiterhin normal an.",
    ERR_EMAIL_ACCOUNT_NOT_FOUND: "E-Mail-Konto nicht gefunden.",
    ERR_EMAIL_ACCOUNT_EXISTS: "Dieses Postfach ist bereits verbunden.",
    ERR_EMAIL_INVALID_ACCOUNT:
      "Die Daten des E-Mail-Kontos sind ungültig. Prüfe die Felder und versuche es erneut.",
    ERR_EMAIL_SEND_FAILED: "Die E-Mail konnte nicht gesendet werden.",
    ERR_INVALID_CHANNEL: "Ungültiger Kanal für diesen Vorgang.",
    ERR_EMAIL_EMPTY_MESSAGE:
      "Schreibe eine Nachricht oder hänge eine Datei an, bevor du sendest.",
    ERR_EMAIL_INVALID_MODE: "Ungültige Antwortart.",
    ERR_EMAIL_INVALID_TICKET: "Dieses Ticket ist kein E-Mail-Ticket.",
    ERR_EMAIL_INVALID_IDEMPOTENCY_KEY:
      "Dieser Versand konnte nicht zugeordnet werden. Lade die Seite neu und versuche es erneut.",
    ERR_EMAIL_IDEMPOTENCY_CONFLICT:
      "Dieser Versand steht im Konflikt mit einem bereits erfassten. Lade die Seite neu und versuche es erneut.",
    ERR_EMAIL_SYNC_ENQUEUE_FAILED:
      "Die Synchronisierung konnte gerade nicht gestartet werden. Versuche es gleich noch einmal.",
    ERR_EMAIL_SYNC_FAILED:
      "Das Postfach konnte nicht synchronisiert werden. Es wird automatisch erneut versucht.",
    ERR_GMAIL_OAUTH_FAILED:
      "Die Verbindung mit Google konnte nicht abgeschlossen werden. Versuche es erneut.",
    ERR_GMAIL_NOT_CONFIGURED:
      "Die Gmail-Verbindung ist auf diesem Server nicht eingerichtet. Wende dich an den Systemadministrator.",
    ERR_GMAIL_ACCOUNT_MISMATCH:
      "Das gewählte Google-Konto gehört nicht zu der Verbindung, die du neu verbindest. Melde dich mit demselben Konto an."
  }
});

const itExtra = extraLanguage({
  replyTo: "rispondi a {{list}}",
  oversize:
    "Messaggio troppo grande per essere importato; aprilo nella casella di posta originale.",
  errors: {
    ERR_EMAIL_MESSAGE_SKIPPED:
      "Un'email non è stata importata ed è stata saltata. Le altre continuano ad arrivare normalmente.",
    ERR_EMAIL_ACCOUNT_NOT_FOUND: "Account email non trovato.",
    ERR_EMAIL_ACCOUNT_EXISTS: "Questa casella di posta è già collegata.",
    ERR_EMAIL_INVALID_ACCOUNT:
      "I dati dell'account email non sono validi. Controlla i campi e riprova.",
    ERR_EMAIL_SEND_FAILED: "Non è stato possibile inviare l'email.",
    ERR_INVALID_CHANNEL: "Canale non valido per questa operazione.",
    ERR_EMAIL_EMPTY_MESSAGE:
      "Scrivi un messaggio o allega un file prima di inviare.",
    ERR_EMAIL_INVALID_MODE: "Tipo di risposta non valido.",
    ERR_EMAIL_INVALID_TICKET: "Questo ticket non è un ticket email.",
    ERR_EMAIL_INVALID_IDEMPOTENCY_KEY:
      "Non è stato possibile identificare questo invio. Ricarica la pagina e riprova.",
    ERR_EMAIL_IDEMPOTENCY_CONFLICT:
      "Questo invio è in conflitto con un altro già registrato. Ricarica la pagina e riprova.",
    ERR_EMAIL_SYNC_ENQUEUE_FAILED:
      "Non è stato possibile avviare la sincronizzazione adesso. Riprova tra poco.",
    ERR_EMAIL_SYNC_FAILED:
      "Sincronizzazione della casella di posta non riuscita. Viene ritentata automaticamente.",
    ERR_GMAIL_OAUTH_FAILED:
      "Non è stato possibile completare la connessione con Google. Prova a collegarti di nuovo.",
    ERR_GMAIL_NOT_CONFIGURED:
      "La connessione Gmail non è configurata su questo server. Contatta l'amministratore di sistema.",
    ERR_GMAIL_ACCOUNT_MISMATCH:
      "L'account Google scelto non è quello della connessione che stai ricollegando. Accedi con lo stesso account."
  }
});

const idExtra = extraLanguage({
  replyTo: "balas ke {{list}}",
  oversize:
    "Pesan terlalu besar untuk diimpor; buka di kotak surat email aslinya.",
  errors: {
    ERR_EMAIL_MESSAGE_SKIPPED:
      "Satu email tidak dapat diimpor dan dilewati. Email lainnya tetap masuk seperti biasa.",
    ERR_EMAIL_ACCOUNT_NOT_FOUND: "Akun email tidak ditemukan.",
    ERR_EMAIL_ACCOUNT_EXISTS: "Kotak surat ini sudah terhubung.",
    ERR_EMAIL_INVALID_ACCOUNT:
      "Data akun email tidak valid. Periksa kolomnya lalu coba lagi.",
    ERR_EMAIL_SEND_FAILED: "Email tidak dapat dikirim.",
    ERR_INVALID_CHANNEL: "Kanal tidak valid untuk operasi ini.",
    ERR_EMAIL_EMPTY_MESSAGE:
      "Tulis pesan atau lampirkan file sebelum mengirim.",
    ERR_EMAIL_INVALID_MODE: "Jenis balasan tidak valid.",
    ERR_EMAIL_INVALID_TICKET: "Tiket ini bukan tiket email.",
    ERR_EMAIL_INVALID_IDEMPOTENCY_KEY:
      "Pengiriman ini tidak dapat dikenali. Muat ulang halaman lalu coba lagi.",
    ERR_EMAIL_IDEMPOTENCY_CONFLICT:
      "Pengiriman ini bentrok dengan pengiriman lain yang sudah tercatat. Muat ulang halaman lalu coba lagi.",
    ERR_EMAIL_SYNC_ENQUEUE_FAILED:
      "Sinkronisasi tidak dapat dimulai sekarang. Coba lagi sebentar lagi.",
    ERR_EMAIL_SYNC_FAILED:
      "Gagal menyinkronkan kotak surat. Akan dicoba lagi secara otomatis.",
    ERR_GMAIL_OAUTH_FAILED:
      "Koneksi dengan Google tidak dapat diselesaikan. Coba hubungkan lagi.",
    ERR_GMAIL_NOT_CONFIGURED:
      "Koneksi Gmail belum dikonfigurasi di server ini. Hubungi administrator sistem.",
    ERR_GMAIL_ACCOUNT_MISMATCH:
      "Akun Google yang dipilih bukan akun dari koneksi yang sedang Anda hubungkan ulang. Masuk dengan akun yang sama."
  }
});

export const emailChannelMessages = {
  pt,
  pt_PT: ptPT,
  en,
  es: esExtra,
  fr: frExtra,
  de: deExtra,
  it: itExtra,
  id: idExtra
};
