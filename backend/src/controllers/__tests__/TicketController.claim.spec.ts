import Ticket from "../../models/Ticket";
import { Request, Response } from "express";
import AssertTicketAccessService from "../../services/TicketServices/AssertTicketAccessService";
import ShowTicketService from "../../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../../services/TicketServices/UpdateTicketService";
import { usesOwnerTicketAccess } from "../../services/TicketServices/TicketAccessPolicy";
import { update } from "../TicketController";

jest.mock("../../services/TicketServices/ShowTicketService");
jest.mock("../../services/TicketServices/AssertTicketAccessService");
jest.mock("../../services/TicketServices/UpdateTicketService");
jest.mock("../../services/TicketServices/TicketAccessPolicy");

const showTicket = ShowTicketService as jest.MockedFunction<
  typeof ShowTicketService
>;
const assertAccess = AssertTicketAccessService as jest.MockedFunction<
  typeof AssertTicketAccessService
>;
const updateTicket = UpdateTicketService as jest.MockedFunction<
  typeof UpdateTicketService
>;
const ownerAccess = usesOwnerTicketAccess as jest.MockedFunction<
  typeof usesOwnerTicketAccess
>;

const request = (body: Record<string, unknown>) =>
  ({
    params: { ticketId: "2047" },
    body,
    user: { id: "7", companyId: 9, profile: "user" }
  }) as unknown as Request;

const response = () => {
  const res = {} as Response;
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("TicketController atomic claim", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ownerAccess.mockResolvedValue(true);
    showTicket.mockResolvedValue({
      id: 2047,
      companyId: 9,
      status: "pending",
      userId: null,
      isGroup: false
    } as Ticket);
    assertAccess.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("claims with one compare-and-set and discards extra client fields", async () => {
    jest
      .spyOn(Ticket, "update")
      .mockResolvedValue([1] as unknown as [affectedCount: number]);
    const claimed = { id: 2047, uuid: "claimed-ticket" } as Ticket;
    updateTicket.mockResolvedValue({
      ticket: claimed,
      oldStatus: "pending",
      oldUserId: undefined
    });
    const res = response();

    await update(
      request({ status: "open", userId: 999, queueId: 55, justClose: true }),
      res
    );

    expect(Ticket.update).toHaveBeenCalledWith(
      { userId: 7 },
      expect.objectContaining({
        where: { id: 2047, companyId: 9, status: "pending", userId: null }
      })
    );
    expect(updateTicket).toHaveBeenCalledWith({
      ticketData: { userId: 7, status: "open" },
      ticketId: 2047,
      reqUserId: 7,
      claimedFromPending: true
    });
    expect(res.json).toHaveBeenCalledWith(claimed);
  });

  it("returns conflict when another attendant won the claim", async () => {
    jest
      .spyOn(Ticket, "update")
      .mockResolvedValue([0] as unknown as [affectedCount: number]);

    await expect(
      update(request({ status: "open" }), response())
    ).rejects.toMatchObject({
      message: "ERR_TICKET_ALREADY_CLAIMED",
      statusCode: 409
    });
    expect(updateTicket).not.toHaveBeenCalled();
  });
});
