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
    t: (key, vars) => {
      if (!vars) return key;
      const { interpolation, ...resto } = vars;
      return `${key} ${JSON.stringify(resto)}`;
    },
    exists: key => !key.endsWith(".CANCEL_DESCONHECIDO")
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
  corrigirNotaFiscal: jest.fn(),
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
        "pdf",
        "123"
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

  test("erro: mostra a mensagem e tenta de novo só depois de confirmar", async () => {
    notaApi.previaNotaFiscal.mockResolvedValue({
      tomador: { name: "Cliente Exemplo D", document: "52998224725" },
      value: 350,
      competencia: "2026-11"
    });
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
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("Cliente Exemplo D");
    expect(
      within(dialogo).getByText(/notaFiscal.dialogo.tentarTitulo/)
    ).toBeTruthy();
    expect(notaApi.emitirNotaFiscal).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "notaFiscal.tentarDeNovo" })
    );
    await waitFor(() =>
      expect(aoAtualizar).toHaveBeenCalledWith({ id: 1, status: "processing" })
    );
    expect(notaApi.emitirNotaFiscal).toHaveBeenCalledWith(28);
  });

  test("tentar de novo com nota já existente (409): recarrega a linha", async () => {
    notaApi.previaNotaFiscal.mockResolvedValue({
      tomador: { name: "Cliente Exemplo D" },
      value: 350
    });
    const erro = {
      response: { status: 409, data: { error: "ERR_FISCAL_NOTE_EXISTS" } }
    };
    notaApi.emitirNotaFiscal.mockRejectedValue(erro);
    const aoRecarregar = jest.fn();
    render(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "error", errorMessage: "Falha" })}
        dadosFiscaisCompletos
        aoAtualizar={jest.fn()}
        aoRecarregar={aoRecarregar}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "notaFiscal.tentarDeNovo" })
    );
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("Cliente Exemplo D");
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "notaFiscal.tentarDeNovo" })
    );
    await waitFor(() => expect(aoRecarregar).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith(erro);
  });

  test("logo após a baixa: mostra preparando em vez de Emitir", () => {
    const { rerender } = render(
      <AcoesNotaPlataforma
        fatura={fatura(null)}
        dadosFiscaisCompletos
        aguardandoNota
        aoAtualizar={jest.fn()}
      />
    );
    expect(screen.getByLabelText("notaFiscal.preparando")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /notaFiscal.emitirDe/ })
    ).toBeNull();
    rerender(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "processing" })}
        dadosFiscaisCompletos
        aguardandoNota
        aoAtualizar={jest.fn()}
      />
    );
    expect(screen.getByLabelText("notaFiscal.emEmissao")).toBeTruthy();
  });

  test("emitida, sem permissão de super: menu sem Cancelar", async () => {
    render(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "issued", number: "45", hasXml: true })}
        dadosFiscaisCompletos
        aoAtualizar={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "notaFiscal.baixar" }));
    await screen.findByText("notaFiscal.baixarPdf");
    expect(screen.getByText("notaFiscal.baixarXml")).toBeTruthy();
    expect(screen.queryByText("notaFiscal.cancelar")).toBeNull();
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
        podeCancelar
        aoAtualizar={aoAtualizar}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "notaFiscal.baixar" }));
    fireEvent.click(await screen.findByText("notaFiscal.baixarXml"));
    await waitFor(() =>
      expect(notaApi.baixarNotaFiscal).toHaveBeenCalledWith(
        "plataforma",
        28,
        "xml",
        "45"
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

  test("CEP inexistente: diz não encontrado e impede salvar", async () => {
    notaApi.carregarDadosFiscais.mockRejectedValue({
      response: { status: 404 }
    });
    notaApi.buscarCep.mockRejectedValue({
      response: { status: 404, data: { error: "ERR_ZIPCODE_NOT_FOUND" } }
    });
    render(<DialogoDadosFiscais aberto aoFechar={jest.fn()} />);
    await waitFor(() =>
      expect(campo("notaFiscal.dados.cep").disabled).toBe(false)
    );
    fireEvent.change(campo("notaFiscal.dados.cep"), {
      target: { value: "99999999" }
    });
    expect(
      await screen.findByText("notaFiscal.dados.cepNaoEncontrado")
    ).toBeTruthy();
    expect(screen.queryByText("notaFiscal.dados.cepInvalido")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "notaFiscal.dados.salvar" })
    );
    expect(notaApi.salvarDadosFiscais).not.toHaveBeenCalled();
  });

  test("falha da consulta de CEP só avisa, sem bloquear", async () => {
    notaApi.carregarDadosFiscais.mockRejectedValue({
      response: { status: 404 }
    });
    notaApi.buscarCep.mockRejectedValue({ response: { status: 502 } });
    render(<DialogoDadosFiscais aberto aoFechar={jest.fn()} />);
    await waitFor(() =>
      expect(campo("notaFiscal.dados.cep").disabled).toBe(false)
    );
    fireEvent.change(campo("notaFiscal.dados.cep"), {
      target: { value: "01310100" }
    });
    expect(await screen.findByText("notaFiscal.dados.cepFalhou")).toBeTruthy();
    expect(screen.queryByText("notaFiscal.dados.cepNaoEncontrado")).toBeNull();
  });
});

