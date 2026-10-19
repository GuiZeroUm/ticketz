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
    "A conta Google escolhida não é a da conexão que você está reconectando. Entre com a mesma conta.",
  ERR_GMAIL_SEND_400: "O Gmail recusou a mensagem.",
  ERR_GMAIL_SEND_403:
    "O Gmail recusou o envio por falta de permissão ou limite de cota. Confira a conexão ou tente mais tarde."
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
    "The Google account you chose is not the one of the connection you are reconnecting. Sign in with the same account.",
  ERR_GMAIL_SEND_400: "Gmail refused the message.",
  ERR_GMAIL_SEND_403:
    "Gmail refused the send (missing permission or quota reached). Check the connection or try again later."
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

// The other languages carry the whole email channel too (same keys as pt).
const esConnections = {
  filters: {
    label: "Filtrar por canal",
    all: "Todas",
    whatsapp: "WhatsApp",
    email: "Correo"
  },
  search: {
    placeholder: "Buscar conexión"
  },
  summary: {
    whatsapp: {
      label: "WhatsApp",
      empty: "Ninguna conexión",
      total: { one: "{{count}} conexión", other: "{{count}} conexiones" },
      connected: { one: "{{count}} conectada", other: "{{count}} conectadas" },
      waiting: { one: "{{count}} en espera", other: "{{count}} en espera" },
      disconnected: {
        one: "{{count}} desconectada",
        other: "{{count}} desconectadas"
      }
    },
    email: {
      label: "Correo",
      empty: "Ninguna cuenta conectada",
      accounts: { one: "{{count}} cuenta", other: "{{count}} cuentas" },
      attention: {
        one: "{{count}} necesita atención",
        other: "{{count}} necesitan atención"
      }
    }
  },
  table: {
    channel: "Canal",
    account: "Cuenta",
    default: "Predeterminado del canal"
  },
  providers: {
    whatsapp: "WhatsApp",
    whatsappApi: "WhatsApp API",
    gmail: "Gmail",
    outlook: "Hotmail",
    icloud: "iCloud",
    custom: "Correo propio"
  },
  status: {
    active: { label: "Conectado", title: "¡Conexión establecida!" },
    connecting: {
      label: "En espera",
      title: "Esperando la primera sincronización del buzón"
    },
    invalidPassword: {
      label: "Contraseña no válida",
      title: "La contraseña de aplicación fue revocada o caducó"
    },
    authExpired: {
      label: "Autorización caducada",
      title:
        "Vuelve a conectar la cuenta de Google para seguir recibiendo correos"
    },
    error: { label: "Error", title: "Error al sincronizar el buzón de correo" },
    disabled: {
      label: "Desconectado",
      title: "La cuenta fue desconectada y no se está sincronizando"
    }
  },
  note: {
    imap: "IMAP/SMTP · {{host}}",
    metaCloudApi: "Meta Cloud API"
  },
  actions: {
    add: "Añadir conexión",
    syncNow: "Sincronizar ahora",
    disconnect: "Desconectar cuenta",
    updateAppPassword: "Actualizar contraseña de aplicación",
    updatePassword: "Actualizar contraseña",
    reconnectGmail: "Reconectar Gmail",
    edit: "Editar conexión"
  },
  confirm: {
    disconnectTitle: "Desconectar cuenta de correo",
    disconnectMessage:
      "El buzón deja de sincronizarse y se borran las credenciales guardadas. Las atenciones existentes siguen en el sistema."
  },
  toasts: {
    syncQueued: "Sincronización iniciada",
    disconnected: "Cuenta de correo desconectada",
    saved: "Conexión guardada",
    updated: "Conexión actualizada",
    passwordUpdated: "Contraseña actualizada",
    testOk: "Conexión probada correctamente",
    gmailConnected: "Gmail conectado correctamente"
  },
  picker: {
    title: "Añadir conexión",
    subtitle: "Elige el canal que quieres atender.",
    footer:
      "Cada conexión aparece en las atenciones con el icono del canal y el nombre que le des.",
    soon: "Próximamente",
    groups: {
      whatsapp: "WhatsApp",
      email: "Correo"
    },
    options: {
      whatsappQr: {
        label: "WhatsApp (código QR)",
        hint: "Escanea el código QR con el móvil de la empresa"
      },
      whatsappApi: {
        label: "WhatsApp API oficial",
        hint: "Conecta mediante la Meta Cloud API"
      },
      gmail: { label: "Gmail", hint: "Iniciar sesión con la cuenta de Google" },
      outlook: {
        label: "Hotmail / Outlook",
        hint: "Iniciar sesión con la cuenta de Microsoft"
      },
      icloud: {
        label: "iCloud",
        hint: "Correo de iCloud con contraseña de aplicación"
      },
      custom: {
        label: "Correo propio",
        hint: "Dominio de la empresa mediante IMAP y SMTP"
      }
    }
  },
  form: {
    back: "Volver",
    close: "Cerrar",
    cancel: "Cancelar",
    test: "Probar conexión",
    save: "Guardar conexión",
    name: "Nombre de la conexión",
    nameHelp: "Aparece en las atenciones junto al icono del canal",
    queue: "Cola de entrada",
    noQueue: "Sin cola",
    footer: "Puedes editar el nombre y la cola después, en Editar conexión.",
    required: "Obligatorio",
    invalidEmail: "Correo no válido",
    invalidPort: "Puerto no válido",
    gmail: {
      title: "Gmail",
      subtitle:
        "Los correos de la bandeja de entrada se convierten en atenciones.",
      namePlaceholder: "Ventas",
      howTitle: "Cómo funciona",
      step1: "Inicias sesión con la cuenta de Google y autorizas el acceso.",
      step2: "Los correos nuevos llegan como atenciones en la cola elegida.",
      step3: "Las respuestas salen por el propio Gmail, con tu firma.",
      button: "Continuar con Google"
    },
    icloud: {
      title: "iCloud",
      subtitle: "Conecta un correo @icloud.com, @me.com o @mac.com.",
      namePlaceholder: "Dirección",
      address: "Correo de iCloud",
      addressPlaceholder: "nombre@icloud.com",
      password: "Contraseña de aplicación",
      passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
      help: "No uses la contraseña del Apple ID. Genera una contraseña de aplicación en appleid.apple.com › Inicio de sesión y seguridad › Contraseñas específicas de apps."
    },
    custom: {
      title: "Correo propio",
      subtitle: "Usa el correo del dominio de tu empresa.",
      namePlaceholder: "Contacto",
      address: "Correo",
      addressPlaceholder: "contacto@tuempresa.com",
      password: "Contraseña",
      passwordPlaceholder: "Contraseña del buzón",
      imapHost: "Servidor de entrada (IMAP)",
      imapHostPlaceholder: "imap.tuempresa.com",
      smtpHost: "Servidor de salida (SMTP)",
      smtpHostPlaceholder: "smtp.tuempresa.com",
      port: "Puerto",
      secure: "Usar conexión segura (SSL/TLS)"
    },
    edit: {
      title: "Editar conexión",
      save: "Guardar"
    },
    password: {
      titleApp: "Actualizar contraseña de aplicación",
      titleMailbox: "Actualizar contraseña",
      subtitle:
        "{{address}} · la nueva contraseña se prueba antes de guardarla.",
      save: "Guardar contraseña"
    }
  },
  errors: {
    generic: "No se pudo completar la operación.",
    ERR_EMAIL_CHANNEL_DISABLED:
      "El canal de correo no está habilitado para esta empresa.",
    ERR_EMAIL_HOST_NOT_ALLOWED:
      "Este servidor no está permitido. Usa la dirección pública del servidor IMAP/SMTP.",
    ERR_EMAIL_PORT_NOT_ALLOWED:
      "Este puerto no está permitido para el servidor de correo.",
    ERR_EMAIL_CONNECTION_FAILED:
      "No se pudo conectar al servidor de correo. Revisa el servidor, el puerto y la opción SSL/TLS.",
    ERR_EMAIL_AUTH:
      "Correo o contraseña incorrectos. En iCloud, usa una contraseña de aplicación.",
    ERR_GMAIL_STATE:
      "La autorización de Google caducó o no es válida. Intenta conectar de nuevo.",
    ERR_GMAIL_NO_REFRESH_TOKEN:
      "Google no concedió acceso continuo al buzón. Quita el acceso en myaccount.google.com/permissions y vuelve a conectar.",
    ERR_GMAIL_SCOPES_MISSING:
      "Para conectar Gmail, autoriza la lectura y el envío de correos en la pantalla de Google."
  }
};

