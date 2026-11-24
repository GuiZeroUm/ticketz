import moment from "moment";

export const formatarMoeda = (valor, moeda = "BRL") => {
  const numero = Number(valor) || 0;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda || "BRL"
    }).format(numero);
  } catch (_) {
    return `R$ ${numero.toFixed(2)}`;
  }
};

// Competência chega como "AAAA-MM" (ou data completa); mostra "MM/AAAA".
export const formatarCompetencia = valor => {
  if (!valor) return "-";
  const data = moment(valor, ["YYYY-MM", "YYYY-MM-DD", moment.ISO_8601], true);
  return data.isValid() ? data.format("MM/YYYY") : String(valor);
};
