import { Op } from "sequelize";
import Contact from "../../../models/Contact";
import Queue from "../../../models/Queue";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import { GetCompanySetting } from "../../../helpers/CheckSettings";
import ShowTicketService from "../ShowTicketService";
import FindOrCreateATicketTrakingService from "../FindOrCreateATicketTrakingService";
import FindOrCreateTicketService from "../FindOrCreateTicketService";
import sequelize from "../../../database";

jest.mock("../../../database", () => ({
  __esModule: true,
  default: {
    transaction: jest.fn(async callback => callback({})),
    query: jest.fn()
  }
}));
jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));
jest.mock("../ShowTicketService");
jest.mock("../FindOrCreateATicketTrakingService");
jest.mock("../../CounterServices/IncrementCounter", () => ({
  incrementCounter: jest.fn()
}));

const contact = { id: 42 } as Contact;
const closed = {
  id: 77,
  status: "closed",
  userId: 5,
  queueId: 11,
  unreadMessages: 0,
  whatsappId: 16,
  companyId: 9,
  update: jest.fn(async function update(values) {
    Object.assign(this, values);
    return this;
  })
} as unknown as Ticket;

beforeEach(() => {
  jest.clearAllMocks();
  (closed as any).status = "closed";
  (closed as any).userId = 5;
  (closed as any).unreadMessages = 0;
  (GetCompanySetting as jest.Mock).mockResolvedValue("0");
  jest.spyOn(Ticket, "findOne")
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(closed);
  jest.spyOn(User, "findOne").mockResolvedValue({
    id: 5,
    queues: [{ id: 11 } as Queue]
  } as User);
  (ShowTicketService as jest.Mock).mockResolvedValue(closed);
});

afterEach(() => jest.restoreAllMocks());

it("reopens a recently closed ticket for its previous agent with a 24-hour minimum", async () => {
  const result = await FindOrCreateTicketService(contact, 16, 9, {
    incrementUnread: true
  });

  expect(result.ticket.id).toBe(77);
  expect(result.justCreated).toBe(false);
  expect((Ticket.findOne as jest.Mock).mock.calls[1][0].where).toEqual(
    expect.objectContaining({
      companyId: 9,
      contactId: 42,
      whatsappId: 16,
      status: "closed",
      closedAt: { [Op.gte]: expect.any(Date) }
    })
  );
  expect(closed.update).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "open",
      userId: 5,
      chatbot: false,
      unreadMessages: 1
    }),
    expect.any(Object)
  );
  expect(FindOrCreateATicketTrakingService).toHaveBeenCalled();
  expect(sequelize.query).toHaveBeenCalledWith(
    expect.stringContaining("pg_advisory_xact_lock"),
    expect.objectContaining({ replacements: { companyId: 9, contactId: 42 } })
  );
});

it("returns a closed ticket to its queue when the previous agent is unavailable", async () => {
  (User.findOne as jest.Mock).mockResolvedValue(null);
  await FindOrCreateTicketService(contact, 16, 9, {
    incrementUnread: true
  });
  expect(closed.update).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "pending",
      userId: null,
      chatbot: false
    }),
    expect.any(Object)
  );
});

it("uses the exact 24-hour closedAt boundary, not a later ticket update", async () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-22T12:00:00Z"));
  try {
    await FindOrCreateTicketService(contact, 16, 9);
    const where = (Ticket.findOne as jest.Mock).mock.calls[1][0].where;
    expect(where.closedAt[Op.gte]).toEqual(
      new Date("2026-10-21T12:00:00Z")
    );
    expect(where).not.toHaveProperty("updatedAt");
  } finally {
    jest.useRealTimers();
  }
});

it("creates a new ticket when no closed ticket remains inside the window", async () => {
  (Ticket.findOne as jest.Mock).mockReset().mockResolvedValue(null);
  const next = { id: 99, companyId: 9, whatsappId: 16 } as Ticket;
  jest.spyOn(Ticket, "create").mockResolvedValue(next);
  (ShowTicketService as jest.Mock).mockResolvedValue(next);

  const result = await FindOrCreateTicketService(contact, 16, 9);

  expect(result.justCreated).toBe(true);
  expect(result.ticket.id).toBe(99);
  expect(Ticket.create).toHaveBeenCalledWith(
    expect.objectContaining({ contactId: 42, companyId: 9, whatsappId: 16 }),
    expect.objectContaining({ transaction: expect.any(Object) })
  );
});