const esInbox = {
  filters: {
    label: "Canal",
    groupLabel: "Filtrar por canal",
    all: "Todos",
    whatsapp: "WhatsApp",
    email: "Correo"
  },
  noSubject: "(sin asunto)",
  thread: {
    count: { one: "{{count}} mensaje", other: "{{count}} mensajes" },
    to: "para {{list}}",
    cc: "cc {{list}}",
    today: "Hoy",
    yesterday: "Ayer",
    loading: "Cargando correos…",
    loadError: "No se pudieron cargar los correos de esta atención.",
    retry: "Intentar de nuevo",
    empty: "Aún no hay correos en esta conversación.",
    frameTitle: "Contenido del correo de {{from}}",
    attachmentSkipped: "Adjunto no importado (demasiado grande)",
    download: "Descargar {{name}}",
    replyTo: "responder a {{list}}",
    oversize:
      "Mensaje demasiado grande para importarlo; ábrelo en el buzón de correo original."
  },
  status: {
    queued: "En cola",
    sent: "Enviado",
    failed: "Falló",
    failedWithReason: "Falló: {{reason}}",
    unknown: "Envío no confirmado",
    partial: "Enviado — algunos destinatarios fueron rechazados",
    unknownHint:
      "El servidor no confirmó el envío. El mensaje no se reenvía automáticamente y pasa a enviado cuando la copia aparece en el buzón."
  },
  composer: {
    modesLabel: "Tipo de respuesta",
    reply: "Responder",
    replyAll: "Responder a todos",
    forward: "Reenviar",
    from: "De",
    to: "Para",
    cc: "Cc",
    subject: "Asunto",
    body: "Cuerpo del correo",
    placeholder: "Escribe tu respuesta",
    recipientsPlaceholder: "Separa las direcciones con comas",
    bold: "Negrita",
    italic: "Cursiva",
    attach: "Adjuntar archivo",
    removeAttachment: "Quitar {{name}}",
    send: "Enviar correo",
    sending: "Enviando…",
    reauth:
      "La autorización de este buzón caducó. Vuelve a conectarlo en Conexiones.",
    replyPrefix: "Re:",
    forwardPrefix: "Fwd:"
  },
  errors: {
    generic:
      "No se pudo enviar el correo. Inténtalo de nuevo en unos instantes."
  },
  contacts: {
    noPhone: "sin teléfono"
  }
};

const esBackendErrors = {
  ERR_CONTACT_HAS_NO_PHONE:
    "Este contacto no tiene teléfono. Las atenciones y programaciones de WhatsApp necesitan un número.",
  ERR_EMAIL_CHANNEL_DISABLED:
    "El canal de correo no está habilitado para esta empresa.",
  ERR_EMAIL_ACCOUNT_UNAVAILABLE:
    "El buzón de esta atención no está disponible. Revisa la conexión en Conexiones.",
  ERR_EMAIL_RECIPIENT_REQUIRED: "Indica al menos un destinatario.",
  ERR_EMAIL_INVALID_RECIPIENT:
    "Hay una dirección de correo no válida en los destinatarios.",
  ERR_EMAIL_TOO_MANY_RECIPIENTS:
    "Demasiados destinatarios. El límite es de 20 por correo.",
  ERR_EMAIL_ATTACHMENTS_TOO_LARGE: "Los adjuntos superan el límite de 25 MB.",
  ERR_EMAIL_ATTACHMENT_NOT_FOUND: "Adjunto no encontrado.",
  ERR_EMAIL_BOUNCED: "El servidor de destino rechazó la entrega.",
  ERR_EMAIL_AUTH:
    "El buzón rechazó el acceso. Vuelve a conectar la cuenta en Conexiones.",
  ERR_EMAIL_CONNECTION_FAILED: "No se pudo conectar al servidor de correo.",
  ERR_EMAIL_AUTH_FAILED:
    "La autorización de este buzón caducó. Vuelve a conectarlo en Conexiones.",
  ERR_EMAIL_CREDENTIALS_MISSING:
    "Este buzón no tiene credenciales guardadas. Vuelve a conectarlo en Conexiones.",
  ERR_EMAIL_TRANSIENT:
    "El servidor de correo no respondió tras varios intentos. Intenta enviar de nuevo.",
  ERR_EMAIL_SEND_AMBIGUOUS:
    "El servidor no confirmó el envío. Revisa el buzón antes de reenviar.",
  ERR_EMAIL_ATTACHMENT_MISSING:
    "Un adjunto ya no está disponible. Adjunta el archivo de nuevo y reenvía.",
  ERR_EMAIL_INVALID_MESSAGE:
    "No se pudo enviar el mensaje: revisa los destinatarios y los adjuntos.",
  ERR_EMAIL_REJECTED: "El servidor de correo rechazó el envío.",
  ERR_EMAIL_PARTIAL_REJECTION:
    "El correo se envió, pero el servidor rechazó algunos destinatarios.",
  ERR_EMAIL_PROVIDER_NOT_SUPPORTED: "Este tipo de buzón aún no es compatible.",
  ERR_EMAIL_HOST_NOT_ALLOWED:
    "Este servidor de correo no está permitido. Usa la dirección pública del servidor.",
  ERR_EMAIL_PORT_NOT_ALLOWED:
    "Este puerto no está permitido para el servidor de correo.",
  ERR_GMAIL_SEND_400: "Gmail rechazó el mensaje.",
  ERR_GMAIL_SEND_403:
    "Gmail rechazó el envío por falta de permiso o por límite de cuota. Revisa la conexión o inténtalo más tarde.",
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
};

const esMessages = {
  emailChannel: {
    companies: {
      enabled: "Canal de correo",
      on: "Habilitado",
      off: "Deshabilitado"
    },
    connections: esConnections,
    inbox: esInbox
  },
  backendErrors: esBackendErrors
};

const frConnections = {
  filters: {
    label: "Filtrer par canal",
    all: "Toutes",
    whatsapp: "WhatsApp",
    email: "E-mail"
  },
  search: {
    placeholder: "Rechercher une connexion"
  },
  summary: {
    whatsapp: {
      label: "WhatsApp",
      empty: "Aucune connexion",
      total: { one: "{{count}} connexion", other: "{{count}} connexions" },
      connected: { one: "{{count}} connectée", other: "{{count}} connectées" },
      waiting: { one: "{{count}} en attente", other: "{{count}} en attente" },
      disconnected: {
        one: "{{count}} déconnectée",
        other: "{{count}} déconnectées"
      }
    },
    email: {
      label: "E-mail",
      empty: "Aucun compte connecté",
      accounts: { one: "{{count}} compte", other: "{{count}} comptes" },
      attention: {
        one: "{{count}} demande votre attention",
        other: "{{count}} demandent votre attention"
      }
    }
  },
  table: {
    channel: "Canal",
    account: "Compte",
    default: "Par défaut du canal"
  },
  providers: {
    whatsapp: "WhatsApp",
    whatsappApi: "WhatsApp API",
    gmail: "Gmail",
    outlook: "Hotmail",
    icloud: "iCloud",
    custom: "E-mail personnalisé"
  },
  status: {
    active: { label: "Connecté", title: "Connexion établie !" },
    connecting: {
      label: "En attente",
      title: "En attente de la première synchronisation de la boîte"
    },
    invalidPassword: {
      label: "Mot de passe invalide",
      title: "Le mot de passe d'application a été révoqué ou a expiré"
    },
    authExpired: {
      label: "Autorisation expirée",
      title:
        "Reconnectez le compte Google pour continuer à recevoir des e-mails"
    },
    error: {
      label: "Erreur",
      title: "Échec de la synchronisation de la boîte mail"
    },
    disabled: {
      label: "Déconnecté",
      title: "Le compte a été déconnecté et n'est plus synchronisé"
    }
  },
  note: {
    imap: "IMAP/SMTP · {{host}}",
    metaCloudApi: "Meta Cloud API"
  },
  actions: {
    add: "Ajouter une connexion",
    syncNow: "Synchroniser maintenant",
    disconnect: "Déconnecter le compte",
    updateAppPassword: "Mettre à jour le mot de passe d'application",
    updatePassword: "Mettre à jour le mot de passe",
    reconnectGmail: "Reconnecter Gmail",
    edit: "Modifier la connexion"
  },
  confirm: {
    disconnectTitle: "Déconnecter le compte e-mail",
    disconnectMessage:
      "La boîte n'est plus synchronisée et les identifiants enregistrés sont supprimés. Les tickets existants restent dans le système."
  },
  toasts: {
    syncQueued: "Synchronisation lancée",
    disconnected: "Compte e-mail déconnecté",
    saved: "Connexion enregistrée",
    updated: "Connexion mise à jour",
    passwordUpdated: "Mot de passe mis à jour",
    testOk: "Connexion testée avec succès",
    gmailConnected: "Gmail connecté avec succès"
  },
  picker: {
    title: "Ajouter une connexion",
    subtitle: "Choisissez le canal que vous voulez traiter.",
    footer:
      "Chaque connexion apparaît dans les tickets avec l'icône du canal et le nom que vous lui donnez.",
    soon: "Bientôt",
    groups: {
      whatsapp: "WhatsApp",
      email: "E-mail"
    },
    options: {
      whatsappQr: {
        label: "WhatsApp (QR Code)",
        hint: "Scannez le QR Code avec le téléphone de l'entreprise"
      },
      whatsappApi: {
        label: "API officielle WhatsApp",
        hint: "Connectez-vous via la Meta Cloud API"
      },
      gmail: { label: "Gmail", hint: "Se connecter avec le compte Google" },
      outlook: {
        label: "Hotmail / Outlook",
        hint: "Se connecter avec le compte Microsoft"
      },
      icloud: {
        label: "iCloud",
        hint: "E-mail iCloud avec un mot de passe d'application"
      },
      custom: {
        label: "E-mail personnalisé",
        hint: "Domaine de l'entreprise via IMAP et SMTP"
      }
    }
  },
  form: {
    back: "Retour",
    close: "Fermer",
    cancel: "Annuler",
    test: "Tester la connexion",
    save: "Enregistrer la connexion",
    name: "Nom de la connexion",
    nameHelp: "Affiché dans les tickets à côté de l'icône du canal",
    queue: "File d'entrée",
    noQueue: "Aucune file",
    footer:
      "Vous pourrez modifier le nom et la file plus tard, dans Modifier la connexion.",
    required: "Obligatoire",
    invalidEmail: "E-mail invalide",
    invalidPort: "Port invalide",
    gmail: {
      title: "Gmail",
      subtitle: "Les e-mails de la boîte de réception deviennent des tickets.",
      namePlaceholder: "Commercial",
      howTitle: "Comment ça marche",
      step1: "Vous vous connectez avec le compte Google et autorisez l'accès.",
      step2:
        "Les nouveaux e-mails arrivent comme tickets dans la file choisie.",
      step3: "Les réponses partent depuis Gmail, avec votre signature.",
      button: "Continuer avec Google"
    },
    icloud: {
      title: "iCloud",
      subtitle: "Connectez une adresse @icloud.com, @me.com ou @mac.com.",
      namePlaceholder: "Direction",
      address: "E-mail iCloud",
      addressPlaceholder: "nom@icloud.com",
      password: "Mot de passe d'application",
      passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
      help: "N'utilisez pas le mot de passe de l'identifiant Apple. Créez un mot de passe d'application sur appleid.apple.com › Connexion et sécurité › Mots de passe pour app."
    },
    custom: {
      title: "E-mail personnalisé",
      subtitle: "Utilisez l'e-mail du domaine de votre entreprise.",
      namePlaceholder: "Contact",
      address: "E-mail",
      addressPlaceholder: "contact@votreentreprise.fr",
      password: "Mot de passe",
      passwordPlaceholder: "Mot de passe de la boîte mail",
      imapHost: "Serveur entrant (IMAP)",
      imapHostPlaceholder: "imap.votreentreprise.fr",
      smtpHost: "Serveur sortant (SMTP)",
      smtpHostPlaceholder: "smtp.votreentreprise.fr",
      port: "Port",
      secure: "Utiliser une connexion sécurisée (SSL/TLS)"
    },
    edit: {
      title: "Modifier la connexion",
      save: "Enregistrer"
    },
    password: {
      titleApp: "Mettre à jour le mot de passe d'application",
      titleMailbox: "Mettre à jour le mot de passe",
      subtitle:
        "{{address}} · le nouveau mot de passe est testé avant d'être enregistré.",
      save: "Enregistrer le mot de passe"
    }
  },
  errors: {
    generic: "L'opération n'a pas pu être effectuée.",
    ERR_EMAIL_CHANNEL_DISABLED:
      "Le canal e-mail n'est pas activé pour cette entreprise.",
    ERR_EMAIL_HOST_NOT_ALLOWED:
      "Ce serveur n'est pas autorisé. Utilisez l'adresse publique du serveur IMAP/SMTP.",
    ERR_EMAIL_PORT_NOT_ALLOWED:
      "Ce port n'est pas autorisé pour le serveur de messagerie.",
    ERR_EMAIL_CONNECTION_FAILED:
      "Impossible de se connecter au serveur de messagerie. Vérifiez le serveur, le port et l'option SSL/TLS.",
    ERR_EMAIL_AUTH:
      "E-mail ou mot de passe incorrect. Pour iCloud, utilisez un mot de passe d'application.",
    ERR_GMAIL_STATE:
      "L'autorisation Google a expiré ou n'est pas valide. Essayez de vous reconnecter.",
    ERR_GMAIL_NO_REFRESH_TOKEN:
      "Google n'a pas accordé d'accès permanent à la boîte. Retirez l'accès sur myaccount.google.com/permissions et reconnectez-vous.",
    ERR_GMAIL_SCOPES_MISSING:
      "Pour connecter Gmail, autorisez la lecture et l'envoi d'e-mails sur l'écran de Google."
  }
};

