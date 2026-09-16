import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import MessageInputCustom from "./index";
import { AuthContext } from "../../context/Auth/AuthContext";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { EditMessageContext } from "../../context/EditingMessage/EditingMessageContext";
import { SocketContext } from "../../context/Socket/SocketContext";

import api from "../../services/api";

jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));
jest.mock("../../services/api", () => ({ post: jest.fn(), request: jest.fn() }));
// withWidth's real implementation never resolves a width in jsdom (no
// matchMedia/theme provider here) and silently renders nothing - this test
// isn't about responsive behavior, so make it a pass-through HOC.
jest.mock("@material-ui/core/withWidth", () => ({
  __esModule: true,
  default: () => Component => Component,
  isWidthUp: () => true
}));

const fakeSocket = { on: jest.fn(), off: jest.fn(), disconnect: jest.fn() };
const socketManager = { GetSocket: () => fakeSocket };

const baseTicket = {
  id: 1,
  status: "open",
  isGroup: false,
  contact: {}
};

const mount = whatsapp =>
  render(
    <SocketContext.Provider value={socketManager}>
      <AuthContext.Provider value={{ user: { name: "Agente" } }}>
        <ReplyMessageContext.Provider
          value={{ replyingMessage: null, setReplyingMessage: jest.fn() }}
        >
          <EditMessageContext.Provider
            value={{ editingMessage: null, setEditingMessage: jest.fn() }}
          >
            <MessageInputCustom
              ticket={{ ...baseTicket, whatsapp }}
              showTabGroups
            />
          </EditMessageContext.Provider>
        </ReplyMessageContext.Provider>
      </AuthContext.Provider>
    </SocketContext.Provider>
  );

describe("MessageInputCustom official-mode media restriction", () => {
  beforeEach(() => {
    api.request.mockResolvedValue({ data: [] });
  });

  it("disables attaching media and recording audio on an official-mode connection, with a tooltip", () => {
    mount({ apiMode: "official" });

    // IconButton renders as a <span> (component="span"), so MUI communicates
    // disabled state via aria-disabled + a CSS class, not the native
    // `disabled` attribute - toBeDisabled() only recognizes real form
    // controls, hence the aria-disabled assertion here.
    expect(screen.getByLabelText("upload")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByLabelText("showRecorder")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(
      screen.getAllByTitle("connections.toolTips.notAvailableOfficial").length
    ).toBeGreaterThan(0);
  });

  it("keeps attaching media and recording audio enabled on a Baileys connection", () => {
    mount({ apiMode: "baileys" });

    expect(screen.getByLabelText("upload")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByLabelText("showRecorder")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});
