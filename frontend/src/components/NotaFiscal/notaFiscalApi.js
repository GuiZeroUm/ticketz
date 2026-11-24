// Chamadas da nota fiscal (NFS-e). Tudo passa pelo backend: o frontend nunca
// fala com o provedor de notas.
import api from "../../services/api";

// "cliente" = admin da própria empresa; "plataforma" = Central de Cobrança.
const baseFatura = (escopo, invoiceId) =>
  escopo === "plataforma"
    ? `/billing-admin/invoices/${invoiceId}/fiscal-note`
    : `/invoices/${invoiceId}/fiscal-note`;

const salvarArquivo = (blob, nome) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

// Com responseType blob o corpo do erro também vem como Blob: converte de
// volta pra JSON pra toastError achar o código (ex.: ERR_FISCAL_DOCUMENT_NOT_READY).
const erroLegivel = async err => {
  const dados = err?.response?.data;
  if (dados instanceof Blob) {
    try {
      err.response.data = JSON.parse(await dados.text());
    } catch (_) {
      // corpo não-JSON: mantém o erro como veio
    }
  }
  return err;
};

export const baixarNotaFiscal = async (escopo, invoiceId, formato = "pdf") => {
  try {
    const { data } = await api.get(
      `${baseFatura(escopo, invoiceId)}/${formato}`,
      { responseType: "blob" }
    );
    salvarArquivo(data, `nota-fiscal-${invoiceId}.${formato}`);
  } catch (err) {
    throw await erroLegivel(err);
  }
};

export const previaNotaFiscal = async invoiceId => {
  const { data } = await api.get(
    `${baseFatura("plataforma", invoiceId)}/preview`
  );
  return data;
};

export const emitirNotaFiscal = async invoiceId => {
  const { data } = await api.post(baseFatura("plataforma", invoiceId));
  return data;
};

export const cancelarNotaFiscal = async (invoiceId, reason) => {
  const { data } = await api.post(
    `${baseFatura("plataforma", invoiceId)}/cancel`,
    { reason }
  );
  return data;
};

// companyId vazio = dados da empresa do usuário logado.
const baseDadosFiscais = companyId =>
  companyId
    ? `/billing-admin/clients/${companyId}/fiscal-data`
    : "/companies/fiscal-data";

export const carregarDadosFiscais = async companyId => {
  const { data } = await api.get(baseDadosFiscais(companyId));
  return data;
};

export const salvarDadosFiscais = async (companyId, dados) => {
  const { data } = await api.put(baseDadosFiscais(companyId), dados);
  return data;
};

export const buscarCep = async cep => {
  const { data } = await api.get(`/fiscal-data/cep/${cep}`);
  return data;
};
