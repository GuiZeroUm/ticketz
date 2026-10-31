import Contact from "../../../models/Contact";
import GroupQueue from "../../../models/GroupQueue";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import {
  assertGroupAccess,
  listGroupRecipientIds
} from "../GroupAccessService";

jest.mock("../../../models/GroupQueue");
jest.mock("../../../models/Ticket");
jest.mock("../../../models/User");

const findTicket = Ticket.findOne as jest.MockedFunction<typeof Ticket.findOne>;
const findUser = User.findOne as jest.MockedFunction<typeof User.findOne>;
const findUsers = User.findAll as jest.MockedFunction<typeof User.findAll>;
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
  findUser.mockResolvedValue({ profile: "admin", queues: [] } as User);
  await expect(
    assertGroupAccess(15, { id: 3, companyId: 7, profile: "admin" })
  ).resolves.toBe(ticket);

  expect(findUser).toHaveBeenCalled();
  expect(findGroupQueues).not.toHaveBeenCalled();
});

it("uses the current database role after an administrator is demoted", async () => {
  findUser.mockResolvedValue({
    profile: "user",
    queues: [],
    groupAccessIds: []
  } as User);

  await expect(
    assertGroupAccess(15, { id: 9, companyId: 7, profile: "admin" })
  ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
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

it("allows a selected conversation group outside the user's queues", async () => {
  findUser.mockResolvedValue({
    queues: [],
    groupAccessIds: [31]
  } as User);

  await expect(
    assertGroupAccess(15, { id: 9, companyId: 7, profile: "user" })
  ).resolves.toBe(ticket);
  expect(findGroupQueues).not.toHaveBeenCalled();
});

it("denies an unselected group even when its queue belongs to the user", async () => {
  findUser.mockResolvedValue({
    queues: [{ id: 4 }],
    groupAccessIds: []
  } as User);

  await expect(
    assertGroupAccess(15, { id: 9, companyId: 7, profile: "user" })
  ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
  expect(findGroupQueues).not.toHaveBeenCalled();
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

it("routes conversation events only to admins and authorized users", async () => {
  findUsers.mockResolvedValue([
    { id: 1, profile: "admin", queues: [], groupAccessIds: null },
    { id: 2, profile: "user", queues: [{ id: 4 }], groupAccessIds: [] },
    { id: 3, profile: "user", queues: [], groupAccessIds: [31] },
    { id: 4, profile: "user", queues: [{ id: 4 }], groupAccessIds: null }
  ] as User[]);
  findGroupQueues.mockResolvedValue([{ queueId: 4 }] as GroupQueue[]);

  await expect(listGroupRecipientIds(31, 7, "conversation")).resolves.toEqual([
    1, 3, 4
  ]);
});
