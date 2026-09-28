const pt = {
  connections: {
    toasts: {
      metaConnected: "Conectado à API Oficial da Meta com sucesso!"
    },
    buttons: {
      connectMeta: "Conectar via Meta"
    },
    toolTips: {
      notAvailableOfficial:
        "Ainda não disponível para conexões via API Oficial da Meta."
    },
    meta: {
      missingConfig:
        "A conexão oficial ainda não foi configurada na plataforma. Entre em contato com o suporte.",
      missingNumber:
        "Não foi possível identificar a conta e o número escolhidos na Meta.",
      loginFailed: "Não foi possível carregar o login da Meta."
    }
  },
  messagesInput: {
    serviceWindowClosed:
      "Faz mais de 24 horas desde a última mensagem do cliente. Para falar com ele de novo, envie um template aprovado.",
    sendTemplate: "Enviar template"
  },
  templateMessageModal: {
    title: "Enviar template aprovado",
    help: "O primeiro contato e as conversas fora da janela de 24 horas só chegam ao cliente por um template aprovado pela Meta.",
    fieldLabel: "Template",
    variableLabel: "Variável {{index}}",
    noTemplates:
      "Nenhum template aprovado nesta conexão. Crie e aprove um template no Gerenciador de Negócios da Meta.",
    buttons: {
      ok: "Enviar",
      cancel: "Cancelar"
    }
  },
  backendErrors: {
    ERR_META_PHONE_ALREADY_CONNECTED:
      "Este número oficial já está vinculado a outra conexão.",
    ERR_META_PHONE_REGISTER_FAILED:
      "A Meta não confirmou o registro do número. Verifique a configuração e tente novamente.",
    ERR_WAPP_OFFICIAL_MODE_NOT_SUPPORTED:
      "Ainda não disponível para conexões via API Oficial da Meta.",
    ERR_WAPP_OFFICIAL_MODE_USE_META_CONNECT:
      "Esta conexão usa a API Oficial da Meta: não há QR Code. Use o botão de conectar pela Meta.",
    ERR_WAPP_NOT_OFFICIAL_MODE:
      "Esta conexão não está em modo API Oficial da Meta.",
    ERR_META_CONNECTION_NOT_CONFIGURED:
      "A conexão da API Oficial está incompleta. Reconecte o número em Conexões.",
    ERR_META_APP_NOT_CONFIGURED:
      "Falta configurar META_APP_ID e META_APP_SECRET no servidor.",
    ERR_META_MEDIA_TOO_LARGE:
      "Arquivo grande demais para a API Oficial da Meta. O limite é 5 MB para imagem, 16 MB para áudio e vídeo e 100 MB para documento.",
    ERR_META_MEDIA_UPLOAD:
      "Não foi possível enviar o arquivo para a Meta. Tente novamente.",
    ERR_META_MEDIA_NOT_FOUND:
      "A Meta não encontrou este arquivo. Peça para o contato enviar novamente.",
    ERR_META_TEMPLATE_BODY_TOO_LONG:
      "O texto passa de 1024 caracteres, limite da Meta para template. Encurte a mensagem desta etapa.",
    ERR_META_TEMPLATE_SAMPLE:
      "Não foi possível enviar o boleto de exemplo que a Meta exige para aprovar um template com anexo.",
    ERR_WAPP_OFFICIAL_MODE_ONLY:
      "Esta ação só existe em conexões da API Oficial da Meta.",
    ERR_META_TEMPLATE_ON_GROUP: "Template não pode ser enviado para um grupo.",
    ERR_META_WINDOW_CLOSED:
      "A janela de 24 horas com este contato está fechada. Use um template aprovado para reabrir a conversa.",
    ERR_META_TEMPLATE_INVALID:
      "A Meta recusou este template. Confira o nome, o idioma e as variáveis.",
    ERR_META_TEMPLATE_NOT_APPROVED: "Este template não está aprovado na Meta.",
    ERR_COMPANY_WHATSAPP_MODE_IMMUTABLE:
      "Escolha definitiva na criação da empresa. Não será possível trocar depois.",
    ERR_COMPANY_INVALID_WHATSAPP_MODE: "Selecione API oficial ou não oficial."
  },
  companyWhatsAppMode: {
    label: "Método de conexão WhatsApp",
    normal: "API não oficial (QR Code)",
    meta: "API oficial (Meta)",
    immutable:
      "Escolha definitiva na criação da empresa. Não será possível trocar depois."
  }
};
const en = {
  connections: {
    toasts: {
      metaConnected: "Successfully connected to the Meta Official API!"
    },
    buttons: {
      connectMeta: "Connect via Meta"
    },
    toolTips: {
      notAvailableOfficial:
        "Not available yet for Meta Official API connections."
    },
    meta: {
      missingConfig:
        "The official connection is not configured on this platform yet. Contact support.",
      missingNumber:
        "Could not identify the account and phone number selected on Meta.",
      loginFailed: "Could not load Meta login."
    }
  },
  messagesInput: {
    serviceWindowClosed:
      "More than 24 hours have passed since the last customer message. Send an approved template to reach them again.",
    sendTemplate: "Send template"
  },
  templateMessageModal: {
    title: "Send approved template",
    help: "The first contact and any conversation outside the 24 hour window only reach the customer through a template approved by Meta.",
    fieldLabel: "Template",
    variableLabel: "Variable {{index}}",
    noTemplates:
      "No approved template on this connection. Create and approve one in the Meta Business Manager.",
    buttons: {
      ok: "Send",
      cancel: "Cancel"
    }
  },
  backendErrors: {
    ERR_META_PHONE_ALREADY_CONNECTED:
      "This official phone number is already linked to another connection.",
    ERR_META_PHONE_REGISTER_FAILED:
      "Meta did not confirm phone registration. Check the configuration and try again.",
    ERR_WAPP_OFFICIAL_MODE_NOT_SUPPORTED:
      "Not available yet for Meta Official API connections.",
    ERR_WAPP_OFFICIAL_MODE_ONLY:
      "This action only exists on Meta Official API connections.",
    ERR_META_TEMPLATE_ON_GROUP: "A template cannot be sent to a group.",
    ERR_META_CONNECTION_NOT_CONFIGURED:
      "The official API connection is incomplete. Reconnect the number under Connections.",
    ERR_META_WINDOW_CLOSED:
      "The 24 hour window with this contact is closed. Use an approved template to reopen the conversation.",
    ERR_META_TEMPLATE_INVALID:
      "Meta rejected this template. Check its name, language and variables.",
    ERR_META_TEMPLATE_NOT_APPROVED: "This template is not approved on Meta.",
    ERR_COMPANY_WHATSAPP_MODE_IMMUTABLE:
      "This choice is permanent when the company is created and cannot be changed later.",
    ERR_COMPANY_INVALID_WHATSAPP_MODE: "Select official or unofficial API."
  },
  companyWhatsAppMode: {
    label: "WhatsApp connection method",
    normal: "Unofficial API (QR code)",
    meta: "Official API (Meta)",
    immutable:
      "This choice is permanent when the company is created and cannot be changed later."
  }
};

export const whatsappProvidersMessages = { pt, pt_PT: pt, en };