const frInbox = {
  filters: {
    label: "Canal",
    groupLabel: "Filtrer par canal",
    all: "Tous",
    whatsapp: "WhatsApp",
    email: "E-mail"
  },
  noSubject: "(sans objet)",
  thread: {
    count: { one: "{{count}} message", other: "{{count}} messages" },
    to: "à {{list}}",
    cc: "cc {{list}}",
    today: "Aujourd'hui",
    yesterday: "Hier",
    loading: "Chargement des e-mails…",
    loadError: "Impossible de charger les e-mails de ce ticket.",
    retry: "Réessayer",
    empty: "Aucun e-mail dans cette conversation pour l'instant.",
    frameTitle: "Contenu de l'e-mail de {{from}}",
    attachmentSkipped: "Pièce jointe non importée (trop volumineuse)",
    download: "Télécharger {{name}}",
    replyTo: "répondre à {{list}}",
    oversize:
      "Message trop volumineux pour être importé ; ouvrez-le dans la boîte mail d'origine."
  },
  status: {
    queued: "En file",
    sent: "Envoyé",
    failed: "Échec",
    failedWithReason: "Échec : {{reason}}",
    unknown: "Envoi non confirmé",
    partial: "Envoyé — certains destinataires ont été refusés",
    unknownHint:
      "Le serveur n'a pas confirmé l'envoi. Le message n'est pas renvoyé automatiquement et passe à envoyé dès que la copie apparaît dans la boîte."
  },
  composer: {
    modesLabel: "Type de réponse",
    reply: "Répondre",
    replyAll: "Répondre à tous",
    forward: "Transférer",
    from: "De",
    to: "À",
    cc: "Cc",
    subject: "Objet",
    body: "Corps de l'e-mail",
    placeholder: "Écrivez votre réponse",
    recipientsPlaceholder: "Séparez les adresses par des virgules",
    bold: "Gras",
    italic: "Italique",
    attach: "Joindre un fichier",
    removeAttachment: "Retirer {{name}}",
    send: "Envoyer l'e-mail",
    sending: "Envoi…",
    reauth:
      "L'autorisation de cette boîte a expiré. Reconnectez-la dans Connexions.",
    replyPrefix: "Re:",
    forwardPrefix: "Fwd:"
  },
  errors: {
    generic: "L'e-mail n'a pas pu être envoyé. Réessayez dans un instant."
  },
  contacts: {
    noPhone: "pas de téléphone"
  }
};

const frBackendErrors = {
  ERR_CONTACT_HAS_NO_PHONE:
    "Ce contact n'a pas de numéro de téléphone. Les tickets et rendez-vous WhatsApp ont besoin d'un numéro.",
  ERR_EMAIL_CHANNEL_DISABLED:
    "Le canal e-mail n'est pas activé pour cette entreprise.",
  ERR_EMAIL_ACCOUNT_UNAVAILABLE:
    "La boîte mail de ce ticket n'est pas disponible. Vérifiez la connexion dans Connexions.",
  ERR_EMAIL_RECIPIENT_REQUIRED: "Indiquez au moins un destinataire.",
  ERR_EMAIL_INVALID_RECIPIENT:
    "L'un des destinataires n'est pas une adresse e-mail valide.",
  ERR_EMAIL_TOO_MANY_RECIPIENTS:
    "Trop de destinataires. La limite est de 20 par e-mail.",
  ERR_EMAIL_ATTACHMENTS_TOO_LARGE:
    "Les pièces jointes dépassent la limite de 25 Mo.",
  ERR_EMAIL_ATTACHMENT_NOT_FOUND: "Pièce jointe introuvable.",
  ERR_EMAIL_BOUNCED: "Le serveur de destination a refusé la remise.",
  ERR_EMAIL_AUTH:
    "La boîte mail a refusé l'accès. Reconnectez le compte dans Connexions.",
  ERR_EMAIL_CONNECTION_FAILED:
    "Impossible de se connecter au serveur de messagerie.",
  ERR_EMAIL_AUTH_FAILED:
    "L'autorisation de cette boîte a expiré. Reconnectez-la dans Connexions.",
  ERR_EMAIL_CREDENTIALS_MISSING:
    "Cette boîte n'a pas d'identifiants enregistrés. Reconnectez-la dans Connexions.",
  ERR_EMAIL_TRANSIENT:
    "Le serveur de messagerie n'a pas répondu après plusieurs tentatives. Réessayez d'envoyer.",
  ERR_EMAIL_SEND_AMBIGUOUS:
    "Le serveur n'a pas confirmé l'envoi. Vérifiez la boîte avant de renvoyer.",
  ERR_EMAIL_ATTACHMENT_MISSING:
    "Une pièce jointe n'est plus disponible. Joignez à nouveau le fichier et renvoyez.",
  ERR_EMAIL_INVALID_MESSAGE:
    "Le message n'a pas pu être envoyé : vérifiez les destinataires et les pièces jointes.",
  ERR_EMAIL_REJECTED: "Le serveur de messagerie a refusé le message.",
  ERR_EMAIL_PARTIAL_REJECTION:
    "L'e-mail a été envoyé, mais le serveur a refusé certains destinataires.",
  ERR_EMAIL_PROVIDER_NOT_SUPPORTED:
    "Ce type de boîte mail n'est pas encore pris en charge.",
  ERR_EMAIL_HOST_NOT_ALLOWED:
    "Ce serveur de messagerie n'est pas autorisé. Utilisez l'adresse publique du serveur.",
  ERR_EMAIL_PORT_NOT_ALLOWED:
    "Ce port n'est pas autorisé pour le serveur de messagerie.",
  ERR_GMAIL_SEND_400: "Gmail a refusé le message.",
  ERR_GMAIL_SEND_403:
    "Gmail a refusé l'envoi (autorisation manquante ou quota atteint). Vérifiez la connexion ou réessayez plus tard.",
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
};

