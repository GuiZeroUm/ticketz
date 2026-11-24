import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";

import BotaoNotaCliente from "./BotaoNotaCliente";
import AcoesNotaPlataforma from "./AcoesNotaPlataforma";
import DialogoDadosFiscais from "./DialogoDadosFiscais";
import * as notaApi from "./notaFiscalApi";
import toastError from "../../errors/toastError";

jest.mock("../../translate/i18n", () => ({
  i18n: {
    t: (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key)
  }
}));
jest.mock("../../errors/toastError", () => jest.fn());
jest.mock("../../helpers/i18nToast", () => ({
  i18nToast: { success: jest.fn() }
}));
jest.mock("./notaFiscalApi", () => ({
  baixarNotaFiscal: jest.fn(() => Promise.resolve()),
  previaNotaFiscal: jest.fn(),
  emitirNotaFiscal: jest.fn(),
  cancelarNotaFiscal: jest.fn(),
  carregarDadosFiscais: jest.fn(),
  salvarDadosFiscais: jest.fn(),
  buscarCep: jest.fn()
}));

beforeEach(() => jest.clearAllMocks());

const fatura = (fiscalNote, extra = {}) => ({
  id: 28,
  companyId: 7,
  status: "paid",
  situacao: "paid",
  company: { id: 7, name: "Cliente Exemplo" },
  fiscalNote,
  ...extra
});

