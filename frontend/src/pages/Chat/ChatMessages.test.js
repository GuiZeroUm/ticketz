import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@material-ui/core/styles";
import ChatMessages from "./ChatMessages";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import MicRecorder from "mic-recorder-to-mp3";

jest.mock("../../services/config", () => ({ getBackendURL: () => "/backend" }));
jest.mock("../../services/api", () => ({ post: jest.fn() }));
jest.mock("../../errors/toastError", () => jest.fn());
jest.mock("../../context/Auth/AuthContext", () => ({
  AuthContext: require("react").createContext({})
}));
jest.mock("../../translate/i18n", () => ({
  i18n: {
    language: "pt",
    t: (key, args) => (args?.name ? `${key} ${args.name}` : key)
  }
}));
jest.mock("mic-recorder-to-mp3", () => jest.fn(() => ({ stop: jest.fn() })));
jest.mock("../../components/MediaGalleryLightbox", () => ({
  __esModule: true,
  default: () => null,
  buildMediaGalleryData: () => ({ slides: [], byMessageId: {} })
}));
jest.mock("../../components/AudioMessage", () => ({
  __esModule: true,
  default: ({ src }) => <audio src={src} />
}));

const theme = createTheme({
  palette: {
    chatlist: { main: "white" },
    chatBubbleReceived: { main: "white" },
    chatBubbleFromMe: { main: "white" }
  }
});
const setup = (messages = [], companySlug) =>
  render(
    <ThemeProvider theme={theme}>
      <AuthContext.Provider
        value={{ user: { id: 1, name: "QA", company: { slug: companySlug } } }}
      >
        <ChatMessages
          chat={{ id: 7 }}
          messages={messages}
          handleSendMessage={jest.fn()}
          handleLoadMore={jest.fn()}
          scrollToBottomRef={{ current: null }}
          pageInfo={{ hasMore: false }}
        />
      </AuthContext.Provider>
    </ThemeProvider>
  );
const image = () => new File(["png"], "preview.png", { type: "image/png" });
beforeEach(() => {
  MicRecorder.mockImplementation(() => ({ stop: jest.fn() }));
  URL.createObjectURL = jest.fn(() => "blob:preview");
  URL.revokeObjectURL = jest.fn();
  api.post.mockResolvedValue({ data: {} });
});
test("usa o compositor compacto somente no chat interno da AC Norte", () => {
  const { container, unmount } = setup([], "acnorte");
  expect(container.querySelector(".chat-compositor--compact")).toBeTruthy();
  expect(screen.queryByText("conversa.responder")).toBeNull();

  unmount();
  const legacy = setup([], "outro-tenant");
  expect(
    legacy.container.querySelector(".chat-compositor--compact")
  ).toBeNull();
  expect(screen.getByText("conversa.responder")).toBeTruthy();
});
test("keeps draft editable with image preview, sends caption and clears only after success", async () => {
  const { container } = setup();
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Minha legenda" } });
  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: { files: [image()] }
  });
  expect(screen.getByAltText("preview.png").getAttribute("src")).toBe(
    "blob:preview"
  );
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input.value).toBe("Minha legenda");
  await act(async () =>
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
  );
  expect(api.post).toHaveBeenCalledTimes(1);
  const [url, form] = api.post.mock.calls[0];
  expect(url).toBe("/chats/7/messages");
  expect(form.get("message")).toBe("Minha legenda");
  expect(form.getAll("medias")).toHaveLength(1);
  expect(input.value).toBe("");
  expect(screen.queryByAltText("preview.png")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});
test("retains attachment and caption on failure, prevents concurrent sends", async () => {
  let fail;
  api.post.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  const { container } = setup();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Não perder" }
  });
  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: { files: [image()] }
  });
  fireEvent.click(screen.getByLabelText("conversa.enviar"));
  fireEvent.click(screen.getByLabelText("conversa.enviar"));
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error("offline")));
  expect(toastError).toHaveBeenCalled();
  expect(screen.getByRole("textbox").value).toBe("Não perder");
  expect(screen.getByAltText("preview.png")).toBeTruthy();
});
test("removes individual files without losing text and releases preview URLs", () => {
  const { container, unmount } = setup();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Rascunho" }
  });
  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: {
      files: [
        image(),
        new File(["pdf"], "document.pdf", { type: "application/pdf" })
      ]
    }
  });
  fireEvent.click(screen.getByLabelText("conversa.removerAnexo preview.png"));
  expect(screen.queryByAltText("preview.png")).toBeNull();
  expect(screen.getByText("document.pdf")).toBeTruthy();
  expect(screen.getByRole("textbox").value).toBe("Rascunho");
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});
test("repairs existing image and audio URLs and hides legacy duplicate filenames", () => {
  const { container } = setup(
    ["image", "audio"].map((type, i) => ({
      id: i + 1,
      senderId: 1,
      sender: { name: "QA" },
      createdAt: new Date().toISOString(),
      mediaType: type,
      mediaName: `${type}.png`,
      message: `${type}.png`,
      mediaPath: `https://dev.espacowhats.com.br/backend/public/${type}.png`
    }))
  );
  expect(screen.getByAltText("image.png").getAttribute("src")).toBe(
    "/backend/public/image.png"
  );
  expect(container.querySelector("audio").getAttribute("src")).toBe(
    "/backend/public/audio.png"
  );
  expect(container.querySelectorAll(".chat-texto")).toHaveLength(0);
});