const frMessages = {
  emailChannel: {
    companies: {
      enabled: "Canal e-mail",
      on: "Activé",
      off: "Désactivé"
    },
    connections: frConnections,
    inbox: frInbox
  },
  backendErrors: frBackendErrors
};

const deConnections = {
  filters: {
    label: "Nach Kanal filtern",
    all: "Alle",
    whatsapp: "WhatsApp",
    email: "E-Mail"
  },
  search: {
    placeholder: "Verbindung suchen"
  },
  summary: {
    whatsapp: {
      label: "WhatsApp",
      empty: "Keine Verbindungen",
      total: { one: "{{count}} Verbindung", other: "{{count}} Verbindungen" },
      connected: { one: "{{count}} verbunden", other: "{{count}} verbunden" },
      waiting: { one: "{{count}} wartend", other: "{{count}} wartend" },
      disconnected: {
        one: "{{count}} getrennt",
        other: "{{count}} getrennt"
      }
    },
    email: {
      label: "E-Mail",
      empty: "Keine Konten verbunden",
      accounts: { one: "{{count}} Konto", other: "{{count}} Konten" },
      attention: {
        one: "{{count}} benötigt Aufmerksamkeit",
        other: "{{count}} benötigen Aufmerksamkeit"
      }
    }
  },
  table: {
    channel: "Kanal",
    account: "Konto",
    default: "Kanalstandard"
  },
  providers: {
    whatsapp: "WhatsApp",
    whatsappApi: "WhatsApp API",
    gmail: "Gmail",
    outlook: "Hotmail",
    icloud: "iCloud",
    custom: "Eigene E-Mail"
  },
  status: {
    active: { label: "Verbunden", title: "Verbindung hergestellt!" },
    connecting: {
      label: "Wartend",
      title: "Warten auf die erste Synchronisierung des Postfachs"
    },
    invalidPassword: {
      label: "Ungültiges Passwort",
      title: "Das App-Passwort wurde widerrufen oder ist abgelaufen"
    },
    authExpired: {
      label: "Autorisierung abgelaufen",
      title:
        "Verbinden Sie das Google-Konto erneut, um weiterhin E-Mails zu empfangen"
    },
    error: {
      label: "Fehler",
      title: "Das Postfach konnte nicht synchronisiert werden"
    },
    disabled: {
      label: "Getrennt",
      title: "Das Konto wurde getrennt und wird nicht synchronisiert"
    }
  },
  note: {
    imap: "IMAP/SMTP · {{host}}",
    metaCloudApi: "Meta Cloud API"
  },
  actions: {
    add: "Verbindung hinzufügen",
    syncNow: "Jetzt synchronisieren",
    disconnect: "Konto trennen",
    updateAppPassword: "App-Passwort aktualisieren",
    updatePassword: "Passwort aktualisieren",
    reconnectGmail: "Gmail erneut verbinden",
    edit: "Verbindung bearbeiten"
  },
  confirm: {
    disconnectTitle: "E-Mail-Konto trennen",
    disconnectMessage:
      "Das Postfach wird nicht mehr synchronisiert und die gespeicherten Zugangsdaten werden gelöscht. Bestehende Tickets bleiben im System."
  },
  toasts: {
    syncQueued: "Synchronisierung gestartet",
    disconnected: "E-Mail-Konto getrennt",
    saved: "Verbindung gespeichert",
    updated: "Verbindung aktualisiert",
    passwordUpdated: "Passwort aktualisiert",
    testOk: "Verbindung erfolgreich getestet",
    gmailConnected: "Gmail erfolgreich verbunden"
  },
  picker: {
    title: "Verbindung hinzufügen",
    subtitle: "Wählen Sie den Kanal, den Sie bedienen möchten.",
    footer:
      "Jede Verbindung erscheint in den Tickets mit dem Kanalsymbol und dem Namen, den Sie ihr geben.",
    soon: "Demnächst",
    groups: {
      whatsapp: "WhatsApp",
      email: "E-Mail"
    },
    options: {
      whatsappQr: {
        label: "WhatsApp (QR-Code)",
        hint: "Scannen Sie den QR-Code mit dem Firmenhandy"
      },
      whatsappApi: {
        label: "Offizielle WhatsApp API",
        hint: "Über die Meta Cloud API verbinden"
      },
      gmail: { label: "Gmail", hint: "Mit dem Google-Konto anmelden" },
      outlook: {
        label: "Hotmail / Outlook",
        hint: "Mit dem Microsoft-Konto anmelden"
      },
      icloud: { label: "iCloud", hint: "iCloud-E-Mail mit App-Passwort" },
      custom: {
        label: "Eigene E-Mail",
        hint: "Firmendomain über IMAP und SMTP"
      }
    }
  },
  form: {
    back: "Zurück",
    close: "Schließen",
    cancel: "Abbrechen",
    test: "Verbindung testen",
    save: "Verbindung speichern",
    name: "Name der Verbindung",
    nameHelp: "Wird in den Tickets neben dem Kanalsymbol angezeigt",
    queue: "Eingangswarteschlange",
    noQueue: "Keine Warteschlange",
    footer:
      "Name und Warteschlange können Sie später unter Verbindung bearbeiten ändern.",
    required: "Pflichtfeld",
    invalidEmail: "Ungültige E-Mail",
    invalidPort: "Ungültiger Port",
    gmail: {
      title: "Gmail",
      subtitle: "E-Mails im Posteingang werden zu Tickets.",
      namePlaceholder: "Vertrieb",
      howTitle: "So funktioniert es",
      step1:
        "Sie melden sich mit dem Google-Konto an und erlauben den Zugriff.",
      step2:
        "Neue E-Mails kommen als Tickets in der gewählten Warteschlange an.",
      step3: "Antworten werden über Gmail selbst gesendet, mit Ihrer Signatur.",
      button: "Weiter mit Google"
    },
    icloud: {
      title: "iCloud",
      subtitle:
        "Verbinden Sie eine @icloud.com-, @me.com- oder @mac.com-Adresse.",
      namePlaceholder: "Geschäftsleitung",
      address: "iCloud-E-Mail",
      addressPlaceholder: "name@icloud.com",
      password: "App-Passwort",
      passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
      help: "Verwenden Sie nicht das Passwort der Apple-ID. Erstellen Sie ein App-Passwort unter appleid.apple.com › Anmeldung und Sicherheit › App-spezifische Passwörter."
    },
    custom: {
      title: "Eigene E-Mail",
      subtitle: "Verwenden Sie die E-Mail-Adresse Ihrer Firmendomain.",
      namePlaceholder: "Kontakt",
      address: "E-Mail",
      addressPlaceholder: "kontakt@ihrefirma.de",
      password: "Passwort",
      passwordPlaceholder: "Passwort des Postfachs",
      imapHost: "Posteingangsserver (IMAP)",
      imapHostPlaceholder: "imap.ihrefirma.de",
      smtpHost: "Postausgangsserver (SMTP)",
      smtpHostPlaceholder: "smtp.ihrefirma.de",
      port: "Port",
      secure: "Sichere Verbindung verwenden (SSL/TLS)"
    },
    edit: {
      title: "Verbindung bearbeiten",
      save: "Speichern"
    },
    password: {
      titleApp: "App-Passwort aktualisieren",
      titleMailbox: "Passwort aktualisieren",
      subtitle:
        "{{address}} · das neue Passwort wird vor dem Speichern getestet.",
      save: "Passwort speichern"
    }
  },
  errors: {
    generic: "Der Vorgang konnte nicht abgeschlossen werden.",
    ERR_EMAIL_CHANNEL_DISABLED:
      "Der E-Mail-Kanal ist für dieses Unternehmen nicht aktiviert.",
    ERR_EMAIL_HOST_NOT_ALLOWED:
      "Dieser Server ist nicht erlaubt. Verwenden Sie die öffentliche Adresse des IMAP/SMTP-Servers.",
    ERR_EMAIL_PORT_NOT_ALLOWED:
      "Dieser Port ist für den Mailserver nicht erlaubt.",
    ERR_EMAIL_CONNECTION_FAILED:
      "Keine Verbindung zum Mailserver möglich. Prüfen Sie Server, Port und die SSL/TLS-Option.",
    ERR_EMAIL_AUTH:
      "E-Mail oder Passwort falsch. Verwenden Sie bei iCloud ein App-Passwort.",
    ERR_GMAIL_STATE:
      "Die Google-Autorisierung ist abgelaufen oder ungültig. Versuchen Sie erneut, die Verbindung herzustellen.",
    ERR_GMAIL_NO_REFRESH_TOKEN:
      "Google hat keinen dauerhaften Zugriff auf das Postfach gewährt. Entfernen Sie den Zugriff unter myaccount.google.com/permissions und verbinden Sie erneut.",
    ERR_GMAIL_SCOPES_MISSING:
      "Um Gmail zu verbinden, erlauben Sie auf dem Google-Bildschirm das Lesen und Senden von E-Mails."
  }
};

