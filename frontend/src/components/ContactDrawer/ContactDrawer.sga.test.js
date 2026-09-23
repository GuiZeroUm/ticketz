import React from "react";
import { render, screen } from "@testing-library/react";
import ContactDrawer from "./index";
import { AuthContext } from "../../context/Auth/AuthContext";

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
jest.mock("../../context/Auth/AuthContext", () => ({
  AuthContext: require("react").createContext({})
}));

const renderDrawer = (props, profile = "admin") =>
  render(
    <AuthContext.Provider
      value={{ user: { profile, company: { slug: "acnorte" } } }}
    >
      <ContactDrawer {...props} />
    </AuthContext.Provider>
  );

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
  const { rerender } = renderDrawer(props);
  expect(screen.getByRole("tab", { name: "contexto.contato" })).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "contexto.atendimento" })
  ).toBeTruthy();
  expect(screen.getByRole("tab", { name: "contexto.historico" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "conversa.notas" })).toBeTruthy();
  expect(screen.getByTestId("sga-card").textContent).toBe("42");
  expect(screen.getByText("*CPF/CNPJ:* 123.456.789-09")).toBeTruthy();
  expect(screen.getByText("*Com boletos vencidos:* Não")).toBeTruthy();
  rerender(
    <AuthContext.Provider
      value={{ user: { profile: "admin", company: { slug: "acnorte" } } }}
    >
      <ContactDrawer {...props} ticket={{ id: 10, isGroup: true }} />
    </AuthContext.Provider>
  );
  expect(screen.queryByTestId("sga-card")).toBeNull();
});

it("oculta os dados de Placas para atendentes", () => {
  renderDrawer(
    {
      open: true,
      handleDrawerClose: () => {},
      loading: false,
      contact: { id: 42, name: "Associado", number: "556899998888" },
      ticket: { id: 10, isGroup: false }
    },
    "user"
  );
  expect(screen.queryByTestId("sga-card")).toBeNull();
});
