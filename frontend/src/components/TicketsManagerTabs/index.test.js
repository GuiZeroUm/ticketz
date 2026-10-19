import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "react-toastify";
import TicketsManagerTabs from ".";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { SocketContext } from "../../context/Socket/SocketContext";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import { EMAIL_ACCOUNT_OPTIONS_PATH } from "../../hooks/useEmailAccountOptions";
import { i18n } from "../../translate/i18n";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));
jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() }
}));
jest.mock("../../errors/toastError", () => jest.fn());
jest.mock("../../hooks/useEmailAvailability", () => () => ({
  enabled: true,
  loading: false,
  gmailConfigured: true
}));
jest.mock("../../hooks/useTicketChannelCounts", () => ({
  __esModule: true,
  default: () => null,
  formatChannelCount: () => ""
}));
jest.mock("../../hooks/useSettings", () => () => ({
  getSetting: () => Promise.resolve("disabled")
}));
jest.mock("../TicketsListCustom", () => () => null);
jest.mock("../NewTicketModal", () => () => null);
jest.mock("../TicketsQueueSelect", () => () => null);
jest.mock("../TagsFilter", () => ({ TagsFilter: () => null }));
jest.mock("../UsersFilter", () => ({ UsersFilter: () => null }));
jest.mock("../ContactSelect", () => ({ ContactSelect: () => null }));

const socket = { on: jest.fn(), emit: jest.fn(), disconnect: jest.fn() };
const socketManager = { GetSocket: () => socket, onConnect: jest.fn() };
const user = {
  id: 5,
  companyId: 1,
  profile: "user",
  queues: [],
  company: { whatsappMode: "normal" }
};
const whatsApps = [
  { id: 1, name: "Suporte", channel: "whatsapp", apiMode: "baileys" }
];

const renderInbox = () =>
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user }}>
        <SocketContext.Provider value={socketManager}>
          <WhatsAppsContext.Provider value={{ whatsApps, loading: false }}>
            <TicketsManagerTabs />
          </WhatsAppsContext.Provider>
        </SocketContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>
  );

const optionLabels = () =>
  Array.from(document.querySelectorAll("option")).map(
    option => option.textContent
  );

describe("TicketsManagerTabs connection filter", () => {
  beforeAll(() => i18n.changeLanguage("pt"));
  beforeEach(() => jest.clearAllMocks());

  it("lists the email accounts for a non-admin user", async () => {
    api.get.mockImplementation(url =>
      url === EMAIL_ACCOUNT_OPTIONS_PATH
        ? Promise.resolve({
            data: [
              {
                id: 7,
                name: "Comercial",
                address: "comercial@empresa.com",
                preset: "gmail",
                provider: "gmail_api",
                status: "active"
              }
            ]
          })
        : Promise.resolve({ data: [] })
    );
    renderInbox();
    await waitFor(() => expect(optionLabels()).toContain("Gmail · Comercial"));
    expect(optionLabels()).toContain("WhatsApp · Suporte");
    expect(
      screen.getByLabelText(i18n.t("emailChannel.inbox.filters.connection"))
    ).toBeTruthy();
    // the admin-only list is never requested
    expect(api.get).not.toHaveBeenCalledWith("/email/accounts");
  });

  it("falls back to WhatsApp connections without a toast when the endpoint fails", async () => {
    api.get.mockImplementation(url =>
      url === EMAIL_ACCOUNT_OPTIONS_PATH
        ? Promise.reject({ response: { status: 404, data: {} } })
        : Promise.resolve({ data: [] })
    );
    renderInbox();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(EMAIL_ACCOUNT_OPTIONS_PATH)
    );
    await waitFor(() =>
      expect(optionLabels()).toEqual([
        i18n.t("emailChannel.inbox.filters.allConnections"),
        "WhatsApp · Suporte"
      ])
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
