// Estado da nota fiscal de uma fatura, usado pelas duas telas.
//
//   nenhum         fatura sem nota e sem ação possível (ex.: não paga)
//   emitir         paga, sem nota e com dados fiscais completos (só plataforma)
//   faltamDados    paga, mas a empresa não tem dados fiscais completos
//   emEmissao      na fila ou sendo emitida
//   emitida        pronta: PDF/XML disponíveis
//   erro           a emissão falhou; dá pra tentar de novo
//   cancelando     pedido de cancelamento em andamento
//   corrigindo     cancelamento pedido para reemitir com dados corrigidos
//   reemitindo     cancelada, com a nota nova já a caminho
//   cancelada      cancelada na prefeitura (dá pra emitir uma nova)
export const estadoNota = (fatura, { dadosFiscaisCompletos } = {}) => {
  const nota = fatura?.fiscalNote;
  const paga = fatura?.status === "paid" || fatura?.situacao === "paid";

  if (nota) {
    switch (nota.status) {
      case "issued":
        return "emitida";
      case "processing":
      case "queued":
        return "emEmissao";
      case "error":
        return "erro";
      case "cancelling":
        return nota.replacementPending ? "corrigindo" : "cancelando";
      case "cancelled":
        return nota.replacementPending ? "reemitindo" : "cancelada";
      case "pending_fiscal_data":
        return dadosFiscaisCompletos === true ? "emitir" : "faltamDados";
      default:
        return "nenhum";
    }
  }

  if (!paga) return "nenhum";
  if (dadosFiscaisCompletos === false) return "faltamDados";
  return "emitir";
};

// Enquanto houver nota em andamento a tela recarrega de tempos em tempos
// (reserva do evento de socket).
export const temNotaEmAndamento = faturas =>
  (faturas || []).some(
    fatura =>
      ["processing", "queued", "cancelling"].includes(
        fatura?.fiscalNote?.status
      ) || !!fatura?.fiscalNote?.replacementPending
  );

// Depois da baixa, a Central só mostra "Preparando a nota fiscal…" quando o
// servidor vai gerar a nota sozinho (fiscalAutoEmit). Com a emissão automática
// desligada, ou campo ausente, "Emitir nota" aparece na hora.
export const deveAguardarNota = (atualizada, anterior) => {
  const paga = atualizada?.situacao === "paid" || atualizada?.status === "paid";
  return (
    paga &&
    atualizada.fiscalAutoEmit === true &&
    !atualizada.fiscalNote &&
    !anterior?.fiscalNote
  );
};
