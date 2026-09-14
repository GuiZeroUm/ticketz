import { WAMessage } from "libzapitu-rf";
import Ticket from "../../../models/Ticket";
import Queue from "../../../models/Queue";
import QueueOption from "../../../models/QueueOption";
import { Session } from "../../../libs/wbot";
import CreateMessageService from "../../MessageServices/CreateMessageService";
import UpdateTicketService from "../../TicketServices/UpdateTicketService";
import { handleChartbot } from "../wbotMessageListener";

jest.mock("../../../libs/socket", () => ({
  getIO: jest.fn(() => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  }))
}));
jest.mock("../../../database", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../../helpers/GetTicketWbot", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../getJidOf", () => ({
  getJidOf: jest.fn(() => "5511999999999@s.whatsapp.net")
}));
jest.mock("../verifyContact", () => ({
  verifyContact: jest.fn()
}));
jest.mock("../../../queues/campaign", () => ({
  campaignQueue: { add: jest.fn() }
}));
jest.mock("../../../models/Queue", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../../models/QueueOption", () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), count: jest.fn(), findOne: jest.fn() }
}));
jest.mock("../../MessageServices/CreateMessageService", () => ({
  __esModule: true,
  default: jest.fn(async () => ({})),
  websocketCreateMessage: jest.fn()
}));
jest.mock("../../TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn(async () => ({}))
}));

const makeTicket = (queueOptionId: number | null = null) => {
  const ticket = {
    id: 10,
    companyId: 2,
    queueId: 3,
    queueOptionId,
    status: "pending",
    chatbot: true,
    contact: { id: 20 },
    update: jest.fn(async data => Object.assign(ticket, data)),
    reload: jest.fn(async () => ticket)
  };
  return ticket as unknown as Ticket;
};

const inboundMessage = {
  key: {
    id: "inbound",
    fromMe: false,
    remoteJid: "5511999999999@s.whatsapp.net"
  },
  message: { conversation: "1" }
} as WAMessage;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("handleChartbot dead-end recovery", () => {
  it("releases a ticket when a published queue no longer has active options", async () => {
    (Queue.findByPk as jest.Mock).mockResolvedValue({ options: [] });
    const ticket = makeTicket();
    const wbot = { sendMessage: jest.fn() } as unknown as Session;

    await handleChartbot(ticket, inboundMessage, wbot);

    expect(UpdateTicketService).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 10,
        companyId: 2,
        ticketData: { chatbot: false, queueOptionId: null }
      })
    );
    expect(wbot.sendMessage).not.toHaveBeenCalled();
  });

  it("sends a leaf message once and hands the pending ticket to humans", async () => {
    const option = {
      id: 30,
      option: "1",
      message: "Mensagem automática",
      mediaPath: null,
      options: [],
      exitChatbot: false,
      forwardQueueId: null
    };
    (Queue.findByPk as jest.Mock).mockResolvedValue({ options: [option] });
    (QueueOption.findByPk as jest.Mock).mockResolvedValue(option);
    const ticket = makeTicket();
    const sentMessage = {
      key: {
        id: "outbound",
        fromMe: true,
        remoteJid: "5511999999999@s.whatsapp.net"
      },
      message: { conversation: "Mensagem automática" },
      status: 1
    };
    const wbot = {
      sendMessage: jest.fn(async () => sentMessage)
    } as unknown as Session;

    await handleChartbot(ticket, inboundMessage, wbot);

    expect(wbot.sendMessage).toHaveBeenCalledTimes(1);
    expect(CreateMessageService).toHaveBeenCalledTimes(1);
    expect(UpdateTicketService).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketData: { chatbot: false, queueOptionId: null }
      })
    );
  });
});
