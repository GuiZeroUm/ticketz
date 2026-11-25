import { validateCNPJ, validateCPF, validateEmail } from "validations-br";

export const apenasDigitos = valor => String(valor || "").replace(/\D/g, "");

export const tipoDocumento = documento =>
  apenasDigitos(documento).length > 11 ? "cnpj" : "cpf";

export const documentoValido = documento => {
  const digitos = apenasDigitos(documento);
  if (digitos.length === 11) return validateCPF(digitos);
  if (digitos.length === 14) return validateCNPJ(digitos);
  return false;
};

export const formatarCep = valor => {
  const digitos = apenasDigitos(valor).slice(0, 8);
  return digitos.length > 5
    ? `${digitos.slice(0, 5)}-${digitos.slice(5)}`
    : digitos;
};

export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
];

const OBRIGATORIOS = [
  "document",
  "legalName",
  "email",
  "zipCode",
  "street",
  "number",
  "district",
  "city",
  "state"
];

// Devolve { campo: chaveI18n } só para os campos com problema.
export const validarDadosFiscais = form => {
  const erros = {};
  OBRIGATORIOS.forEach(campo => {
    if (!String(form[campo] || "").trim()) {
      erros[campo] = "notaFiscal.dados.obrigatorio";
    }
  });
  if (!erros.document && !documentoValido(form.document)) {
    erros.document = "notaFiscal.dados.documentoInvalido";
  }
  if (!erros.email && !validateEmail(String(form.email).trim())) {
    erros.email = "notaFiscal.dados.emailInvalido";
  }
  if (!erros.zipCode && apenasDigitos(form.zipCode).length !== 8) {
    erros.zipCode = "notaFiscal.dados.cepInvalido";
  }
  if (!erros.state && !UFS.includes(form.state)) {
    erros.state = "notaFiscal.dados.obrigatorio";
  }
  return erros;
};

// Formato da API (contrato com o backend).
export const paraApi = form => ({
  documentType: tipoDocumento(form.document),
  document: apenasDigitos(form.document),
  legalName: form.legalName.trim(),
  email: form.email.trim(),
  address: {
    zipCode: apenasDigitos(form.zipCode),
    street: form.street.trim(),
    number: form.number.trim(),
    complement: (form.complement || "").trim() || null,
    district: form.district.trim(),
    city: form.city.trim(),
    cityIbgeCode: form.cityIbgeCode || null,
    state: form.state
  }
});

export const daApi = dados => {
  const endereco = dados?.address || {};
  return {
    document: dados?.document || "",
    legalName: dados?.legalName || "",
    email: dados?.email || "",
    zipCode: formatarCep(endereco.zipCode),
    street: endereco.street || "",
    number: endereco.number || "",
    complement: endereco.complement || "",
    district: endereco.district || "",
    city: endereco.city || "",
    cityIbgeCode: endereco.cityIbgeCode || "",
    state: endereco.state || ""
  };
};
