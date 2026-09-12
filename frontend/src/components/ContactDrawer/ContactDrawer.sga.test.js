import React from "react";
import { render, screen } from "@testing-library/react";
import ContactDrawer from "./index";

jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));
jest.mock("../interface", () => ({ useIdentidade: () => ({}) }));
jest.mock("./HistoricoContato", () => () => null);
jest.mock("../ContactDrawerSkeleton", () => () => null);
jest.mock("../ContactModal", () => () => null);
jest.mock("../TicketNotes", () => ({ TicketNotes: () => null }));
jest.mock("../TagsContainer", () => ({ TagsContainer: () => null }));
jest.mock(
  "../SgaContactCard",
  () =>
    ({ contactId, open }) =>
      open ? <div data-testid="sga-card">{contactId}</div> : null
);
jest.mock("react-whatsmarked", () => ({ children }) => <span>{children}</span>);
jest.mock("../../hooks/useSettings", () => () => ({
  getSetting: () => new Promise(() => {})
}));
jest.mock("../../services/api", () => ({
  get: () => new Promise(() => {})
}));

it("preserva veículos e campos automáticos na nova aba do contato, sem exibir o cartão para grupos", () => {
  const props = {
    open: true,
    handleDrawerClose: () => {},
    loading: false,
    contact: {
      id: 42,
      name: "Associado",
      number: "556899998888",
      email: "cliente@example.com",
      extraInfo: [
        {
          id: 1,
          name: "CPF/CNPJ",
          value: "123.456.789-09",
          managedBy: "acnorte-sga"
        },
        {
          id: 2,
          name: "Com boletos vencidos",
          value: "Não",
          managedBy: "acnorte-sga"
        }
      ]
    },
    ticket: { id: 10, isGroup: false }
  };
  const { rerender } = render(<ContactDrawer {...props} />);
  expect(screen.getByRole("tab", { name: "contexto.contato" })).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "contexto.atendimento" })
  ).toBeTruthy();
  expect(screen.getByRole("tab", { name: "contexto.historico" })).toBeTruthy();
  expect(screen.getByTestId("sga-card").textContent).toBe("42");
  expect(screen.getByText("*CPF/CNPJ:* 123.456.789-09")).toBeTruthy();
  expect(screen.getByText("*Com boletos vencidos:* Não")).toBeTruthy();
  rerender(<ContactDrawer {...props} ticket={{ id: 10, isGroup: true }} />);
  expect(screen.queryByTestId("sga-card")).toBeNull();
});
