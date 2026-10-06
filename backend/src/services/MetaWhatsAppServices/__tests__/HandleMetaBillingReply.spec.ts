import { GetCompanySetting } from "../../../helpers/CheckSettings";
import ShowWhatsAppService from "../../WhatsappService/ShowWhatsAppService";
import {
  handleChartbot,
  verifyQueue
} from "../../WbotServices/wbotMessageListener";
import HandleMetaInboundFlowService from "../HandleMetaInboundFlowService";
import { logger } from "../../../utils/logger";

jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));
jest.mock("../../WhatsappService/ShowWhatsAppService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../WbotServices/wbotMessageListener", () => ({
  handleChartbot: jest.fn(),
  handleRating: jest.fn(),
  quickMessage: jest.fn(),
  verifyMessage: jest.fn(),
  verifyQueue: jest.fn()
}));
jest.mock("../MetaWbotAdapter", () => ({
  buildMetaWbot: jest.fn(() => ({})),
  metaInboundStub: jest.fn(() => ({}))
}));
jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));

it("keeps a reply to an automatic cobrança in Boletos without showing the chatbot", async () => {
  const ticket = {
    id: 77,
    companyId: 9,
    status: "pending",
    isGroup: false,
    userId: null,
    queueId: 11,
    queue: { id: 11, name: "BOLETOS" },
    chatbot: false,
    reload: jest.fn()
  };
  (GetCompanySetting as jest.Mock).mockResolvedValue("");
  (ShowWhatsAppService as jest.Mock).mockResolvedValue({
    queues: [{ id: 11 }]
  });

  await HandleMetaInboundFlowService({
    connection: { id: 16, companyId: 9 } as never,
    contact: { id: 42, disableBot: false } as never,
    ticket: ticket as never,
    body: "Preciso da segunda via",
    justCreated: false
  });

  expect(ticket.reload).toHaveBeenCalledTimes(1);
  expect(verifyQueue).not.toHaveBeenCalled();
  expect(handleChartbot).not.toHaveBeenCalled();
  expect(logger.error).not.toHaveBeenCalled();
  expect(ticket.queueId).toBe(11);
});