const deInbox = {
  filters: {
    label: "Kanal",
    groupLabel: "Nach Kanal filtern",
    all: "Alle",
    whatsapp: "WhatsApp",
    email: "E-Mail"
  },
  noSubject: "(kein Betreff)",
  thread: {
    count: { one: "{{count}} Nachricht", other: "{{count}} Nachrichten" },
    to: "an {{list}}",
    cc: "cc {{list}}",
    today: "Heute",
    yesterday: "Gestern",
    loading: "E-Mails werden geladen…",
    loadError: "Die E-Mails dieses Tickets konnten nicht geladen werden.",
    retry: "Erneut versuchen",
    empty: "Noch keine E-Mails in dieser Unterhaltung.",
    frameTitle: "E-Mail-Inhalt von {{from}}",
    attachmentSkipped: "Anhang nicht importiert (zu groß)",
    download: "{{name}} herunterladen",
    replyTo: "Antwort an {{list}}",
    oversize:
      "Nachricht zu groß für den Import; öffnen Sie sie im ursprünglichen Postfach."
  },
  status: {
    queued: "In der Warteschlange",
    sent: "Gesendet",
    failed: "Fehlgeschlagen",
    failedWithReason: "Fehlgeschlagen: {{reason}}",
    unknown: "Versand nicht bestätigt",
    partial: "Gesendet — einige Empfänger wurden abgelehnt",
    unknownHint:
      "Der Server hat den Versand nicht bestätigt. Die Nachricht wird nicht automatisch erneut gesendet und gilt als gesendet, sobald die Kopie im Postfach erscheint."
  },
  composer: {
    modesLabel: "Antwortart",
    reply: "Antworten",
    replyAll: "Allen antworten",
    forward: "Weiterleiten",
    from: "Von",
    to: "An",
    cc: "Cc",
    subject: "Betreff",
    body: "E-Mail-Text",
    placeholder: "Schreiben Sie Ihre Antwort",
    recipientsPlaceholder: "Adressen durch Kommas trennen",
    bold: "Fett",
    italic: "Kursiv",
    attach: "Datei anhängen",
    removeAttachment: "{{name}} entfernen",
    send: "E-Mail senden",
    sending: "Wird gesendet…",
    reauth:
      "Die Autorisierung dieses Postfachs ist abgelaufen. Verbinden Sie es unter Verbindungen erneut.",
    replyPrefix: "AW:",
    forwardPrefix: "WG:"
  },
  errors: {
    generic:
      "Die E-Mail konnte nicht gesendet werden. Versuchen Sie es gleich noch einmal."
  },
  contacts: {
    noPhone: "keine Telefonnummer"
  }
};

const deBackendErrors = {
  ERR_CONTACT_HAS_NO_PHONE:
    "Dieser Kontakt hat keine Telefonnummer. WhatsApp-Tickets und -Termine benötigen eine Nummer.",
  ERR_EMAIL_CHANNEL_DISABLED:
    "Der E-Mail-Kanal ist für dieses Unternehmen nicht aktiviert.",
  ERR_EMAIL_ACCOUNT_UNAVAILABLE:
    "Das Postfach dieses Tickets ist nicht verfügbar. Prüfen Sie die Verbindung unter Verbindungen.",
  ERR_EMAIL_RECIPIENT_REQUIRED: "Geben Sie mindestens einen Empfänger an.",
  ERR_EMAIL_INVALID_RECIPIENT:
    "Einer der Empfänger ist keine gültige E-Mail-Adresse.",
  ERR_EMAIL_TOO_MANY_RECIPIENTS:
    "Zu viele Empfänger. Das Limit liegt bei 20 pro E-Mail.",
  ERR_EMAIL_ATTACHMENTS_TOO_LARGE:
    "Die Anhänge überschreiten das Limit von 25 MB.",
  ERR_EMAIL_ATTACHMENT_NOT_FOUND: "Anhang nicht gefunden.",
  ERR_EMAIL_BOUNCED: "Der Zielserver hat die Zustellung abgelehnt.",
  ERR_EMAIL_AUTH:
    "Das Postfach hat den Zugriff verweigert. Verbinden Sie das Konto unter Verbindungen erneut.",
  ERR_EMAIL_CONNECTION_FAILED: "Keine Verbindung zum Mailserver möglich.",
  ERR_EMAIL_AUTH_FAILED:
    "Die Autorisierung dieses Postfachs ist abgelaufen. Verbinden Sie es unter Verbindungen erneut.",
  ERR_EMAIL_CREDENTIALS_MISSING:
    "Für dieses Postfach sind keine Zugangsdaten gespeichert. Verbinden Sie es unter Verbindungen erneut.",
  ERR_EMAIL_TRANSIENT:
    "Der Mailserver hat nach mehreren Versuchen nicht geantwortet. Versuchen Sie es erneut.",
  ERR_EMAIL_SEND_AMBIGUOUS:
    "Der Server hat den Versand nicht bestätigt. Prüfen Sie das Postfach, bevor Sie erneut senden.",
  ERR_EMAIL_ATTACHMENT_MISSING:
    "Ein Anhang ist nicht mehr verfügbar. Hängen Sie die Datei erneut an und senden Sie noch einmal.",
  ERR_EMAIL_INVALID_MESSAGE:
    "Die Nachricht konnte nicht gesendet werden: Prüfen Sie Empfänger und Anhänge.",
  ERR_EMAIL_REJECTED: "Der Mailserver hat die Nachricht abgelehnt.",
  ERR_EMAIL_PARTIAL_REJECTION:
    "Die E-Mail wurde gesendet, aber der Server hat einige Empfänger abgelehnt.",
  ERR_EMAIL_PROVIDER_NOT_SUPPORTED:
    "Diese Art von Postfach wird noch nicht unterstützt.",
  ERR_EMAIL_HOST_NOT_ALLOWED:
    "Dieser Mailserver ist nicht erlaubt. Verwenden Sie die öffentliche Adresse des Servers.",
  ERR_EMAIL_PORT_NOT_ALLOWED:
    "Dieser Port ist für den Mailserver nicht erlaubt.",
  ERR_GMAIL_SEND_400: "Gmail hat die Nachricht abgelehnt.",
  ERR_GMAIL_SEND_403:
    "Gmail hat den Versand abgelehnt (fehlende Berechtigung oder Kontingent erreicht). Prüfen Sie die Verbindung oder versuchen Sie es später erneut.",
  ERR_EMAIL_MESSAGE_SKIPPED:
    "Eine E-Mail konnte nicht importiert werden und wurde übersprungen. Die übrigen kommen weiterhin normal an.",
  ERR_EMAIL_ACCOUNT_NOT_FOUND: "E-Mail-Konto nicht gefunden.",
  ERR_EMAIL_ACCOUNT_EXISTS: "Dieses Postfach ist bereits verbunden.",
  ERR_EMAIL_INVALID_ACCOUNT:
    "Die Daten des E-Mail-Kontos sind ungültig. Prüfen Sie die Felder und versuchen Sie es erneut.",
  ERR_EMAIL_SEND_FAILED: "Die E-Mail konnte nicht gesendet werden.",
  ERR_INVALID_CHANNEL: "Ungültiger Kanal für diesen Vorgang.",
  ERR_EMAIL_EMPTY_MESSAGE:
    "Schreiben Sie eine Nachricht oder hängen Sie eine Datei an, bevor Sie senden.",
  ERR_EMAIL_INVALID_MODE: "Ungültige Antwortart.",
  ERR_EMAIL_INVALID_TICKET: "Dieses Ticket ist kein E-Mail-Ticket.",
  ERR_EMAIL_INVALID_IDEMPOTENCY_KEY:
    "Dieser Versand konnte nicht zugeordnet werden. Laden Sie die Seite neu und versuchen Sie es erneut.",
  ERR_EMAIL_IDEMPOTENCY_CONFLICT:
    "Dieser Versand steht im Konflikt mit einem bereits erfassten. Laden Sie die Seite neu und versuchen Sie es erneut.",
  ERR_EMAIL_SYNC_ENQUEUE_FAILED:
    "Die Synchronisierung konnte gerade nicht gestartet werden. Versuchen Sie es gleich noch einmal.",
  ERR_EMAIL_SYNC_FAILED:
    "Das Postfach konnte nicht synchronisiert werden. Es wird automatisch erneut versucht.",
  ERR_GMAIL_OAUTH_FAILED:
    "Die Verbindung mit Google konnte nicht abgeschlossen werden. Versuchen Sie es erneut.",
  ERR_GMAIL_NOT_CONFIGURED:
    "Die Gmail-Verbindung ist auf diesem Server nicht eingerichtet. Wenden Sie sich an den Systemadministrator.",
  ERR_GMAIL_ACCOUNT_MISMATCH:
    "Das gewählte Google-Konto gehört nicht zu der Verbindung, die Sie neu verbinden. Melden Sie sich mit demselben Konto an."
};

const deMessages = {
  emailChannel: {
    companies: {
      enabled: "E-Mail-Kanal",
      on: "Aktiviert",
      off: "Deaktiviert"
    },
    connections: deConnections,
    inbox: deInbox
  },
  backendErrors: deBackendErrors
};

