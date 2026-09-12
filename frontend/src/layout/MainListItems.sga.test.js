import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MainListItems from "./MainListItems";
import CaminhoPagina from "./CaminhoPagina";
import { AuthContext } from "../context/Auth/AuthContext";
import { WhatsAppsContext } from "../context/WhatsApp/WhatsAppsContext";
import { SocketContext } from "../context/Socket/SocketContext";
import api from "../services/api";
import { messages } from "../translate/languages";

jest.mock("../translate/i18n", () => ({ i18n: { t: key => key } }));
jest.mock("../context/Auth/AuthContext", () => ({
  AuthContext: require("react").createContext({})
}));
jest.mock("../context/WhatsApp/WhatsAppsContext", () => ({
  WhatsAppsContext: require("react").createContext({})
}));
jest.mock("../context/Socket/SocketContext", () => ({
  SocketContext: require("react").createContext({})
}));
jest.mock("../services/api", () => ({ get: jest.fn() }));
jest.mock("../errors/toastError", () => jest.fn());

const socketManager = {
  GetSocket: () => ({ on: jest.fn(), disconnect: jest.fn() })
};
const view = companyId => (
  <MemoryRouter initialEntries={["/sga"]}>
    <AuthContext.Provider
      value={{ user: { id: 1, companyId, profile: "admin" } }}
    >
      <WhatsAppsContext.Provider value={{ whatsApps: [] }}>
        <SocketContext.Provider value={socketManager}>
          <MainListItems drawerOpen drawerClose={() => {}} />
          <CaminhoPagina organizacao="AC Norte" />
        </SocketContext.Provider>
      </WhatsAppsContext.Provider>
    </AuthContext.Provider>
  </MemoryRouter>
);

it("mantém Placas na navegação redesenhada e o título da página quando habilitado", async () => {
  api.get.mockResolvedValue({ data: { enabled: true, records: [] } });
  const { rerender } = render(view(9));
  const link = await screen.findByRole("link", { name: "sga.title" });
  expect(link.getAttribute("href")).toBe("/sga");
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "fluxos.titulo" })).toBeTruthy();
  expect(screen.getByRole("navigation").textContent).toContain("sga.title");
  api.get.mockResolvedValue({ data: { enabled: false, records: [] } });
  rerender(view(8));
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: "sga.title" })).toBeNull()
  );
});

it("preserva simultaneamente as traduções do SGA e das novas conversas", () => {
  ["pt", "pt_PT"].forEach(language => {
    const translations = messages[language].translations;
    expect(translations.sga.title).toBe("Placas");
    expect(translations.sga.managedField).toContain("SGA");
    expect(translations.conversa.cadastro).toBeTruthy();
    expect(translations.fluxos.titulo).toBeTruthy();
  });
});
