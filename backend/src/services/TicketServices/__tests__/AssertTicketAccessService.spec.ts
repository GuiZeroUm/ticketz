import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import ShowUserService from "../../UserServices/ShowUserService";
import AssertTicketAccessService from "../AssertTicketAccessService";
import { canUserClaimTicket, canUserSeeTicket } from "../TicketVisibility";
import { getTicketAccessMode } from "../TicketAccessPolicy";

jest.mock("../../UserServices/ShowUserService");
jest.mock("../TicketAccessPolicy");

const showUser = ShowUserService as jest.MockedFunction<typeof ShowUserService>;
const accessMode = getTicketAccessMode as jest.MockedFunction<
  typeof getTicketAccessMode
>;

const asTicket = (values: Record<string, unknown>) =>
  values as unknown as Ticket;

describe("canUserSeeTicket", () => {
  it("keeps unassigned tickets in the shared triage pool", () => {
    expect(canUserSeeTicket("user", 40, [11], { queueId: null })).toBe(true);
  });

  it("allows the queues of the agent", () => {
    expect(canUserSeeTicket("user", 40, [11, 16], { queueId: 16 })).toBe(true);
  });

  it("blocks a queue the agent does not belong to", () => {
    expect(canUserSeeTicket("user", 40, [11], { queueId: 16 })).toBe(false);
  });

  it("still allows a ticket assigned to the agent", () => {
    expect(
      canUserSeeTicket("user", 40, [11], { queueId: 16, userId: 40 })
    ).toBe(true);
  });

  it("allows everything for admins", () => {
    expect(canUserSeeTicket("admin", 30, [], { queueId: 16 })).toBe(true);
  });

  it("only allows the owner when owner access is enabled", () => {
    expect(
      canUserSeeTicket(
        "user",
        40,
        [16],
        { queueId: 16, userId: 39, status: "open" },
        "owner"
      )
    ).toBe(false);
    expect(
      canUserSeeTicket(
        "user",
        40,
        [16],
        { queueId: 16, userId: 40, status: "open" },
        "owner"
      )
    ).toBe(true);
  });

  it("does not expose unassigned pending content in owner mode", () => {
    expect(
      canUserSeeTicket(
        "user",
        40,
        [16],
        { queueId: 16, userId: null, status: "pending" },
        "owner"
      )
    ).toBe(false);
    expect(
      canUserClaimTicket(
        "user",
        40,
        [16],
        { queueId: 16, userId: null, status: "pending" },
        "owner"
      )
    ).toBe(true);
  });

  it("does not allow claiming a pending ticket from another queue", () => {
    expect(
      canUserClaimTicket(
        "user",
        40,
        [11],
        { queueId: 16, userId: null, status: "pending" },
        "owner"
      )
    ).toBe(false);
  });
});

describe("AssertTicketAccessService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessMode.mockResolvedValue("queue");
  });

  it("permits only claiming an unassigned pending ticket in owner mode", async () => {
    accessMode.mockResolvedValue("owner");
    showUser.mockResolvedValue({
      id: 40,
      profile: "user",
      queues: [{ id: 16 }]
    } as unknown as User);
    const ticket = asTicket({
      companyId: 9,
      status: "pending",
      queueId: 16,
      userId: null
    });

    await expect(
      AssertTicketAccessService(ticket, { id: 40, profile: "user" })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      AssertTicketAccessService(
        ticket,
        { id: 40, profile: "user" },
        { allowClaimOnly: true }
      )
    ).resolves.toBeUndefined();
  });

  it("does not even load the user for an admin", async () => {
    await AssertTicketAccessService(asTicket({ queueId: 16 }), {
      id: 30,
      profile: "admin"
    });

    expect(showUser).not.toHaveBeenCalled();
  });

  it("rejects a ticket from a queue the agent does not belong to", async () => {
    showUser.mockResolvedValue({
      id: 40,
      profile: "user",
      queues: [{ id: 11 }]
    } as unknown as User);

    await expect(
      AssertTicketAccessService(asTicket({ queueId: 16, userId: 39 }), {
        id: 40,
        profile: "user"
      })
    ).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
  });

  it("accepts a ticket of the queue of the agent", async () => {
    showUser.mockResolvedValue({
      id: 40,
      profile: "user",
      queues: [{ id: 11 }, { id: 16 }]
    } as unknown as User);

    await expect(
      AssertTicketAccessService(asTicket({ queueId: 16 }), {
        id: 40,
        profile: "user"
      })
    ).resolves.toBeUndefined();
  });
});