const itConnections = {
  filters: {
    label: "Filtra per canale",
    all: "Tutte",
    whatsapp: "WhatsApp",
    email: "Email"
  },
  search: {
    placeholder: "Cerca connessione"
  },
  summary: {
    whatsapp: {
      label: "WhatsApp",
      empty: "Nessuna connessione",
      total: { one: "{{count}} connessione", other: "{{count}} connessioni" },
      connected: { one: "{{count}} connessa", other: "{{count}} connesse" },
      waiting: { one: "{{count}} in attesa", other: "{{count}} in attesa" },
      disconnected: {
        one: "{{count}} disconnessa",
        other: "{{count}} disconnesse"
      }
    },
    email: {
      label: "Email",
      empty: "Nessun account collegato",
      accounts: { one: "{{count}} account", other: "{{count}} account" },
      attention: {
        one: "{{count}} richiede attenzione",
        other: "{{count}} richiedono attenzione"
      }
    }
  },
  table: {
    channel: "Canale",
    account: "Account",
    default: "Predefinita del canale"
  },
  providers: {
    whatsapp: "WhatsApp",
    whatsappApi: "WhatsApp API",
    gmail: "Gmail",
    outlook: "Hotmail",
    icloud: "iCloud",
    custom: "Email personalizzata"
  },
  status: {
    active: { label: "Connesso", title: "Connessione stabilita!" },
    connecting: {
      label: "In attesa",
      title: "In attesa della prima sincronizzazione della casella"
    },
    invalidPassword: {
      label: "Password non valida",
      title: "La password per le app è stata revocata o è scaduta"
    },
    authExpired: {
      label: "Autorizzazione scaduta",
      title: "Ricollega l'account Google per continuare a ricevere email"
    },
    error: {
      label: "Errore",
      title: "Sincronizzazione della casella di posta non riuscita"
    },
    disabled: {
      label: "Disconnesso",
      title: "L'account è stato disconnesso e non viene sincronizzato"
    }
  },
  note: {
    imap: "IMAP/SMTP · {{host}}",
    metaCloudApi: "Meta Cloud API"
  },
  actions: {
    add: "Aggiungi connessione",
    syncNow: "Sincronizza ora",
    disconnect: "Disconnetti account",
    updateAppPassword: "Aggiorna password per le app",
    updatePassword: "Aggiorna password",
    reconnectGmail: "Ricollega Gmail",
    edit: "Modifica connessione"
  },
  confirm: {
    disconnectTitle: "Disconnetti account email",
    disconnectMessage:
      "La casella non viene più sincronizzata e le credenziali salvate vengono eliminate. I ticket esistenti restano nel sistema."
  },
  toasts: {
    syncQueued: "Sincronizzazione avviata",
    disconnected: "Account email disconnesso",
    saved: "Connessione salvata",
    updated: "Connessione aggiornata",
    passwordUpdated: "Password aggiornata",
    testOk: "Connessione verificata con successo",
    gmailConnected: "Gmail collegato con successo"
  },
  picker: {
    title: "Aggiungi connessione",
    subtitle: "Scegli il canale che vuoi gestire.",
    footer:
      "Ogni connessione appare nei ticket con l'icona del canale e il nome che le dai.",
    soon: "Prossimamente",
    groups: {
      whatsapp: "WhatsApp",
      email: "Email"
    },
    options: {
      whatsappQr: {
        label: "WhatsApp (QR Code)",
        hint: "Scansiona il QR Code con il telefono aziendale"
      },
      whatsappApi: {
        label: "API ufficiale WhatsApp",
        hint: "Collegati tramite la Meta Cloud API"
      },
      gmail: { label: "Gmail", hint: "Accedi con l'account Google" },
      outlook: {
        label: "Hotmail / Outlook",
        hint: "Accedi con l'account Microsoft"
      },
      icloud: { label: "iCloud", hint: "Email iCloud con password per le app" },
      custom: {
        label: "Email personalizzata",
        hint: "Dominio aziendale tramite IMAP e SMTP"
      }
    }
  },
  form: {
    back: "Indietro",
    close: "Chiudi",
    cancel: "Annulla",
    test: "Verifica connessione",
    save: "Salva connessione",
    name: "Nome della connessione",
    nameHelp: "Appare nei ticket accanto all'icona del canale",
    queue: "Coda di ingresso",
    noQueue: "Nessuna coda",
    footer:
      "Puoi modificare il nome e la coda in seguito, in Modifica connessione.",
    required: "Obbligatorio",
    invalidEmail: "Email non valida",
    invalidPort: "Porta non valida",
    gmail: {
      title: "Gmail",
      subtitle: "Le email della posta in arrivo diventano ticket.",
      namePlaceholder: "Commerciale",
      howTitle: "Come funziona",
      step1: "Accedi con l'account Google e autorizzi l'accesso.",
      step2: "Le nuove email arrivano come ticket nella coda scelta.",
      step3: "Le risposte partono da Gmail stesso, con la tua firma.",
      button: "Continua con Google"
    },
    icloud: {
      title: "iCloud",
      subtitle: "Collega un indirizzo @icloud.com, @me.com o @mac.com.",
      namePlaceholder: "Direzione",
      address: "Email iCloud",
      addressPlaceholder: "nome@icloud.com",
      password: "Password per le app",
      passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
      help: "Non usare la password dell'ID Apple. Genera una password per le app su appleid.apple.com › Accesso e sicurezza › Password specifiche per le app."
    },
    custom: {
      title: "Email personalizzata",
      subtitle: "Usa l'email del dominio della tua azienda.",
      namePlaceholder: "Contatti",
      address: "Email",
      addressPlaceholder: "contatti@tuaazienda.it",
      password: "Password",
      passwordPlaceholder: "Password della casella di posta",
      imapHost: "Server in entrata (IMAP)",
      imapHostPlaceholder: "imap.tuaazienda.it",
      smtpHost: "Server in uscita (SMTP)",
      smtpHostPlaceholder: "smtp.tuaazienda.it",
      port: "Porta",
      secure: "Usa connessione sicura (SSL/TLS)"
    },
    edit: {
      title: "Modifica connessione",
      save: "Salva"
    },
    password: {
      titleApp: "Aggiorna password per le app",
      titleMailbox: "Aggiorna password",
      subtitle:
        "{{address}} · la nuova password viene verificata prima del salvataggio.",
      save: "Salva password"
    }
  },
  errors: {
    generic: "Non è stato possibile completare l'operazione.",
    ERR_EMAIL_CHANNEL_DISABLED:
      "Il canale email non è abilitato per questa azienda.",
    ERR_EMAIL_HOST_NOT_ALLOWED:
      "Questo server non è consentito. Usa l'indirizzo pubblico del server IMAP/SMTP.",
    ERR_EMAIL_PORT_NOT_ALLOWED:
      "Questa porta non è consentita per il server di posta.",
    ERR_EMAIL_CONNECTION_FAILED:
      "Impossibile connettersi al server di posta. Controlla il server, la porta e l'opzione SSL/TLS.",
    ERR_EMAIL_AUTH:
      "Email o password errate. Per iCloud, usa una password per le app.",
    ERR_GMAIL_STATE:
      "L'autorizzazione di Google è scaduta o non è valida. Prova a collegarti di nuovo.",
    ERR_GMAIL_NO_REFRESH_TOKEN:
      "Google non ha concesso l'accesso continuo alla casella. Rimuovi l'accesso su myaccount.google.com/permissions e collegati di nuovo.",
    ERR_GMAIL_SCOPES_MISSING:
      "Per collegare Gmail, autorizza la lettura e l'invio delle email nella schermata di Google."
  }
};

const itInbox = {
  filters: {
    label: "Canale",
    groupLabel: "Filtra per canale",
    all: "Tutti",
    whatsapp: "WhatsApp",
    email: "Email"
  },
  noSubject: "(nessun oggetto)",
  thread: {
    count: { one: "{{count}} messaggio", other: "{{count}} messaggi" },
    to: "a {{list}}",
    cc: "cc {{list}}",
    today: "Oggi",
    yesterday: "Ieri",
    loading: "Caricamento email…",
    loadError: "Impossibile caricare le email di questo ticket.",
    retry: "Riprova",
    empty: "Ancora nessuna email in questa conversazione.",
    frameTitle: "Contenuto dell'email di {{from}}",
    attachmentSkipped: "Allegato non importato (troppo grande)",
    download: "Scarica {{name}}",
    replyTo: "rispondi a {{list}}",
    oversize:
      "Messaggio troppo grande per essere importato; aprilo nella casella di posta originale."
  },
  status: {
    queued: "In coda",
    sent: "Inviato",
    failed: "Non riuscito",
    failedWithReason: "Non riuscito: {{reason}}",
    unknown: "Invio non confermato",
    partial: "Inviato — alcuni destinatari sono stati rifiutati",
    unknownHint:
      "Il server non ha confermato l'invio. Il messaggio non viene reinviato automaticamente e passa a inviato quando la copia compare nella casella."
  },
  composer: {
    modesLabel: "Tipo di risposta",
    reply: "Rispondi",
    replyAll: "Rispondi a tutti",
    forward: "Inoltra",
    from: "Da",
    to: "A",
    cc: "Cc",
    subject: "Oggetto",
    body: "Corpo dell'email",
    placeholder: "Scrivi la tua risposta",
    recipientsPlaceholder: "Separa gli indirizzi con virgole",
    bold: "Grassetto",
    italic: "Corsivo",
    attach: "Allega file",
    removeAttachment: "Rimuovi {{name}}",
    send: "Invia email",
    sending: "Invio in corso…",
    reauth:
      "L'autorizzazione di questa casella è scaduta. Ricollegala in Connessioni.",
    replyPrefix: "Re:",
    forwardPrefix: "Fwd:"
  },
  errors: {
    generic: "Non è stato possibile inviare l'email. Riprova tra poco."
  },
  contacts: {
    noPhone: "nessun telefono"
  }
};

