import { deveAguardarNota, estadoNota, temNotaEmAndamento } from "./estadoNota";
import {
  documentoValido,
  formatarCep,
  paraApi,
  validarDadosFiscais
} from "./validacao";
import { formatarCompetencia } from "./formatos";
import { nomeArquivoNota } from "./notaFiscalApi";

jest.mock("../../services/api", () => ({}));

const paga = (fiscalNote = null) => ({ id: 1, status: "paid", fiscalNote });

test("mapeia o status da nota para o estado da tela", () => {
  expect(estadoNota(paga({ status: "issued" }))).toBe("emitida");
  expect(estadoNota(paga({ status: "processing" }))).toBe("emEmissao");
  expect(estadoNota(paga({ status: "error" }))).toBe("erro");
  expect(estadoNota(paga({ status: "cancelling" }))).toBe("cancelando");
  expect(estadoNota(paga({ status: "cancelled" }))).toBe("cancelada");
});

test("fatura paga sem nota: emitir ou pedir dados fiscais", () => {
  expect(estadoNota(paga(), { dadosFiscaisCompletos: true })).toBe("emitir");
  expect(estadoNota(paga(), { dadosFiscaisCompletos: false })).toBe(
    "faltamDados"
  );
  expect(
    estadoNota(paga({ status: "pending_fiscal_data" }), {
      dadosFiscaisCompletos: false
    })
  ).toBe("faltamDados");
  expect(
    estadoNota(paga({ status: "pending_fiscal_data" }), {
      dadosFiscaisCompletos: true
    })
  ).toBe("emitir");
});

test("fatura não paga não oferece nota", () => {
  expect(estadoNota({ id: 2, status: "open" })).toBe("nenhum");
  expect(estadoNota({ id: 3, situacao: "overdue" })).toBe("nenhum");
  expect(estadoNota({ id: 4, situacao: "paid" })).toBe("emitir");
});

test("detecta nota em andamento para o polling", () => {
  expect(temNotaEmAndamento([paga({ status: "issued" })])).toBe(false);
  expect(temNotaEmAndamento([paga(), paga({ status: "processing" })])).toBe(
    true
  );
  expect(temNotaEmAndamento([paga({ status: "cancelling" })])).toBe(true);
});

test("valida CPF e CNPJ pelos dígitos verificadores", () => {
  expect(documentoValido("529.982.247-25")).toBe(true);
  expect(documentoValido("529.982.247-24")).toBe(false);
  expect(documentoValido("11.222.333/0001-81")).toBe(true);
  expect(documentoValido("11.222.333/0001-80")).toBe(false);
  expect(documentoValido("111.111.111-11")).toBe(false);
  expect(documentoValido("123")).toBe(false);
});

const formOk = {
  document: "11222333000181",
  legalName: " Empresa Exemplo Ltda ",
  email: "nota@exemplo.com.br",
  zipCode: "01310-100",
  street: "Avenida Exemplo",
  number: "100",
  complement: "",
  district: "Centro",
  city: "São Paulo",
  cityIbgeCode: "3550308",
  state: "SP"
};

test("formulário válido vira o payload do contrato", () => {
  expect(validarDadosFiscais(formOk)).toEqual({});
  expect(paraApi(formOk)).toEqual({
    documentType: "cnpj",
    document: "11222333000181",
    legalName: "Empresa Exemplo Ltda",
    email: "nota@exemplo.com.br",
    address: {
      zipCode: "01310100",
      street: "Avenida Exemplo",
      number: "100",
      complement: null,
      district: "Centro",
      city: "São Paulo",
      cityIbgeCode: "3550308",
      state: "SP"
    }
  });
});

test("aponta cada campo com problema", () => {
  const erros = validarDadosFiscais({
    ...formOk,
    document: "11222333000180",
    email: "sem-arroba",
    zipCode: "0131",
    number: ""
  });
  expect(erros).toEqual({
    document: "notaFiscal.dados.documentoInvalido",
    email: "notaFiscal.dados.emailInvalido",
    zipCode: "notaFiscal.dados.cepInvalido",
    number: "notaFiscal.dados.obrigatorio"
  });
});

test("formata CEP e competência", () => {
  expect(formatarCep("01310100")).toBe("01310-100");
  expect(formatarCep("0131")).toBe("0131");
  expect(formatarCompetencia("2026-11")).toBe("11/2026");
  expect(formatarCompetencia(null)).toBe("-");
});

test("nome do arquivo segue o servidor: nfse-<número>", () => {
  expect(nomeArquivoNota({ numero: "45", invoiceId: 28, formato: "pdf" })).toBe(
    "nfse-45.pdf"
  );
  expect(
    nomeArquivoNota({ numero: "2026/45", invoiceId: 28, formato: "xml" })
  ).toBe("nfse-2026_45.xml");
  expect(nomeArquivoNota({ numero: null, invoiceId: 28, formato: "pdf" })).toBe(
    "nfse-fatura-28.pdf"
  );
});

test("após a baixa só aguarda a nota com emissão automática ativa", () => {
  const paga = extra => ({ id: 7, status: "paid", situacao: "paid", ...extra });
  expect(deveAguardarNota(paga({ fiscalAutoEmit: true }))).toBe(true);
  expect(deveAguardarNota(paga({ fiscalAutoEmit: false }))).toBe(false);
  expect(deveAguardarNota(paga({}))).toBe(false);
  expect(
    deveAguardarNota(
      paga({ fiscalAutoEmit: true, fiscalNote: { status: "processing" } })
    )
  ).toBe(false);
  expect(
    deveAguardarNota(paga({ fiscalAutoEmit: true }), {
      fiscalNote: { status: "issued" }
    })
  ).toBe(false);
  expect(
    deveAguardarNota({ id: 7, situacao: "open", fiscalAutoEmit: true })
  ).toBe(false);
});
