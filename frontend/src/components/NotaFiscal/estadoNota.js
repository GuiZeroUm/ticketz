// Estado da nota fiscal de uma fatura, usado pelas duas telas.
//
//   nenhum         fatura sem nota e sem ação possível (ex.: não paga)
//   emitir         paga, sem nota e com dados fiscais completos (só plataforma)
//   faltamDados    paga, mas a empresa não tem dados fiscais completos
//   emEmissao      na fila ou sendo emitida
//   emitida        pronta: PDF/XML disponíveis
//   erro           a emissão falhou; dá pra tentar de novo
//   cancelando     pedido de cancelamento em andamento
//   cancelada      cancelada na prefeitura
export const estadoNota = (fatura, { dadosFiscaisCompletos } = {}) => {
  const nota = fatura?.fiscalNote;
  const paga = fatura?.status === "paid" || fatura?.situacao === "paid";

  if (nota) {
    switch (nota.status) {
      case "issued":
        return "emitida";
      case "processing":
        return "emEmissao";
      case "error":
        return "erro";
      case "cancelling":
        return "cancelando";
      case "cancelled":
        return "cancelada";
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
  (faturas || []).some(fatura =>
    ["processing", "cancelling"].includes(fatura?.fiscalNote?.status)
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
