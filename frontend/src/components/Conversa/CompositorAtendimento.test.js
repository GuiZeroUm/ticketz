import React from "react";
import { render, screen } from "@testing-library/react";
import CompositorAtendimento from "./CompositorAtendimento";
import { AuthContext } from "../../context/Auth/AuthContext";

jest.mock("../../translate/i18n", () => ({
  i18n: { t: key => key }
}));
jest.mock("../MessageInputCustom", () => props => (
  <div data-compact={String(!!props.compact)} data-testid="message-input" />
));
jest.mock("../AnimatedIcon", () => ({
  MessageSquare: () => <span />,
  StickyNote: () => <span />,
  Send: () => <span />
}));
jest.mock("../interface", () => ({
  Botao: ({ children, ...props }) => <button {...props}>{children}</button>
}));
jest.mock("../../hooks/useTicketNotes", () => () => ({
  saveNote: jest.fn()
}));
jest.mock("../../errors/toastError", () => jest.fn());
jest.mock("../../context/Auth/AuthContext", () => ({
  AuthContext: require("react").createContext({})
}));

const renderComposer = slug =>
  render(
    <AuthContext.Provider value={{ user: { company: { slug } } }}>
      <CompositorAtendimento ticket={{ id: 10, isGroup: false, contact: {} }} />
    </AuthContext.Provider>
  );

it("remove o seletor Responder sem ação quando as notas usam o painel dedicado", () => {
  renderComposer("acnorte");

  expect(screen.getByTestId("message-input")).toBeTruthy();
  expect(screen.getByTestId("message-input").dataset.compact).toBe("true");
  expect(screen.queryByText("conversa.responder")).toBeNull();
});

it("preserva o seletor de resposta e nota dos demais tenants", () => {
  renderComposer("outro-tenant");

  expect(screen.getByText("conversa.responder")).toBeTruthy();
  expect(screen.getByText("conversa.nota")).toBeTruthy();
  expect(screen.getByTestId("message-input").dataset.compact).toBe("false");
});
