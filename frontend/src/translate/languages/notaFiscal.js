// Textos das telas de nota fiscal (NFS-e). Outros idiomas caem no fallback.
export const notaFiscalMessages = {
  pt: {
    notaFiscal: {
      botao: "Nota fiscal",
      baixar: "Baixar nota fiscal",
      baixarPdf: "Baixar PDF",
      baixarXml: "Baixar XML",
      emEmissao: "Nota em emissão",
      preparando: "Preparando a nota fiscal…",
      emEmissaoDica:
        "A prefeitura está processando a nota. Ela aparece aqui assim que for emitida.",
      cancelada: "Nota fiscal cancelada",
      cancelando: "Cancelamento em andamento",
      corrigindo: "Cancelando a nota para corrigir…",
      reemitindo: "Emitindo nova nota…",
      reemitindoDe: "Emitindo nova nota (substitui a Nº {{numero}})…",
      substitui: "Substitui a nota Nº {{numero}}",
      emitirNova: "Emitir nova nota",
      emitirNovaDe: "Emitir nova nota fiscal da fatura {{id}}",
      corrigir: "Corrigir nota",
      dadosCliente: "Dados fiscais do cliente",
      editarDados: "Editar dados fiscais",
      corrigirEnviado:
        "Cancelamento pedido. A nova nota sai assim que a prefeitura confirmar.",
      tomadorNota: "Na nota: {{nome}} · {{documento}} · {{email}}",
      cancelamentoRecusado: "Cancelamento recusado: {{motivo}}",
      cancelamentoAnalise: "Cancelamento em análise na prefeitura",
      cancelStatus: {
        CANCEL_REJECTED: "a prefeitura recusou o cancelamento",
        CANCEL_PENDING_ANALYSIS: "o cancelamento está em análise na prefeitura",
        outro: "a prefeitura não confirmou o cancelamento"
      },
      erro: "Erro na emissão da nota",
      erroSemDetalhe: "A emissão falhou sem detalhes. Tente de novo.",
      tentarDeNovo: "Tentar de novo",
      emitir: "Emitir nota",
      emitirDe: "Emitir nota fiscal da fatura {{id}}",
      faltamDados: "Faltam dados fiscais do cliente",
      faltamDadosAcao:
        "Faltam dados fiscais do cliente. Clique para preencher.",
      preencherDados: "Preencher dados fiscais",
      cancelar: "Cancelar nota",
      enviada: "Nota enviada para emissão.",
      cancelamentoEnviado: "Pedido de cancelamento enviado.",
      numero: "Nota nº {{numero}}",
      dialogo: {
        titulo: "Emitir nota fiscal",
        tentarTitulo: "Tentar de novo a nota da fatura {{id}}",
        aviso:
          "A nota é enviada à prefeitura e não pode ser editada depois. Confira os dados.",
        tomador: "Tomador",
        documento: "CPF/CNPJ",
        email: "E-mail da nota",
        valor: "Valor",
        competencia: "Competência",
        servico: "Serviço",
        iss: "ISS",
        confirmar: "Emitir nota",
        voltar: "Voltar",
        carregando: "Carregando dados da nota…",
        motivoCancelamento: "Motivo do cancelamento",
        cancelarTitulo: "Cancelar nota fiscal",
        cancelarConfirmar: "Cancelar nota",
        motivoAjuda: "De 15 a 255 caracteres.",
        cancelarAviso:
          "O cancelamento é enviado à prefeitura e não pode ser desfeito.",
        corrigirTitulo: "Corrigir nota fiscal",
        corrigirPergunta:
          "Cancelar a nota Nº {{numero}} e emitir uma nova com os dados atualizados?",
        corrigirPerguntaSemNumero:
          "Cancelar a nota atual e emitir uma nova com os dados atualizados?",
        corrigirAviso:
          "A nota atual é cancelada na prefeitura e uma nova sai com os dados fiscais salvos agora. Se a prefeitura recusar o cancelamento, nada é reemitido.",
        corrigirMotivoPadrao: "Substituição por correção de dados do tomador",
        corrigirConfirmar: "Cancelar e emitir nova",
        salvarEContinuar: "Salvar e continuar"
      },
      dados: {
        titulo: "Dados fiscais",
        tituloDe: "Dados fiscais — {{nome}}",
        descricao:
          "Usados para emitir a nota fiscal das suas faturas. Confira com o seu contador.",
        incompletos:
          "Preencha os dados fiscais para receber a nota fiscal das suas faturas.",
        documento: "CPF ou CNPJ",
        documentoInvalido: "CPF ou CNPJ inválido",
        razaoSocial: "Nome ou razão social",
        email: "E-mail para receber a nota",
        emailInvalido: "E-mail inválido",
        cep: "CEP",
        cepInvalido: "CEP inválido",
        cepBuscando: "Buscando endereço…",
        cepNaoEncontrado: "CEP não encontrado. Confira o número.",
        cepFalhou: "Não foi possível buscar o CEP agora. Preencha o endereço.",
        rua: "Rua",
        numero: "Número",
        complemento: "Complemento",
        bairro: "Bairro",
        cidade: "Cidade",
        uf: "UF",
        obrigatorio: "Obrigatório",
        salvar: "Salvar dados fiscais",
        salvos: "Dados fiscais salvos.",
        fechar: "Fechar"
      }
    },
    backendErrors: {
      ERR_FISCAL_DATA_INCOMPLETE:
        "Faltam dados fiscais do cliente para emitir a nota.",
      ERR_INVOICE_NOT_PAID: "A nota só pode ser emitida para fatura paga.",
      ERR_FISCAL_NOTE_EXISTS: "Esta fatura já tem nota fiscal.",
      ERR_FISCAL_NOTE_NOT_CANCELLABLE:
        "Só dá para corrigir uma nota emitida. Atualize a lista e confira o estado.",
      ERR_FISCAL_CANCEL_FAILED:
        "A prefeitura não aceitou o pedido de cancelamento. A nota atual continua válida.",
      ERR_FISCAL_NOTE_FAILED:
        "Não foi possível emitir a nota fiscal. Nossa equipe já foi avisada.",
      ERR_FISCAL_STATUS_CHECK_FAILED:
        "Não foi possível confirmar se a nota anterior saiu. Tente de novo em alguns minutos.",
      ERR_FISCAL_NOTE_NOT_FOUND: "Nota fiscal não encontrada.",
      ERR_FISCAL_DOCUMENT_NOT_READY:
        "O arquivo da nota ainda não está disponível. Tente em alguns minutos.",
      ERR_FISCAL_NOTES_DISABLED:
        "A emissão de nota fiscal está desligada neste servidor.",
      ERR_FISCAL_CANCEL_REASON:
        "Informe o motivo do cancelamento (de 15 a 255 caracteres).",
      ERR_FISCAL_INVALID_DOCUMENT: "CPF ou CNPJ inválido.",
      ERR_FISCAL_INVALID_ZIPCODE: "CEP inválido.",
      ERR_FISCAL_INVALID_EMAIL: "E-mail da nota inválido.",
      ERR_FISCAL_INVALID_STATE: "UF inválida.",
      ERR_ZIPCODE_NOT_FOUND: "CEP não encontrado.",
      ERR_ZIPCODE_LOOKUP_FAILED:
        "Não foi possível buscar o CEP agora. Preencha o endereço."
    }
  },
  en: {
    notaFiscal: {
      botao: "Invoice (NFS-e)",
      baixar: "Download tax invoice",
      baixarPdf: "Download PDF",
      baixarXml: "Download XML",
      emEmissao: "Tax invoice being issued",
      preparando: "Preparing the tax invoice…",
      emEmissaoDica:
        "The city hall is processing the tax invoice. It shows up here as soon as it is issued.",
      cancelada: "Tax invoice cancelled",
      cancelando: "Cancellation in progress",
      corrigindo: "Cancelling the tax invoice to correct it…",
      reemitindo: "Issuing a new tax invoice…",
      reemitindoDe: "Issuing a new tax invoice (replaces no. {{numero}})…",
      substitui: "Replaces tax invoice no. {{numero}}",
      emitirNova: "Issue new tax invoice",
      emitirNovaDe: "Issue a new tax invoice for bill {{id}}",
      corrigir: "Correct tax invoice",
      dadosCliente: "Customer tax details",
      editarDados: "Edit tax details",
      corrigirEnviado:
        "Cancellation requested. The new tax invoice is issued as soon as the city hall confirms.",
      tomadorNota: "On the invoice: {{nome}} · {{documento}} · {{email}}",
      cancelamentoRecusado: "Cancellation refused: {{motivo}}",
      cancelamentoAnalise: "Cancellation under review by the city hall",
      cancelStatus: {
        CANCEL_REJECTED: "the city hall refused the cancellation",
        CANCEL_PENDING_ANALYSIS:
          "the cancellation is under review by the city hall",
        outro: "the city hall did not confirm the cancellation"
      },
      erro: "Tax invoice failed",
      erroSemDetalhe: "Issuing failed without details. Try again.",
      tentarDeNovo: "Try again",
      emitir: "Issue tax invoice",
      emitirDe: "Issue tax invoice for bill {{id}}",
      faltamDados: "Customer tax details missing",
      faltamDadosAcao: "Customer tax details missing. Click to fill them in.",
      preencherDados: "Fill in tax details",
      cancelar: "Cancel tax invoice",
      enviada: "Tax invoice sent for issuing.",
      cancelamentoEnviado: "Cancellation request sent.",
      numero: "Tax invoice no. {{numero}}",
      dialogo: {
        titulo: "Issue tax invoice",
        tentarTitulo: "Retry the tax invoice for bill {{id}}",
        aviso:
          "The tax invoice is sent to the city hall and cannot be edited afterwards. Check the details.",
        tomador: "Customer",
        documento: "Tax ID (CPF/CNPJ)",
        email: "Tax invoice e-mail",
        valor: "Amount",
        competencia: "Period",
        servico: "Service",
        iss: "ISS",
        confirmar: "Issue tax invoice",
        voltar: "Back",
        carregando: "Loading tax invoice details…",
        motivoCancelamento: "Cancellation reason",
        cancelarTitulo: "Cancel tax invoice",
        cancelarConfirmar: "Cancel tax invoice",
        motivoAjuda: "15 to 255 characters.",
        cancelarAviso:
          "The cancellation is sent to the city hall and cannot be undone.",
        corrigirTitulo: "Correct tax invoice",
        corrigirPergunta:
          "Cancel tax invoice no. {{numero}} and issue a new one with the updated details?",
        corrigirPerguntaSemNumero:
          "Cancel the current tax invoice and issue a new one with the updated details?",
        corrigirAviso:
          "The current tax invoice is cancelled at the city hall and a new one is issued with the tax details saved now. If the city hall refuses the cancellation, nothing is reissued.",
        corrigirMotivoPadrao: "Replacement to correct the customer details",
        corrigirConfirmar: "Cancel and issue new",
        salvarEContinuar: "Save and continue"
      },
      dados: {
        titulo: "Tax details",
        tituloDe: "Tax details — {{nome}}",
        descricao:
          "Used to issue the tax invoice for your bills. Check them with your accountant.",
        incompletos:
          "Fill in your tax details to receive the tax invoice for your bills.",
        documento: "Tax ID (CPF or CNPJ)",
        documentoInvalido: "Invalid CPF or CNPJ",
        razaoSocial: "Name or company name",
        email: "E-mail to receive the tax invoice",
        emailInvalido: "Invalid e-mail",
        cep: "Postal code (CEP)",
        cepInvalido: "Invalid postal code",
        cepBuscando: "Looking up address…",
        cepNaoEncontrado: "Postal code not found. Check the number.",
        cepFalhou:
          "Could not look up the postal code now. Fill in the address.",
        rua: "Street",
        numero: "Number",
        complemento: "Complement",
        bairro: "District",
        cidade: "City",
        uf: "State",
        obrigatorio: "Required",
        salvar: "Save tax details",
        salvos: "Tax details saved.",
        fechar: "Close"
      }
    },
    backendErrors: {
      ERR_FISCAL_DATA_INCOMPLETE:
        "Customer tax details are missing to issue the tax invoice.",
      ERR_INVOICE_NOT_PAID: "Tax invoices can only be issued for paid bills.",
      ERR_FISCAL_NOTE_EXISTS: "This bill already has a tax invoice.",
      ERR_FISCAL_NOTE_NOT_CANCELLABLE:
        "Only an issued tax invoice can be corrected. Refresh the list and check its state.",
      ERR_FISCAL_CANCEL_FAILED:
        "The city hall did not accept the cancellation request. The current tax invoice is still valid.",
      ERR_FISCAL_NOTE_FAILED:
        "The tax invoice could not be issued. Our team has been notified.",
      ERR_FISCAL_STATUS_CHECK_FAILED:
        "Could not confirm whether the previous tax invoice was issued. Try again in a few minutes.",
      ERR_FISCAL_NOTE_NOT_FOUND: "Tax invoice not found.",
      ERR_FISCAL_DOCUMENT_NOT_READY:
        "The tax invoice file is not available yet. Try again in a few minutes.",
      ERR_FISCAL_NOTES_DISABLED: "Tax invoices are turned off on this server.",
      ERR_FISCAL_CANCEL_REASON:
        "Enter the cancellation reason (15 to 255 characters).",
      ERR_FISCAL_INVALID_DOCUMENT: "Invalid CPF or CNPJ.",
      ERR_FISCAL_INVALID_ZIPCODE: "Invalid postal code.",
      ERR_FISCAL_INVALID_EMAIL: "Invalid tax invoice e-mail.",
      ERR_FISCAL_INVALID_STATE: "Invalid state.",
      ERR_ZIPCODE_NOT_FOUND: "Postal code not found.",
      ERR_ZIPCODE_LOOKUP_FAILED:
        "Could not look up the postal code now. Fill in the address."
    }
  }
};
