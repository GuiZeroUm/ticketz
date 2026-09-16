import Whatsapp from "../../../models/Whatsapp";
import HandleMetaInboundMessageService from "../HandleMetaInboundMessageService";
import CreateOrUpdateContactService from "../../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketServiceMeta from "../../TicketServices/FindOrCreateTicketServiceMeta";
import CreateMessageService from "../../MessageServices/CreateMessageService";

jest.mock("../../ContactServices/CreateOrUpdateContactService", () =>
  jest.fn()
);
jest.mock("../../TicketServices/FindOrCreateTicketServiceMeta", () =>
  jest.fn()
);
jest.mock("../../MessageServices/CreateMessageService", () => jest.fn());
jest.mock("../DownloadMetaMediaService", () => jest.fn());
jest.mock("../../../helpers/saveMediaFile", () => jest.fn());
jest.mock("../HandleMetaInboundFlowService", () => ({
  __esModule: true,
  default: jest.fn(),
  captureMetaRating: jest.fn().mockResolvedValue(false)
}));
jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { count: jest.fn().mockResolvedValue(1) }
}));

const createContact = CreateOrUpdateContactService as jest.Mock;
const findTicket = FindOrCreateTicketServiceMeta as jest.Mock;
const createMessage = CreateMessageService as jest.Mock;

const whatsapp = { id: 16, companyId: 9 } as Whatsapp;
const ticket = { id: 55, status: "open", update: jest.fn() };

const inbound = (message: Record<string, unknown>) =>
  HandleMetaInboundMessageService(whatsapp, undefined, {
    id: "wamid.1",
    from: "5568999999999",
    timestamp: "1789000000",
    ...message
  } as never);

const savedMessage = () =>
  createMessage.mock.calls[0][0].messageData as {
    body: string;
    mediaType?: string;
    quotedMsgId?: string;
  };

describe("HandleMetaInboundMessageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createContact.mockResolvedValue({ id: 42 });
    findTicket.mockResolvedValue(ticket);
  });

  // A regressao a evitar: tipo fora da lista sumia sem deixar rastro, e o
  // atendente nao ficava sabendo que o cliente mandou algo.
  it("guarda a localizacao com link de mapa em vez de descartar", async () => {
    await inbound({
      type: "location",
      location: {
        latitude: -9.97,
        longitude: -67.8,
        name: "Oficina",
        address: "Rua X, 100"
      }
    });

    expect(savedMessage().body).toContain("Oficina - Rua X, 100");
    expect(savedMessage().body).toContain("-9.97,-67.8");
  });

  it("guarda o contato compartilhado com nome e telefone", async () => {
    await inbound({
      type: "contacts",
      contacts: [
        {
          name: { formatted_name: "Maria Silva" },
          phones: [{ phone: "+55 68 99999-0000" }]
        }
      ]
    });

    expect(savedMessage().body).toBe("👤 Maria Silva - +55 68 99999-0000");
  });

  it("prende a reacao na mensagem original, como o Baileys faz", async () => {
    await inbound({
      type: "reaction",
      reaction: { message_id: "wamid.original", emoji: "👍" }
    });

    expect(savedMessage()).toMatchObject({
      body: "👍",
      mediaType: "reactionMessage",
      quotedMsgId: "wamid.original"
    });
  });

  it.each([
    ["button", { button: { text: "Quero renegociar" } }, "Quero renegociar"],
    [
      "interactive",
      { interactive: { button_reply: { title: "Segunda via" } } },
      "Segunda via"
    ]
  ])("guarda a escolha de %s", async (type, payload, expected) => {
    await inbound({ type, ...payload });

    expect(savedMessage().body).toBe(expected);
  });

  it("nunca descarta um tipo desconhecido em silencio", async () => {
    await inbound({ type: "ephemeral_whatever" });

    expect(createMessage).toHaveBeenCalled();
    expect(savedMessage().body).toBe(
      "[mensagem não suportada: ephemeral_whatever]"
    );
  });

  it("mantem o texto simples intacto", async () => {
    await inbound({ type: "text", text: { body: "oi" } });

    expect(savedMessage().body).toBe("oi");
  });
});