describe("Corrigir nota e nota cancelada (Central de Cobrança)", () => {
  const emitida = extra =>
    fatura({
      status: "issued",
      number: "45",
      hasPdf: true,
      tomador: {
        name: "Cliente Exemplo Ltda",
        documentType: "cnpj",
        documentMasked: "11.***.***/0001-81",
        email: "nota@exemplo.com.br"
      },
      ...extra
    });

  test("menu mostra o tomador usado na nota e, para super, Corrigir", async () => {
    render(
      <AcoesNotaPlataforma
        fatura={emitida()}
        dadosFiscaisCompletos
        podeCancelar
        aoAtualizar={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "notaFiscal.baixar" }));
    expect(
      await screen.findByText(/notaFiscal.tomadorNota.*Cliente Exemplo Ltda/)
    ).toBeTruthy();
    expect(screen.getByText("notaFiscal.corrigir")).toBeTruthy();
    expect(screen.getByText("notaFiscal.cancelar")).toBeTruthy();
  });

  test("sem super: nem Corrigir nem Cancelar", async () => {
    render(
      <AcoesNotaPlataforma
        fatura={emitida()}
        dadosFiscaisCompletos
        aoAtualizar={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "notaFiscal.baixar" }));
    await screen.findByText("notaFiscal.baixarPdf");
    expect(screen.queryByText("notaFiscal.corrigir")).toBeNull();
    expect(screen.queryByText("notaFiscal.cancelar")).toBeNull();
  });

  test("Corrigir: formulário preenchido → salvar → confirmação com motivo padrão → replace", async () => {
    notaApi.carregarDadosFiscais.mockResolvedValue({
      document: "11222333000181",
      legalName: "Cliente Exemplo Ltda",
      email: "antigo@exemplo.com.br",
      address: {
        zipCode: "01310100",
        street: "Avenida Exemplo",
        number: "100",
        district: "Centro",
        city: "São Paulo",
        state: "SP"
      },
      complete: true
    });
    notaApi.salvarDadosFiscais.mockResolvedValue({ complete: true });
    const atualizada = {
      id: 1,
      status: "cancelling",
      replacementPending: true
    };
    notaApi.corrigirNotaFiscal.mockResolvedValue(atualizada);
    const aoAtualizar = jest.fn();
    const aoDadosSalvos = jest.fn();
    render(
      <AcoesNotaPlataforma
        fatura={emitida()}
        dadosFiscaisCompletos
        podeCancelar
        aoAtualizar={aoAtualizar}
        aoDadosSalvos={aoDadosSalvos}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "notaFiscal.baixar" }));
    fireEvent.click(await screen.findByText("notaFiscal.corrigir"));

    const email = await screen.findByLabelText(/^notaFiscal.dados.email/);
    await waitFor(() => expect(email.value).toBe("antigo@exemplo.com.br"));
    expect(notaApi.carregarDadosFiscais).toHaveBeenCalledWith(7);
    fireEvent.change(email, { target: { value: "novo@exemplo.com.br" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "notaFiscal.dialogo.salvarEContinuar"
      })
    );
    await waitFor(() => expect(notaApi.salvarDadosFiscais).toHaveBeenCalled());
    expect(notaApi.salvarDadosFiscais.mock.calls[0][1].email).toBe(
      "novo@exemplo.com.br"
    );
    expect(aoDadosSalvos).toHaveBeenCalled();

    const confirmacao = await screen.findByRole("dialog", {
      name: "notaFiscal.dialogo.corrigirTitulo"
    });
    expect(
      within(confirmacao).getByText(/notaFiscal.dialogo.corrigirPergunta.*45/)
    ).toBeTruthy();
    const motivo = within(confirmacao).getByLabelText(
      "notaFiscal.dialogo.motivoCancelamento"
    );
    expect(motivo.value).toBe("notaFiscal.dialogo.corrigirMotivoPadrao");
    fireEvent.change(motivo, {
      target: { value: "Substituição por correção de dados do tomador" }
    });
    expect(notaApi.corrigirNotaFiscal).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmacao).getByRole("button", {
        name: "notaFiscal.dialogo.corrigirConfirmar"
      })
    );
    await waitFor(() =>
      expect(notaApi.corrigirNotaFiscal).toHaveBeenCalledWith(
        28,
        "Substituição por correção de dados do tomador"
      )
    );
    expect(aoAtualizar).toHaveBeenCalledWith(atualizada);
  });

  test("estados da correção: cancelando, emitindo nova e cancelamento recusado", () => {
    const { rerender } = render(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "cancelling", replacementPending: true })}
        aoAtualizar={jest.fn()}
      />
    );
    expect(screen.getByLabelText("notaFiscal.corrigindo")).toBeTruthy();
    rerender(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "cancelled", replacementPending: true })}
        aoAtualizar={jest.fn()}
      />
    );
    expect(screen.getByLabelText("notaFiscal.reemitindo")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /notaFiscal.emitirNovaDe/ })
    ).toBeNull();
    rerender(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "processing", replacesNumber: "45" })}
        aoAtualizar={jest.fn()}
      />
    );
    expect(screen.getByLabelText(/notaFiscal.reemitindoDe.*45/)).toBeTruthy();
    rerender(
      <AcoesNotaPlataforma
        fatura={emitida({ cancelStatusDetail: "CANCEL_REJECTED" })}
        aoAtualizar={jest.fn()}
      />
    );
    expect(
      screen.getByLabelText(/notaFiscal.cancelamentoRecusado/)
    ).toBeTruthy();
    rerender(
      <AcoesNotaPlataforma
        fatura={emitida({ cancelStatusDetail: "CANCEL_PENDING_ANALYSIS" })}
        aoAtualizar={jest.fn()}
      />
    );
    expect(
      screen.getByLabelText("notaFiscal.cancelamentoAnalise")
    ).toBeTruthy();
  });

  test("nota cancelada: Emitir nova nota com confirmação", async () => {
    notaApi.previaNotaFiscal.mockResolvedValue({
      tomador: { name: "Cliente Exemplo Ltda", document: "11222333000181" },
      value: 1100,
      competencia: "2026-11"
    });
    const nova = { id: 2, status: "processing" };
    notaApi.emitirNotaFiscal.mockResolvedValue(nova);
    const aoAtualizar = jest.fn();
    render(
      <AcoesNotaPlataforma
        fatura={fatura({ status: "cancelled", number: "45" })}
        dadosFiscaisCompletos
        aoAtualizar={aoAtualizar}
      />
    );
    expect(screen.getByLabelText("notaFiscal.cancelada")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /notaFiscal.emitirNovaDe/ })
    );
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("Cliente Exemplo Ltda");
    expect(notaApi.emitirNotaFiscal).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "notaFiscal.emitirNova" })
    );
    await waitFor(() => expect(aoAtualizar).toHaveBeenCalledWith(nova));
  });
});

describe("BotaoNotaCliente com nota corrigida", () => {
  test("nova nota em emissão após a correção e tomador no tooltip da emitida", () => {
    const { rerender } = render(
      <BotaoNotaCliente
        fatura={fatura({ status: "processing", replacesNumber: "45" })}
      />
    );
    expect(
      screen.getByRole("button", { name: /notaFiscal.emEmissao/ }).disabled
    ).toBe(true);
    rerender(
      <BotaoNotaCliente
        fatura={fatura({
          status: "issued",
          number: "46",
          tomador: {
            name: "Cliente Exemplo Ltda",
            email: "novo@exemplo.com.br"
          }
        })}
      />
    );
    expect(
      screen.getByRole("button", { name: "notaFiscal.baixar" })
    ).toBeTruthy();
  });
});
