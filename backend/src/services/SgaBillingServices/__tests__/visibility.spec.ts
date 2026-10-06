import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import OutOfTicketMessage from "../../../models/OutOfTicketMessages";
import Queue from "../../../models/Queue";
import Tag from "../../../models/Tag";
import Ticket from "../../../models/Ticket";
import TicketTag from "../../../models/TicketTag";
import Whatsapp from "../../../models/Whatsapp";
import CreateMessageService from "../../MessageServices/CreateMessageService";
import FindOrCreateATicketTrakingService from "../../TicketServices/FindOrCreateATicketTrakingService";
import { websocketUpdateTicket } from "../../TicketServices/UpdateTicketService";
import { syncBillingDeliveryVisibility } from "../visibility";

jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/OutOfTicketMessages", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../../models/Queue", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/Tag", () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn() }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() }
}));
jest.mock("../../../models/TicketTag", () => ({
  __esModule: true,
  default: { create: jest.fn() }
}));
jest.mock("../../../models/Whatsapp", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../MessageServices/CreateMessageService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../TicketServices/FindOrCreateATicketTrakingService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../TicketServices/UpdateTicketService", () => ({
  websocketUpdateTicket: jest.fn()
}));

const delivery = {
  id: "delivery-1",
  companyId: 9,
  contactId: 42,
  whatsappId: 16,
  messageId: "wamid.billing",
  body: "Cobrança automática",
  stage: 0,
  status: "SENT"
};

const ticket = {
  id: 77,
  update: jest.fn(),
  reload: jest.fn()
};

beforeEach(() => {
  jest.clearAllMocks();
  (Message.findOne as jest.Mock).mockResolvedValue(null);
  (Queue.findOne as jest.Mock).mockResolvedValue({ id: 11 });
  (Contact.findOne as jest.Mock).mockResolvedValue({
    id: 42,
    number: "5568999999999"
  });
  (Whatsapp.findOne as jest.Mock).mockResolvedValue({ id: 16 });
  (Tag.findOrCreate as jest.Mock).mockResolvedValue([{ id: 5 }]);
  (Ticket.findOne as jest.Mock).mockResolvedValue(null);
  (Ticket.create as jest.Mock).mockResolvedValue(ticket);
  (OutOfTicketMessage.findByPk as jest.Mock).mockResolvedValue(null);
  ticket.update.mockResolvedValue(ticket);
  ticket.reload.mockResolvedValue(ticket);
});

it("places a sent billing message in the tenant's Boletos queue before the customer replies", async () => {
  await syncBillingDeliveryVisibility(delivery);

  expect(Queue.findOne).toHaveBeenCalledWith({
    where: { companyId: 9, name: "BOLETOS" },
    attributes: ["id"]
  });
  expect(Ticket.create).toHaveBeenCalledWith(
    expect.objectContaining({
      companyId: 9,
      contactId: 42,
      whatsappId: 16,
      status: "pending",
      queueId: 11,
      chatbot: false,
      queueOptionId: null
    })
  );
  expect(CreateMessageService).toHaveBeenCalledWith(
    expect.objectContaining({
      companyId: 9,
      messageData: expect.objectContaining({ ticketId: 77, fromMe: true })
    })
  );
  expect(websocketUpdateTicket).toHaveBeenCalledWith(ticket);
});

it("returns a reused pending billing ticket to Boletos and exits its chatbot", async () => {
  (Ticket.findOne as jest.Mock).mockResolvedValue(ticket);

  await syncBillingDeliveryVisibility(delivery);

  expect(Ticket.create).not.toHaveBeenCalled();
  expect(ticket.update).toHaveBeenCalledWith(
    expect.objectContaining({
      queueId: 11,
      chatbot: false,
      queueOptionId: null,
      status: "pending"
    })
  );
  expect(FindOrCreateATicketTrakingService).not.toHaveBeenCalled();
  expect(TicketTag.create).not.toHaveBeenCalled();
});

it("does not leave a sent cobrança in an unassigned queue when Boletos is absent", async () => {
  (Queue.findOne as jest.Mock).mockResolvedValue(null);

  await expect(syncBillingDeliveryVisibility(delivery)).rejects.toThrow(
    "BOLETOS queue missing for company 9"
  );
  expect(Ticket.create).not.toHaveBeenCalled();
});
