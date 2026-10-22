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
import sequelize from "../../../database";

jest.mock("../../../database", () => ({
  __esModule: true,
  default: {
    transaction: jest.fn(async callback => callback({})),
    query: jest.fn()
  }
}));

jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findOrCreate: jest.fn() }
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
  default: { findOrCreate: jest.fn() }
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
  (Message.findOrCreate as jest.Mock).mockResolvedValue([
    { id: delivery.messageId, ticketId: 77 },
    true
  ]);
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

  expect(Queue.findOne).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { companyId: 9, name: "BOLETOS" },
      attributes: ["id"]
    })
  );
  expect(Ticket.create).toHaveBeenCalledWith(
    expect.objectContaining({
      companyId: 9,
      contactId: 42,
      whatsappId: 16,
      status: "pending",
      queueId: 11,
      chatbot: false,
      queueOptionId: null
    }),
    expect.objectContaining({ transaction: expect.any(Object) })
  );
  expect(CreateMessageService).toHaveBeenCalledWith(
    expect.objectContaining({
      companyId: 9,
      messageData: expect.objectContaining({ ticketId: 77, fromMe: true })
    })
  );
  expect(websocketUpdateTicket).toHaveBeenCalledWith(ticket);
});

it("keeps the active ticket's owner and queue while adding the billing message", async () => {
  (Ticket.findOne as jest.Mock).mockResolvedValue(ticket);

  await syncBillingDeliveryVisibility(delivery);

  expect(Ticket.create).not.toHaveBeenCalled();
  expect(Queue.findOne).not.toHaveBeenCalled();
  expect(ticket.update).toHaveBeenCalledWith(
    expect.objectContaining({ lastMessage: expect.any(String) })
  );
  expect(ticket.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ userId: null })
  );
  expect(FindOrCreateATicketTrakingService).not.toHaveBeenCalled();
  expect(TicketTag.findOrCreate).toHaveBeenCalledWith(
    expect.objectContaining({ where: { ticketId: 77, tagId: 5 } })
  );
});

it("does not project a sent billing message twice", async () => {
  (Message.findOne as jest.Mock).mockResolvedValue({
    id: delivery.messageId,
    ticketId: 77
  });
  (Ticket.findOne as jest.Mock).mockResolvedValue(ticket);
  await syncBillingDeliveryVisibility(delivery);
  expect(Ticket.findOne).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ id: 77 }) })
  );
  expect(TicketTag.findOrCreate).toHaveBeenCalled();
  expect(Message.findOrCreate).not.toHaveBeenCalled();
  expect(CreateMessageService).not.toHaveBeenCalled();
});

it("reuses the winner after a concurrent active-ticket index conflict", async () => {
  (sequelize.transaction as jest.Mock)
    .mockRejectedValueOnce({
      parent: { constraint: "tickets_one_active_individual_whatsapp" }
    })
    .mockImplementationOnce(async callback => callback({}));
  (Ticket.findOne as jest.Mock).mockResolvedValue(ticket);

  await syncBillingDeliveryVisibility(delivery);

  expect(sequelize.transaction).toHaveBeenCalledTimes(2);
  expect(Ticket.create).not.toHaveBeenCalled();
  expect(CreateMessageService).toHaveBeenCalledTimes(1);
});

it("does not leave a sent cobrança in an unassigned queue when Boletos is absent", async () => {
  (Queue.findOne as jest.Mock).mockResolvedValue(null);

  await expect(syncBillingDeliveryVisibility(delivery)).rejects.toThrow(
    "BOLETOS queue missing for company 9"
  );
  expect(Ticket.create).not.toHaveBeenCalled();
});
