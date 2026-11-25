import { i18n } from "../../translate/i18n";

// "Na nota: Razão · CNPJ mascarado · e-mail" a partir do snapshot do tomador
// gravado na emissão. Notas antigas não têm snapshot: devolve null.
export const textoTomador = tomador => {
  if (!tomador) return null;
  const { name, documentMasked, email } = tomador;
  if (!name && !documentMasked && !email) return null;
  return i18n.t("notaFiscal.tomadorNota", {
    nome: name || "-",
    documento: documentMasked || "-",
    email: email || "-",
    interpolation: { escapeValue: false }
  });
};

// Motivo de um cancelamento que não foi confirmado (recusado ou em análise).
export const textoCancelamento = codigo => {
  if (!codigo) return null;
  if (codigo === "CANCEL_PENDING_ANALYSIS") {
    return i18n.t("notaFiscal.cancelamentoAnalise");
  }
  const chave = `notaFiscal.cancelStatus.${codigo}`;
  const motivo = i18n.exists(chave)
    ? i18n.t(chave)
    : i18n.t("notaFiscal.cancelStatus.outro");
  return i18n.t("notaFiscal.cancelamentoRecusado", {
    motivo,
    interpolation: { escapeValue: false }
  });
};
