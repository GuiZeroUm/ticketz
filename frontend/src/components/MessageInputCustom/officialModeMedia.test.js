import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import MessageInputCustom from "./index";
import { AuthContext } from "../../context/Auth/AuthContext";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { EditMessageContext } from "../../context/EditingMessage/EditingMessageContext";
import { SocketContext } from "../../context/Socket/SocketContext";

import api from "../../services/api";

jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));
jest.mock("../../services/api", () => ({
  post: jest.fn(),
  request: jest.fn()
}));
// withWidth's real implementation never resolves a width in jsdom (no
// matchMedia/theme provider here) and silently renders nothing - this test
// isn't about responsive behavior, so make it a pass-through HOC.
jest.mock("@material-ui/core/withWidth", () => ({
  __esModule: true,
  default: () => Component => Component,
  isWidthUp: () => true
}));

jest.mock("mic-recorder-to-mp3", () =>
  jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: () => ({ getMp3: jest.fn().mockResolvedValue([{}, new Blob()]) })
  }))
);

const fakeSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn()
};
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

describe("MessageInputCustom media controls", () => {
  beforeEach(() => {
    api.request.mockResolvedValue({ data: [] });
  });

  // Estes controles ficaram desabilitados enquanto midia na Cloud API nao
  // existia; a regressao a evitar agora e voltarem a ficar bloqueados.
  it.each(["official", "baileys"])(
    "mantem anexo e audio disponiveis numa conexao %s",
    apiMode => {
      mount({ apiMode });

      // IconButton renders as a <span> (component="span"), so MUI communicates
      // disabled state via aria-disabled, not the native `disabled` attribute.
      expect(screen.getByLabelText("upload")).not.toHaveAttribute(
        "aria-disabled",
        "true"
      );
      expect(screen.getByLabelText("showRecorder")).not.toHaveAttribute(
        "aria-disabled",
        "true"
      );
    }
  );

  // Gravar desabilita o resto da barra (anexo, texto, emoji), mas nao pode
  // desabilitar os proprios botoes da gravacao: sem eles o audio nao sai nem
  // cancela, e o atendente fica preso no cronometro.
  it("mantem cancelar e enviar clicaveis durante a gravacao", async () => {
    global.navigator.mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue({})
    };

    mount({ apiMode: "official" });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("showRecorder"));
    });

    expect(screen.getByLabelText("cancelRecording")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByLabelText("sendRecordedAudio")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});
