import React from "react";
import { render, screen } from "@testing-library/react";
import TicketsListCustom from ".";
import useTickets from "../../hooks/useTickets";
import { AuthContext } from "../../context/Auth/AuthContext";
import { SocketContext } from "../../context/Socket/SocketContext";
import { i18n } from "../../translate/i18n";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));
jest.mock("../../errors/toastError", () => jest.fn());
jest.mock("../../hooks/useTickets", () => jest.fn());
jest.mock("../TicketListItemCustom", () => () => null);
jest.mock("../TicketsListSkeleton", () => () => null);

const socket = { on: jest.fn(), emit: jest.fn(), disconnect: jest.fn() };
const socketManager = { GetSocket: () => socket, onConnect: jest.fn() };
const user = { id: 1, profile: "admin", queues: [] };

const renderList = props =>
  render(
    <AuthContext.Provider value={{ user }}>
      <SocketContext.Provider value={socketManager}>
        <TicketsListCustom status="open" selectedQueueIds={[]} {...props} />
      </SocketContext.Provider>
    </AuthContext.Provider>
  );

describe("TicketsListCustom empty state and connection filter", () => {
  beforeAll(() => i18n.changeLanguage("pt"));
  beforeEach(() => {
    jest.clearAllMocks();
    useTickets.mockReturnValue({
      tickets: [],
      loading: false,
      refetch: jest.fn(),
      fetchSince: jest.fn()
    });
  });

  it("explains the channel/connection filter when it returns nothing", () => {
    renderList({ channel: "email", emailAccountId: 7, filtered: true });
    expect(
      screen.getByText(i18n.t("emailChannel.inbox.empty.message"))
    ).toBeTruthy();
    expect(useTickets).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channel: "email",
        emailAccountId: 7,
        whatsappId: undefined
      })
    );
  });

  it("keeps the original empty state without a channel filter", () => {
    renderList({});
    expect(
      screen.getByText(i18n.t("ticketsList.noTicketsMessage"))
    ).toBeTruthy();
    expect(
      screen.queryByText(i18n.t("emailChannel.inbox.empty.message"))
    ).toBeNull();
  });
});
