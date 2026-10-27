import Contact from "../../../models/Contact";
import GroupQueue from "../../../models/GroupQueue";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import { assertGroupAccess } from "../GroupAccessService";

jest.mock("../../../models/GroupQueue");
jest.mock("../../../models/Ticket");
jest.mock("../../../models/User");

const findTicket = Ticket.findOne as jest.MockedFunction<typeof Ticket.findOne>;
const findUser = User.findOne as jest.MockedFunction<typeof User.findOne>;
const findGroupQueues = GroupQueue.findAll as jest.MockedFunction<
  typeof GroupQueue.findAll
>;

const ticket = {
  id: 15,
  companyId: 7,
  contactId: 31,
  isGroup: true,
  contact: { id: 31, groupMode: "conversation" } as Contact
} as Ticket;

beforeEach(() => {
  findTicket.mockResolvedValue(ticket);
});

it("lets a company administrator access every group", async () => {
  await expect(
    assertGroupAccess(15, { id: 3, companyId: 7, profile: "admin" })
  ).resolves.toBe(ticket);

  expect(findUser).not.toHaveBeenCalled();
  expect(findGroupQueues).not.toHaveBeenCalled();
});

it("lets an attendant access a group when one queue intersects", async () => {
  findUser.mockResolvedValue({ queues: [{ id: 4 }] } as User);
  findGroupQueues.mockResolvedValue([{ queueId: 4 }] as GroupQueue[]);

  await expect(
    assertGroupAccess(15, { id: 9, companyId: 7, profile: "user" })
  ).resolves.toBe(ticket);

  expect(findGroupQueues).toHaveBeenCalledWith({
    where: { groupContactId: 31, companyId: 7 },
    attributes: ["queueId"]
  });
});

it("rejects attendants whose queues do not intersect", async () => {
  findUser.mockResolvedValue({ queues: [{ id: 8 }] } as User);
  findGroupQueues.mockResolvedValue([{ queueId: 4 }] as GroupQueue[]);

  await expect(
    assertGroupAccess(15, { id: 9, companyId: 7, profile: "user" })
  ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
});

it("lets company users read an unassigned conversation group", async () => {
  findUser.mockResolvedValue({ queues: [] } as User);
  findGroupQueues.mockResolvedValue([]);

  await expect(
    assertGroupAccess(15, { id: 9, companyId: 7, profile: "user" })
  ).resolves.toBe(ticket);
});

it("keeps an unassigned service-mode group restricted", async () => {
  findTicket.mockResolvedValue({
    ...ticket,
    contact: { id: 31, groupMode: "ticket" }
  } as Ticket);
  findUser.mockResolvedValue({ queues: [] } as User);
  findGroupQueues.mockResolvedValue([]);

  await expect(
    assertGroupAccess(15, { id: 9, companyId: 7, profile: "user" })
  ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
});

it("rejects a user who no longer belongs to the company", async () => {
  findUser.mockResolvedValue(null);

  await expect(
    assertGroupAccess(15, { id: 9, companyId: 7, profile: "user" })
  ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
  expect(findUser).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 9, companyId: 7 } })
  );
});

it("does not reveal a group from another company", async () => {
  findTicket.mockResolvedValue(null);

  await expect(
    assertGroupAccess(15, { id: 3, companyId: 8, profile: "admin" })
  ).rejects.toMatchObject({ message: "ERR_NO_TICKET_FOUND", statusCode: 404 });
});