describe("BotaoNotaCliente (tela de faturas do cliente)", () => {
  test("nota emitida: botão com texto baixa o PDF pelo escopo do cliente", async () => {
    render(
      <BotaoNotaCliente
        fatura={fatura({ status: "issued", number: "123", hasPdf: true })}
      />
    );
    const botao = screen.getByRole("button", { name: "notaFiscal.baixar" });
    expect(botao.textContent).toContain("notaFiscal.botao");
    fireEvent.click(botao);
    await waitFor(() =>
      expect(notaApi.baixarNotaFiscal).toHaveBeenCalledWith(
        "cliente",
        28,
        "pdf"
      )
    );
  });

  test("em emissão: desabilitado e com explicação acessível", () => {
    render(<BotaoNotaCliente fatura={fatura({ status: "processing" })} />);
    const botao = screen.getByRole("button", { name: /notaFiscal.emEmissao/ });
    expect(botao.disabled).toBe(true);
    expect(screen.getByLabelText("notaFiscal.emEmissaoDica")).toBeTruthy();
  });

  test("sem nota, com erro ou fatura em aberto: não mostra nada", () => {
    const { container, rerender } = render(
      <BotaoNotaCliente fatura={fatura(null)} />
    );
    expect(container.innerHTML).toBe("");
    rerender(<BotaoNotaCliente fatura={fatura({ status: "error" })} />);
    expect(container.innerHTML).toBe("");
    rerender(
      <BotaoNotaCliente
        fatura={fatura(null, { status: "open", situacao: "open" })}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  test("falha no download mostra o erro traduzido", async () => {
    const erro = {
      response: { data: { error: "ERR_FISCAL_DOCUMENT_NOT_READY" } }
    };
    notaApi.baixarNotaFiscal.mockRejectedValueOnce(erro);
    render(<BotaoNotaCliente fatura={fatura({ status: "issued" })} />);
    fireEvent.click(screen.getByRole("button", { name: "notaFiscal.baixar" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(erro));
  });
});

describe("AcoesNotaPlataforma (Central de Cobrança)", () => {
  test("paga sem nota e com dados: confirma tomador, valor e competência antes de emitir", async () => {
    notaApi.previaNotaFiscal.mockResolvedValue({
      tomador: {
        name: "Cliente Exemplo Ltda",
        documentType: "cnpj",
        document: "11222333000181",
        email: "nota@exemplo.com.br"
      },
      value: 1100,
      currency: "BRL",
      competencia: "2026-11",
      service: { code: "010501", description: "Licenciamento de software" },
      issRate: 5
    });
    const nota = { id: 1, status: "processing" };
    notaApi.emitirNotaFiscal.mockResolvedValue(nota);
    const aoAtualizar = jest.fn();
    render(
      <AcoesNotaPlataforma
        fatura={fatura(null)}
        dadosFiscaisCompletos
        aoAtualizar={aoAtualizar}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /notaFiscal.emitirDe/ })
    );
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("Cliente Exemplo Ltda");
    expect(within(dialogo).getByText("11.222.333/0001-81")).toBeTruthy();
    expect(within(dialogo).getByText("11/2026")).toBeTruthy();
    expect(within(dialogo).getByText(/1\.100,00/)).toBeTruthy();
    expect(notaApi.emitirNotaFiscal).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialogo).getByRole("button", {
        name: "notaFiscal.dialogo.confirmar"
      })
    );
    await waitFor(() =>
      expect(notaApi.emitirNotaFiscal).toHaveBeenCalledWith(28)
    );
    expect(aoAtualizar).toHaveBeenCalledWith(nota);
  });

  test("prévia sem dados fiscais: avisa e leva ao formulário", async () => {
    notaApi.previaNotaFiscal.mockRejectedValue({
      response: { status: 422, data: { error: "ERR_FISCAL_DATA_INCOMPLETE" } }
    });
    const aoPreencherDados = jest.fn();
    render(
      <AcoesNotaPlataforma
        fatura={fatura(null)}
        dadosFiscaisCompletos
        aoAtualizar={jest.fn()}
        aoPreencherDados={aoPreencherDados}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /notaFiscal.emitirDe/ })
    );
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText(
      "backendErrors.ERR_FISCAL_DATA_INCOMPLETE"
    );
    expect(
      within(dialogo).getByRole("button", {
        name: "notaFiscal.dialogo.confirmar"
      }).disabled
    ).toBe(true);
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "notaFiscal.preencherDados" })
    );
    expect(aoPreencherDados).toHaveBeenCalled();
  });

  test("faltam dados fiscais: ícone de aviso abre o formulário", () => {
    const aoPreencherDados = jest.fn();
    render(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "pending_fiscal_data" })}
        dadosFiscaisCompletos={false}
        aoAtualizar={jest.fn()}
        aoPreencherDados={aoPreencherDados}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "notaFiscal.preencherDados" })
    );
    expect(aoPreencherDados).toHaveBeenCalledWith(
      expect.objectContaining({ id: 28 })
    );
  });

  test("erro: mostra a mensagem e tenta de novo", async () => {
    notaApi.emitirNotaFiscal.mockResolvedValue({ id: 1, status: "processing" });
    const aoAtualizar = jest.fn();
    render(
      <AcoesNotaPlataforma
        fatura={fatura({
          status: "error",
          errorMessage: "CNPJ do tomador inválido"
        })}
        dadosFiscaisCompletos
        aoAtualizar={aoAtualizar}
      />
    );
    expect(
      screen.getByLabelText("notaFiscal.erro: CNPJ do tomador inválido")
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "notaFiscal.tentarDeNovo" })
    );
    await waitFor(() =>
      expect(aoAtualizar).toHaveBeenCalledWith({ id: 1, status: "processing" })
    );
  });

  test("emitida: menu com PDF, XML e cancelar com motivo obrigatório", async () => {
    notaApi.cancelarNotaFiscal.mockResolvedValue({
      id: 1,
      status: "cancelling"
    });
    const aoAtualizar = jest.fn();
    render(
      <AcoesNotaPlataforma
        fatura={fatura({
          status: "issued",
          number: "45",
          hasPdf: true,
          hasXml: true
        })}
        dadosFiscaisCompletos
        aoAtualizar={aoAtualizar}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "notaFiscal.baixar" }));
    fireEvent.click(await screen.findByText("notaFiscal.baixarXml"));
    await waitFor(() =>
      expect(notaApi.baixarNotaFiscal).toHaveBeenCalledWith(
        "plataforma",
        28,
        "xml"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "notaFiscal.baixar" }));
    fireEvent.click(await screen.findByText("notaFiscal.cancelar"));
    const dialogo = await screen.findByRole("dialog");
    const confirmar = within(dialogo).getByRole("button", {
      name: "notaFiscal.dialogo.cancelarConfirmar"
    });
    const motivo = within(dialogo).getByLabelText(
      "notaFiscal.dialogo.motivoCancelamento"
    );
    fireEvent.change(motivo, { target: { value: "curto" } });
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(motivo, {
      target: { value: "Valor cobrado em duplicidade no mês" }
    });
    expect(confirmar.disabled).toBe(false);
    fireEvent.click(confirmar);
    await waitFor(() =>
      expect(notaApi.cancelarNotaFiscal).toHaveBeenCalledWith(
        28,
        "Valor cobrado em duplicidade no mês"
      )
    );
    expect(aoAtualizar).toHaveBeenCalledWith({ id: 1, status: "cancelling" });
  });

  test("em emissão e cancelada: só indicador desabilitado com texto", () => {
    const { rerender } = render(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "processing" })}
        aoAtualizar={jest.fn()}
      />
    );
    expect(screen.getByLabelText("notaFiscal.emEmissao")).toBeTruthy();
    rerender(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "cancelled" })}
        aoAtualizar={jest.fn()}
      />
    );
    expect(screen.getByLabelText("notaFiscal.cancelada")).toBeTruthy();
  });

  test("fatura não paga: nenhuma ação de nota", () => {
    const { container } = render(
      <AcoesNotaPlataforma
        fatura={fatura(null, { status: "open", situacao: "overdue" })}
        dadosFiscaisCompletos
        aoAtualizar={jest.fn()}
      />
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("DialogoDadosFiscais", () => {
  const campo = rotulo => screen.getByLabelText(new RegExp(`^${rotulo}`));

  test("CEP preenche o endereço e salva no formato do contrato", async () => {
    notaApi.carregarDadosFiscais.mockRejectedValue({
      response: { status: 404 }
    });
    notaApi.buscarCep.mockResolvedValue({
      street: "Avenida Exemplo",
      district: "Centro",
      city: "São Paulo",
      cityIbgeCode: "3550308",
      state: "SP"
    });
    notaApi.salvarDadosFiscais.mockResolvedValue({ complete: true });
    const aoSalvo = jest.fn();
    const aoFechar = jest.fn();
    render(
      <DialogoDadosFiscais
        aberto
        companyId={7}
        nome="Cliente Exemplo"
        aoFechar={aoFechar}
        aoSalvo={aoSalvo}
      />
    );
    await waitFor(() =>
      expect(notaApi.carregarDadosFiscais).toHaveBeenCalledWith(7)
    );
    await waitFor(() =>
      expect(campo("notaFiscal.dados.documento").disabled).toBe(false)
    );

    fireEvent.change(campo("notaFiscal.dados.documento"), {
      target: { value: "11222333000181" }
    });
    expect(campo("notaFiscal.dados.documento").value).toBe(
      "11.222.333/0001-81"
    );
    fireEvent.change(campo("notaFiscal.dados.razaoSocial"), {
      target: { value: "Cliente Exemplo Ltda" }
    });
    fireEvent.change(campo("notaFiscal.dados.email"), {
      target: { value: "nota@exemplo.com.br" }
    });
    fireEvent.change(campo("notaFiscal.dados.cep"), {
      target: { value: "01310100" }
    });
    expect(notaApi.buscarCep).toHaveBeenCalledWith("01310100");
    await waitFor(() =>
      expect(campo("notaFiscal.dados.rua").value).toBe("Avenida Exemplo")
    );
    expect(campo("notaFiscal.dados.cidade").value).toBe("São Paulo");
    fireEvent.change(campo("notaFiscal.dados.numero"), {
      target: { value: "100" }
    });

    fireEvent.click(
      screen.getByRole("button", { name: "notaFiscal.dados.salvar" })
    );
    await waitFor(() => expect(notaApi.salvarDadosFiscais).toHaveBeenCalled());
    expect(notaApi.salvarDadosFiscais).toHaveBeenCalledWith(7, {
      documentType: "cnpj",
      document: "11222333000181",
      legalName: "Cliente Exemplo Ltda",
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
    await waitFor(() =>
      expect(aoSalvo).toHaveBeenCalledWith({ complete: true })
    );
    expect(aoFechar).toHaveBeenCalled();
  });

  test("CPF inválido não é enviado e mostra o erro no campo", async () => {
    notaApi.carregarDadosFiscais.mockResolvedValue({
      document: "52998224724",
      legalName: "Pessoa Exemplo",
      email: "pessoa@exemplo.com",
      address: {
        zipCode: "01310100",
        street: "Rua A",
        number: "1",
        district: "Centro",
        city: "São Paulo",
        state: "SP"
      },
      complete: false
    });
    render(<DialogoDadosFiscais aberto aoFechar={jest.fn()} />);
    await waitFor(() =>
      expect(campo("notaFiscal.dados.razaoSocial").value).toBe("Pessoa Exemplo")
    );
    expect(notaApi.carregarDadosFiscais).toHaveBeenCalledWith(undefined);
    fireEvent.click(
      screen.getByRole("button", { name: "notaFiscal.dados.salvar" })
    );
    expect(
      await screen.findByText("notaFiscal.dados.documentoInvalido")
    ).toBeTruthy();
    expect(notaApi.salvarDadosFiscais).not.toHaveBeenCalled();
  });
});