const itBackendErrors = {
  ERR_CONTACT_HAS_NO_PHONE:
    "Questo contatto non ha un numero di telefono. I ticket e le pianificazioni WhatsApp richiedono un numero.",
  ERR_EMAIL_CHANNEL_DISABLED:
    "Il canale email non è abilitato per questa azienda.",
  ERR_EMAIL_ACCOUNT_UNAVAILABLE:
    "La casella di posta di questo ticket non è disponibile. Controlla la connessione in Connessioni.",
  ERR_EMAIL_RECIPIENT_REQUIRED: "Inserisci almeno un destinatario.",
  ERR_EMAIL_INVALID_RECIPIENT:
    "Uno dei destinatari non è un indirizzo email valido.",
  ERR_EMAIL_TOO_MANY_RECIPIENTS:
    "Troppi destinatari. Il limite è di 20 per email.",
  ERR_EMAIL_ATTACHMENTS_TOO_LARGE: "Gli allegati superano il limite di 25 MB.",
  ERR_EMAIL_ATTACHMENT_NOT_FOUND: "Allegato non trovato.",
  ERR_EMAIL_BOUNCED: "Il server di destinazione ha rifiutato la consegna.",
  ERR_EMAIL_AUTH:
    "La casella ha rifiutato l'accesso. Ricollega l'account in Connessioni.",
  ERR_EMAIL_CONNECTION_FAILED: "Impossibile connettersi al server di posta.",
  ERR_EMAIL_AUTH_FAILED:
    "L'autorizzazione di questa casella è scaduta. Ricollegala in Connessioni.",
  ERR_EMAIL_CREDENTIALS_MISSING:
    "Questa casella non ha credenziali salvate. Ricollegala in Connessioni.",
  ERR_EMAIL_TRANSIENT:
    "Il server di posta non ha risposto dopo diversi tentativi. Prova a inviare di nuovo.",
  ERR_EMAIL_SEND_AMBIGUOUS:
    "Il server non ha confermato l'invio. Controlla la casella prima di reinviare.",
  ERR_EMAIL_ATTACHMENT_MISSING:
    "Un allegato non è più disponibile. Allega di nuovo il file e reinvia.",
  ERR_EMAIL_INVALID_MESSAGE:
    "Il messaggio non può essere inviato: controlla i destinatari e gli allegati.",
  ERR_EMAIL_REJECTED: "Il server di posta ha rifiutato il messaggio.",
  ERR_EMAIL_PARTIAL_REJECTION:
    "L'email è stata inviata, ma il server ha rifiutato alcuni destinatari.",
  ERR_EMAIL_PROVIDER_NOT_SUPPORTED:
    "Questo tipo di casella non è ancora supportato.",
  ERR_EMAIL_HOST_NOT_ALLOWED:
    "Questo server di posta non è consentito. Usa l'indirizzo pubblico del server.",
  ERR_EMAIL_PORT_NOT_ALLOWED:
    "Questa porta non è consentita per il server di posta.",
  ERR_GMAIL_SEND_400: "Gmail ha rifiutato il messaggio.",
  ERR_GMAIL_SEND_403:
    "Gmail ha rifiutato l'invio (permesso mancante o quota raggiunta). Controlla la connessione o riprova più tardi.",
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
};

const itMessages = {
  emailChannel: {
    companies: {
      enabled: "Canale email",
      on: "Abilitato",
      off: "Disabilitato"
    },
    connections: itConnections,
    inbox: itInbox
  },
  backendErrors: itBackendErrors
};

const idConnections = {
  filters: {
    label: "Filter menurut kanal",
    all: "Semua",
    whatsapp: "WhatsApp",
    email: "Email"
  },
  search: {
    placeholder: "Cari koneksi"
  },
  summary: {
    whatsapp: {
      label: "WhatsApp",
      empty: "Tidak ada koneksi",
      total: { one: "{{count}} koneksi", other: "{{count}} koneksi" },
      connected: { one: "{{count}} terhubung", other: "{{count}} terhubung" },
      waiting: { one: "{{count}} menunggu", other: "{{count}} menunggu" },
      disconnected: {
        one: "{{count}} terputus",
        other: "{{count}} terputus"
      }
    },
    email: {
      label: "Email",
      empty: "Belum ada akun terhubung",
      accounts: { one: "{{count}} akun", other: "{{count}} akun" },
      attention: {
        one: "{{count}} perlu perhatian",
        other: "{{count}} perlu perhatian"
      }
    }
  },
  table: {
    channel: "Kanal",
    account: "Akun",
    default: "Bawaan kanal"
  },
  providers: {
    whatsapp: "WhatsApp",
    whatsappApi: "WhatsApp API",
    gmail: "Gmail",
    outlook: "Hotmail",
    icloud: "iCloud",
    custom: "Email sendiri"
  },
  status: {
    active: { label: "Terhubung", title: "Koneksi berhasil dibuat!" },
    connecting: {
      label: "Menunggu",
      title: "Menunggu sinkronisasi pertama kotak surat"
    },
    invalidPassword: {
      label: "Kata sandi tidak valid",
      title: "Kata sandi aplikasi telah dicabut atau kedaluwarsa"
    },
    authExpired: {
      label: "Otorisasi kedaluwarsa",
      title: "Hubungkan ulang akun Google agar tetap menerima email"
    },
    error: { label: "Galat", title: "Gagal menyinkronkan kotak surat" },
    disabled: {
      label: "Terputus",
      title: "Akun telah diputus dan tidak disinkronkan"
    }
  },
  note: {
    imap: "IMAP/SMTP · {{host}}",
    metaCloudApi: "Meta Cloud API"
  },
  actions: {
    add: "Tambah koneksi",
    syncNow: "Sinkronkan sekarang",
    disconnect: "Putuskan akun",
    updateAppPassword: "Perbarui kata sandi aplikasi",
    updatePassword: "Perbarui kata sandi",
    reconnectGmail: "Hubungkan ulang Gmail",
    edit: "Edit koneksi"
  },
  confirm: {
    disconnectTitle: "Putuskan akun email",
    disconnectMessage:
      "Kotak surat berhenti disinkronkan dan kredensial yang tersimpan dihapus. Tiket yang sudah ada tetap di sistem."
  },
  toasts: {
    syncQueued: "Sinkronisasi dimulai",
    disconnected: "Akun email diputus",
    saved: "Koneksi disimpan",
    updated: "Koneksi diperbarui",
    passwordUpdated: "Kata sandi diperbarui",
    testOk: "Koneksi berhasil diuji",
    gmailConnected: "Gmail berhasil terhubung"
  },
  picker: {
    title: "Tambah koneksi",
    subtitle: "Pilih kanal yang ingin Anda layani.",
    footer:
      "Setiap koneksi muncul di tiket dengan ikon kanal dan nama yang Anda berikan.",
    soon: "Segera hadir",
    groups: {
      whatsapp: "WhatsApp",
      email: "Email"
    },
    options: {
      whatsappQr: {
        label: "WhatsApp (Kode QR)",
        hint: "Pindai Kode QR dengan ponsel perusahaan"
      },
      whatsappApi: {
        label: "WhatsApp API Resmi",
        hint: "Hubungkan melalui Meta Cloud API"
      },
      gmail: { label: "Gmail", hint: "Masuk dengan akun Google" },
      outlook: {
        label: "Hotmail / Outlook",
        hint: "Masuk dengan akun Microsoft"
      },
      icloud: {
        label: "iCloud",
        hint: "Email iCloud dengan kata sandi aplikasi"
      },
      custom: {
        label: "Email sendiri",
        hint: "Domain perusahaan melalui IMAP dan SMTP"
      }
    }
  },
  form: {
    back: "Kembali",
    close: "Tutup",
    cancel: "Batal",
    test: "Uji koneksi",
    save: "Simpan koneksi",
    name: "Nama koneksi",
    nameHelp: "Ditampilkan di tiket di samping ikon kanal",
    queue: "Antrean masuk",
    noQueue: "Tanpa antrean",
    footer: "Anda dapat mengubah nama dan antrean nanti, di Edit koneksi.",
    required: "Wajib diisi",
    invalidEmail: "Email tidak valid",
    invalidPort: "Port tidak valid",
    gmail: {
      title: "Gmail",
      subtitle: "Email di kotak masuk menjadi tiket.",
      namePlaceholder: "Penjualan",
      howTitle: "Cara kerjanya",
      step1: "Anda masuk dengan akun Google dan memberikan izin akses.",
      step2: "Email baru masuk sebagai tiket di antrean yang dipilih.",
      step3: "Balasan dikirim melalui Gmail sendiri, dengan tanda tangan Anda.",
      button: "Lanjutkan dengan Google"
    },
    icloud: {
      title: "iCloud",
      subtitle: "Hubungkan alamat @icloud.com, @me.com, atau @mac.com.",
      namePlaceholder: "Direksi",
      address: "Email iCloud",
      addressPlaceholder: "nama@icloud.com",
      password: "Kata sandi aplikasi",
      passwordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
      help: "Jangan gunakan kata sandi Apple ID. Buat kata sandi aplikasi di appleid.apple.com › Masuk dan Keamanan › Kata Sandi Khusus App."
    },
    custom: {
      title: "Email sendiri",
      subtitle: "Gunakan email domain perusahaan Anda.",
      namePlaceholder: "Kontak",
      address: "Email",
      addressPlaceholder: "kontak@perusahaananda.co.id",
      password: "Kata sandi",
      passwordPlaceholder: "Kata sandi kotak surat",
      imapHost: "Server masuk (IMAP)",
      imapHostPlaceholder: "imap.perusahaananda.co.id",
      smtpHost: "Server keluar (SMTP)",
      smtpHostPlaceholder: "smtp.perusahaananda.co.id",
      port: "Port",
      secure: "Gunakan koneksi aman (SSL/TLS)"
    },
    edit: {
      title: "Edit koneksi",
      save: "Simpan"
    },
    password: {
      titleApp: "Perbarui kata sandi aplikasi",
      titleMailbox: "Perbarui kata sandi",
      subtitle: "{{address}} · kata sandi baru diuji sebelum disimpan.",
      save: "Simpan kata sandi"
    }
  },
  errors: {
    generic: "Operasi tidak dapat diselesaikan.",
    ERR_EMAIL_CHANNEL_DISABLED:
      "Kanal email tidak diaktifkan untuk perusahaan ini.",
    ERR_EMAIL_HOST_NOT_ALLOWED:
      "Server ini tidak diizinkan. Gunakan alamat publik server IMAP/SMTP.",
    ERR_EMAIL_PORT_NOT_ALLOWED: "Port ini tidak diizinkan untuk server email.",
    ERR_EMAIL_CONNECTION_FAILED:
      "Tidak dapat terhubung ke server email. Periksa server, port, dan opsi SSL/TLS.",
    ERR_EMAIL_AUTH:
      "Email atau kata sandi salah. Untuk iCloud, gunakan kata sandi aplikasi.",
    ERR_GMAIL_STATE:
      "Otorisasi Google kedaluwarsa atau tidak valid. Coba hubungkan lagi.",
    ERR_GMAIL_NO_REFRESH_TOKEN:
      "Google tidak memberikan akses berkelanjutan ke kotak surat. Hapus akses di myaccount.google.com/permissions lalu hubungkan lagi.",
    ERR_GMAIL_SCOPES_MISSING:
      "Untuk menghubungkan Gmail, izinkan membaca dan mengirim email di layar Google."
  }
};

