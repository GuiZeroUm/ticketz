const ptConnections = {
  filters: {
    label: "Filtrar por canal",
    all: "Todas",
    whatsapp: "WhatsApp",
    email: "E-mail"
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

const pt = {
  emailChannel: {
    companies: {
      enabled: "Canal de e-mail",
      on: "Habilitado",
      off: "Desabilitado"
    },
    connections: ptConnections
  }
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
    }
  }
};

const en = {
  emailChannel: {
    companies: {
      enabled: "Email channel",
      on: "Enabled",
      off: "Disabled"
    },
    connections: enConnections
  }
};

export const emailChannelMessages = { pt, pt_PT: ptPT, en };
