import { Op } from "sequelize";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import ListContactHistoryService from "../ListContactHistoryService";

jest.mock("../../../models/Contact", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn() }
}));
jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../../models/User", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn(async (_companyId, _key, fallback) => fallback)
}));

const request = { contactId: 42, companyId: 9, userId: 5, profile: "user" };
const accessible = {
  id: 10,
  uuid: "allowed",
  status: "closed",
  userId: 5,
  queueId: 11,
  queue: { name: "Eventos" },
  user: { name: "Atendente" }
};
const restricted = {
  id: 20,
  uuid: "restricted",
  status: "closed",
  userId: 6,
  queueId: 22
};

beforeEach(() => {
  jest.clearAllMocks();
  (Contact.findOne as jest.Mock).mockResolvedValue({ id: 42 });
  (User.findOne as jest.Mock).mockResolvedValue({
    id: 5,
    queues: [{ id: 11 }]
  });
  (Ticket.findAll as jest.Mock).mockResolvedValue([accessible, restricted]);
  (Message.findAll as jest.Mock).mockResolvedValue([
    {
      id: "message-1",
      ticketId: 10,
      body: "visible",
      createdAt: new Date("2026-10-20T10:00:00Z")
    }
  ]);
});

it("returns only messages from tickets accessible to the attendant", async () => {
  const result = await ListContactHistoryService(request);
  expect(result.tickets.map(ticket => ticket.id)).toEqual([10]);
  expect((Ticket.findAll as jest.Mock).mock.calls[0][0].where).toEqual(
    expect.objectContaining({ companyId: 9, contactId: 42 })
  );
  const where = (Message.findAll as jest.Mock).mock.calls[0][0].where;
  expect(where.ticketId[Op.in]).toEqual([10]);
  expect(where.companyId).toBe(9);
});

it("rejects a cursor from a restricted ticket", async () => {
  (Message.findOne as jest.Mock).mockResolvedValue(null);
  await expect(
    ListContactHistoryService({ ...request, cursor: "restricted-message" })
  ).rejects.toMatchObject({ message: "ERR_MESSAGE_NOT_FOUND", statusCode: 404 });
  expect((Message.findOne as jest.Mock).mock.calls[0][0].where.ticketId[
    Op.in
  ]).toEqual([10]);
});

it("does not expose tickets from another tenant", async () => {
  (Contact.findOne as jest.Mock).mockResolvedValue(null);
  await expect(
    ListContactHistoryService({ ...request, companyId: 1 })
  ).rejects.toMatchObject({ message: "ERR_NO_CONTACT_FOUND" });
  expect(Ticket.findAll).not.toHaveBeenCalled();
});

it("returns a stable older-page cursor and labels the source ticket", async () => {
  const messages = Array.from({ length: 101 }, (_, index) => ({
    id: `message-${String(101 - index).padStart(3, "0")}`,
    ticketId: 10,
    body: `text ${index}`,
    createdAt: new Date(2026, 9, 20, 10, 0, 101 - index)
  }));
  (Message.findAll as jest.Mock).mockResolvedValue(messages);

  const result = await ListContactHistoryService(request);

  expect(result.messages).toHaveLength(100);
  expect(result.messages[0].id).toBe("message-002");
  expect(result.nextCursor).toBe("message-002");
  expect(result.hasMore).toBe(true);
  expect(result.tickets).toEqual([
    expect.objectContaining({ id: 10, uuid: "allowed" })
  ]);
  expect((Message.findAll as jest.Mock).mock.calls[0][0].limit).toBe(101);
});
