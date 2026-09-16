import { resolveMetaMediaKind } from "../SendMetaMediaMessageService";
import PersistMetaOutboundMessageService from "../PersistMetaOutboundMessageService";
import CreateMessageService from "../../MessageServices/CreateMessageService";
import Ticket from "../../../models/Ticket";

jest.mock("../../MessageServices/CreateMessageService", () => jest.fn());

const createMessage = CreateMessageService as jest.MockedFunction<
  typeof CreateMessageService
>;

describe("resolveMetaMediaKind", () => {
  it.each([
    ["image/jpeg", "image"],
    ["image/png", "image"],
    ["audio/ogg; codecs=opus", "audio"],
    ["audio/mpeg", "audio"],
    ["video/mp4", "video"],
    ["application/pdf", "document"]
  ])("mapeia %s para %s", (mimetype, expected) => {
    expect(resolveMetaMediaKind(mimetype).kind).toBe(expected);
  });

  it.each([
    ["audio/mp3", "audio", "audio/mpeg"],
    ["image/jpg", "image", "image/jpeg"]
  ])(
    "normaliza o apelido %s que a Cloud API nao reconhece",
    (mimetype, kind, normalized) => {
      expect(resolveMetaMediaKind(mimetype)).toMatchObject({
        kind,
        mimetype: normalized
      });
    }
  );

  it.each(["image/webp", "image/gif", "audio/webm", "video/quicktime"])(
    "manda %s como documento em vez de deixar a Meta recusar o formato",
    mimetype => {
      expect(resolveMetaMediaKind(mimetype).kind).toBe("document");
    }
  );

  it("aplica o limite de tamanho de cada tipo", () => {
    expect(resolveMetaMediaKind("image/png").limit).toBe(5 * 1024 * 1024);
    expect(resolveMetaMediaKind("audio/mpeg").limit).toBe(16 * 1024 * 1024);
    expect(resolveMetaMediaKind("application/pdf").limit).toBe(
      100 * 1024 * 1024
    );
  });
});

describe("PersistMetaOutboundMessageService", () => {
  const ticket = {
    id: 55,
    companyId: 9,
    update: jest.fn()
  } as unknown as Ticket;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("grava documentMessage no dataJson para o MessagesList renderizar o PDF", async () => {
    await PersistMetaOutboundMessageService({
      wamid: "wamid.1",
      body: "boleto-ac-norte.pdf",
      ticket,
      media: {
        mediaUrl: "media/9/1/55/abc/boleto-ac-norte.pdf",
        mimetype: "application/pdf",
        filename: "boleto-ac-norte.pdf",
        kind: "document"
      }
    });

    const { messageData } = createMessage.mock.calls[0][0] as never as {
      messageData: { mediaType: string; mediaUrl: string; dataJson: string };
    };

    expect(messageData.mediaType).toBe("application");
    expect(messageData.mediaUrl).toBe("media/9/1/55/abc/boleto-ac-norte.pdf");
    expect(JSON.parse(messageData.dataJson).message.documentMessage).toEqual({
      fileName: "boleto-ac-norte.pdf",
      mimetype: "application/pdf"
    });
  });

  it("nao inventa documentMessage para imagem, que renderiza pelo mediaType", async () => {
    await PersistMetaOutboundMessageService({
      wamid: "wamid.2",
      body: "",
      ticket,
      media: {
        mediaUrl: "media/9/1/55/abc/foto.jpg",
        mimetype: "image/jpeg",
        filename: "foto.jpg",
        kind: "image"
      }
    });

    const { messageData } = createMessage.mock.calls[0][0] as never as {
      messageData: { mediaType: string; dataJson: string };
    };

    expect(messageData.mediaType).toBe("image");
    expect(JSON.parse(messageData.dataJson).message).toBeUndefined();
  });

  it("mantem o contrato antigo de mensagem de texto sem midia", async () => {
    await PersistMetaOutboundMessageService({
      wamid: "wamid.3",
      body: "oi",
      ticket
    });

    const { messageData } = createMessage.mock.calls[0][0] as never as {
      messageData: {
        mediaType?: string;
        mediaUrl?: string;
        dataJson: string;
      };
    };

    expect(messageData.mediaUrl).toBeUndefined();
    expect(messageData.mediaType).toBeUndefined();
    expect(JSON.parse(messageData.dataJson)).toEqual({
      wamid: "wamid.3",
      body: "oi",
      source: "meta-cloud-api"
    });
  });
});
