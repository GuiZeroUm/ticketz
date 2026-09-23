import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
jest.mock("../../errors/toastError", () => jest.fn());
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

const mount = (replyingMessage = null) =>
  render(
    <SocketContext.Provider value={socketManager}>
      <AuthContext.Provider
        value={{ user: { name: "Agente", company: { slug: "acnorte" } } }}
      >
        <ReplyMessageContext.Provider
          value={{ replyingMessage, setReplyingMessage: jest.fn() }}
        >
          <EditMessageContext.Provider
            value={{ editingMessage: null, setEditingMessage: jest.fn() }}
          >
            <MessageInputCustom
              ticket={{ id: 1, status: "open", isGroup: false, contact: {} }}
              showTabGroups
            />
          </EditMessageContext.Provider>
        </ReplyMessageContext.Provider>
      </AuthContext.Provider>
    </SocketContext.Provider>
  );

describe("MessageInputCustom media caption", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
    api.post.mockResolvedValue({ data: {} });
    api.request.mockResolvedValue({ data: [] });
  });

  it("mantem o texto editavel e envia a midia com legenda", async () => {
    const { container } = mount();
    const input = screen.getByRole("textbox");
    const video = new File(["video"], "demonstracao.mp4", {
      type: "video/mp4"
    });

    fireEvent.change(input, { target: { value: "Segue a demonstração" } });
    fireEvent.change(container.querySelector("#upload-button"), {
      target: { files: [video] }
    });

    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveValue("Segue a demonstração");
    expect(screen.getByText("demonstracao.mp4")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("sendMessage"));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [url, form] = api.post.mock.calls[0];
    expect(url).toBe("/messages/1");
    expect(form.get("body")).toBe("*Agente:*\nSegue a demonstração");
    expect(form.getAll("medias")).toHaveLength(1);

    await waitFor(() => {
      expect(input).toHaveValue("");
      expect(screen.queryByText("demonstracao.mp4")).not.toBeInTheDocument();
    });
  });

  it("preserva a legenda e o anexo quando o envio falha", async () => {
    api.post.mockRejectedValueOnce(new Error("offline"));
    const { container } = mount();
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "Não perder este texto" } });
    fireEvent.change(container.querySelector("#upload-button"), {
      target: {
        files: [
          new File(["pdf"], "documento.pdf", {
            type: "application/pdf"
          })
        ]
      }
    });
    fireEvent.click(screen.getByLabelText("sendMessage"));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("Não perder este texto");
    expect(screen.getByText("documento.pdf")).toBeInTheDocument();
  });

  it("anexa arquivos colados sem apagar texto ou anexos existentes", () => {
    const { container } = mount();
    const input = screen.getByRole("textbox");
    const existing = new File(["pdf"], "existente.pdf", {
      type: "application/pdf"
    });
    const screenshot = new File(["image"], "image.png", {
      type: "image/png"
    });
    const second = new File(["image"], "outra.jpg", {
      type: "image/jpeg"
    });

    fireEvent.change(input, { target: { value: "Legenda preservada" } });
    fireEvent.change(container.querySelector("#upload-button"), {
      target: { files: [existing] }
    });
    fireEvent.paste(input, {
      clipboardData: {
        items: [screenshot, second].map(file => ({
          kind: "file",
          getAsFile: () => file
        })),
        files: []
      }
    });

    expect(input).toHaveValue("Legenda preservada");
    expect(screen.getByText(/existente\.pdf/)).toHaveTextContent("outra.jpg");
    expect(screen.getByText(/existente\.pdf/).textContent).toContain(
      "clipboard-"
    );
  });

  it("envia apenas o identificador da mensagem respondida", async () => {
    const { container } = mount({
      id: "wamid.reply",
      fromMe: false,
      body: "Mensagem original",
      contact: { name: "Cliente" }
    });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Segue o comprovante" } });
    fireEvent.change(container.querySelector("#upload-button"), {
      target: {
        files: [
          new File(["pdf"], "comprovante.pdf", {
            type: "application/pdf"
          })
        ]
      }
    });
    fireEvent.click(screen.getByLabelText("sendMessage"));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const form = api.post.mock.calls[0][1];
    expect(form.get("quotedMsgId")).toBe("wamid.reply");
    expect(form.get("quotedMsg")).toBeNull();
  });
});