const idInbox = {
  filters: {
    label: "Kanal",
    groupLabel: "Filter menurut kanal",
    all: "Semua",
    whatsapp: "WhatsApp",
    email: "Email"
  },
  noSubject: "(tanpa subjek)",
  thread: {
    count: { one: "{{count}} pesan", other: "{{count}} pesan" },
    to: "kepada {{list}}",
    cc: "cc {{list}}",
    today: "Hari ini",
    yesterday: "Kemarin",
    loading: "Memuat email…",
    loadError: "Tidak dapat memuat email tiket ini.",
    retry: "Coba lagi",
    empty: "Belum ada email dalam percakapan ini.",
    frameTitle: "Isi email dari {{from}}",
    attachmentSkipped: "Lampiran tidak diimpor (terlalu besar)",
    download: "Unduh {{name}}",
    replyTo: "balas ke {{list}}",
    oversize:
      "Pesan terlalu besar untuk diimpor; buka di kotak surat email aslinya."
  },
  status: {
    queued: "Dalam antrean",
    sent: "Terkirim",
    failed: "Gagal",
    failedWithReason: "Gagal: {{reason}}",
    unknown: "Pengiriman belum dikonfirmasi",
    partial: "Terkirim — beberapa penerima ditolak",
    unknownHint:
      "Server tidak mengonfirmasi pengiriman. Pesan tidak dikirim ulang secara otomatis dan menjadi terkirim setelah salinannya muncul di kotak surat."
  },
  composer: {
    modesLabel: "Jenis balasan",
    reply: "Balas",
    replyAll: "Balas semua",
    forward: "Teruskan",
    from: "Dari",
    to: "Kepada",
    cc: "Cc",
    subject: "Subjek",
    body: "Isi email",
    placeholder: "Tulis balasan Anda",
    recipientsPlaceholder: "Pisahkan alamat dengan koma",
    bold: "Tebal",
    italic: "Miring",
    attach: "Lampirkan file",
    removeAttachment: "Hapus {{name}}",
    send: "Kirim email",
    sending: "Mengirim…",
    reauth:
      "Otorisasi kotak surat ini sudah kedaluwarsa. Hubungkan ulang di Koneksi.",
    replyPrefix: "Re:",
    forwardPrefix: "Fwd:"
  },
  errors: {
    generic: "Email tidak dapat dikirim. Coba lagi sebentar lagi."
  },
  contacts: {
    noPhone: "tanpa telepon"
  }
};

const idBackendErrors = {
  ERR_CONTACT_HAS_NO_PHONE:
    "Kontak ini tidak memiliki nomor telepon. Tiket dan jadwal WhatsApp memerlukan nomor.",
  ERR_EMAIL_CHANNEL_DISABLED:
    "Kanal email tidak diaktifkan untuk perusahaan ini.",
  ERR_EMAIL_ACCOUNT_UNAVAILABLE:
    "Kotak surat tiket ini tidak tersedia. Periksa koneksinya di Koneksi.",
  ERR_EMAIL_RECIPIENT_REQUIRED: "Masukkan setidaknya satu penerima.",
  ERR_EMAIL_INVALID_RECIPIENT: "Salah satu penerima bukan email yang valid.",
  ERR_EMAIL_TOO_MANY_RECIPIENTS:
    "Terlalu banyak penerima. Batasnya 20 per email.",
  ERR_EMAIL_ATTACHMENTS_TOO_LARGE: "Lampiran melebihi batas 25 MB.",
  ERR_EMAIL_ATTACHMENT_NOT_FOUND: "Lampiran tidak ditemukan.",
  ERR_EMAIL_BOUNCED: "Server tujuan menolak pengiriman.",
  ERR_EMAIL_AUTH: "Kotak surat menolak akses. Hubungkan ulang akun di Koneksi.",
  ERR_EMAIL_CONNECTION_FAILED: "Tidak dapat terhubung ke server email.",
  ERR_EMAIL_AUTH_FAILED:
    "Otorisasi kotak surat ini sudah kedaluwarsa. Hubungkan ulang di Koneksi.",
  ERR_EMAIL_CREDENTIALS_MISSING:
    "Kotak surat ini tidak memiliki kredensial tersimpan. Hubungkan ulang di Koneksi.",
  ERR_EMAIL_TRANSIENT:
    "Server email tidak merespons setelah beberapa kali percobaan. Coba kirim lagi.",
  ERR_EMAIL_SEND_AMBIGUOUS:
    "Server tidak mengonfirmasi pengiriman. Periksa kotak surat sebelum mengirim ulang.",
  ERR_EMAIL_ATTACHMENT_MISSING:
    "Sebuah lampiran sudah tidak tersedia. Lampirkan file lagi lalu kirim ulang.",
  ERR_EMAIL_INVALID_MESSAGE:
    "Pesan tidak dapat dikirim: periksa penerima dan lampiran.",
  ERR_EMAIL_REJECTED: "Server email menolak pesan.",
  ERR_EMAIL_PARTIAL_REJECTION:
    "Email terkirim, tetapi server menolak beberapa penerima.",
  ERR_EMAIL_PROVIDER_NOT_SUPPORTED: "Jenis kotak surat ini belum didukung.",
  ERR_EMAIL_HOST_NOT_ALLOWED:
    "Server email ini tidak diizinkan. Gunakan alamat publik server.",
  ERR_EMAIL_PORT_NOT_ALLOWED: "Port ini tidak diizinkan untuk server email.",
  ERR_GMAIL_SEND_400: "Gmail menolak pesan tersebut.",
  ERR_GMAIL_SEND_403:
    "Gmail menolak pengiriman (izin tidak ada atau kuota tercapai). Periksa koneksi atau coba lagi nanti.",
  ERR_EMAIL_MESSAGE_SKIPPED:
    "Satu email tidak dapat diimpor dan dilewati. Email lainnya tetap masuk seperti biasa.",
  ERR_EMAIL_ACCOUNT_NOT_FOUND: "Akun email tidak ditemukan.",
  ERR_EMAIL_ACCOUNT_EXISTS: "Kotak surat ini sudah terhubung.",
  ERR_EMAIL_INVALID_ACCOUNT:
    "Data akun email tidak valid. Periksa kolomnya lalu coba lagi.",
  ERR_EMAIL_SEND_FAILED: "Email tidak dapat dikirim.",
  ERR_INVALID_CHANNEL: "Kanal tidak valid untuk operasi ini.",
  ERR_EMAIL_EMPTY_MESSAGE: "Tulis pesan atau lampirkan file sebelum mengirim.",
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
};

const idMessages = {
  emailChannel: {
    companies: {
      enabled: "Kanal email",
      on: "Aktif",
      off: "Nonaktif"
    },
    connections: idConnections,
    inbox: idInbox
  },
  backendErrors: idBackendErrors
};

export const emailChannelMessages = {
  pt,
  pt_PT: ptPT,
  en,
  es: esMessages,
  fr: frMessages,
  de: deMessages,
  it: itMessages,
  id: idMessages
};
