import {
  TEMPLATE_BODY_LIMIT,
  templateNameForOffset,
  toTemplateBody
} from "../MetaTemplateFormat";
import { DEFAULT_STEPS } from "../../SgaBillingServices/policy";
import { reminderValues } from "../../SgaBillingServices/policy";

describe("templateNameForOffset", () => {
  it.each([
    [-5, "cobranca_antes_5"],
    [-1, "cobranca_antes_1"],
    [0, "cobranca_vencimento"],
    [30, "cobranca_depois_30"]
  ])("nomeia a etapa %i como %s", (offset, expected) => {
    expect(templateNameForOffset(offset)).toBe(expected);
  });

  it("nunca usa caractere que a Meta recusa no nome", () => {
    DEFAULT_STEPS.forEach(step => {
      expect(templateNameForOffset(step.offset)).toMatch(/^[a-z0-9_]+$/);
    });
  });
});

describe("toTemplateBody", () => {
  it("troca os marcadores do painel pelos posicionais da Meta", () => {
    const { text, variables } = toTemplateBody(
      "Olá, [nome]. Mensalidade de [valor] vence em [vencimento]."
    );

    expect(text).toBe("Olá, {{1}}. Mensalidade de {{2}} vence em {{3}}.");
    expect(variables).toEqual(["nome", "valor", "vencimento"]);
  });

  it("reaproveita o mesmo indice quando o marcador repete", () => {
    const { text, variables } = toTemplateBody(
      "[nome], confirmamos [valor]. Obrigado, [nome]."
    );

    expect(text).toBe("{{1}}, confirmamos {{2}}. Obrigado, {{1}}.");
    expect(variables).toEqual(["nome", "valor"]);
  });

  it("mantem o texto intacto quando nao ha marcador", () => {
    expect(toTemplateBody("Mensagem fixa.")).toEqual({
      text: "Mensagem fixa.",
      variables: []
    });
  });

  // Este e o contrato que liga as duas pontas: o parametro na posicao N do
  // envio tem que ser o valor do marcador que virou {{N}} na submissao.
  it("gera parametros na mesma ordem dos posicionais do template", () => {
    const body = "Vence [vencimento], valor [valor], titular [nome].";
    const { text, variables } = toTemplateBody(body);
    const values = reminderValues(
      "Maria Silva",
      { due: "2026-10-05", amount: 189.9 },
      "https://short.hinova.com.br/v2/abc.pdf"
    );

    const parameters = variables.map(key => values[key]);

    expect(text).toBe("Vence {{1}}, valor {{2}}, titular {{3}}.");
    expect(parameters[0]).toBe("05/10/2026");
    expect(parameters[2]).toBe("Maria Silva");
    expect(parameters[1]).toContain("189,90");
  });

  it("cabe no limite de corpo da Meta com os textos padrao da regua", () => {
    DEFAULT_STEPS.forEach(step => {
      expect(toTemplateBody(step.body).text.length).toBeLessThanOrEqual(
        TEMPLATE_BODY_LIMIT
      );
    });
  });
});
