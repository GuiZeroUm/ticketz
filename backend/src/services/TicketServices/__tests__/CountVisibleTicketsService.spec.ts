import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import ShowUserService from "../../UserServices/ShowUserService";
import CountVisibleTicketsService from "../CountVisibleTicketsService";
import { getTicketAccessMode } from "../TicketAccessPolicy";

jest.mock("../../UserServices/ShowUserService");
jest.mock("../TicketAccessPolicy");

const showUser = ShowUserService as jest.MockedFunction<typeof ShowUserService>;
const accessMode = getTicketAccessMode as jest.MockedFunction<
  typeof getTicketAccessMode
>;

describe("CountVisibleTicketsService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("counts an attendant's own open tickets and only eligible pending tickets in owner mode", async () => {
    showUser.mockResolvedValue({
      id: 7,
      profile: "user",
      queues: [{ id: 11 }]
    } as User);
    accessMode.mockResolvedValue("owner");
    const count = jest
      .spyOn(Ticket, "count")
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    await expect(
      CountVisibleTicketsService({
        companyId: 9,
        userId: 7,
        profile: "user",
        requestedQueueIds: [11, 99]
      })
    ).resolves.toEqual({ open: 3, pending: 2 });

    expect(count.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ companyId: 9, status: "open", userId: 7 })
    );
    expect(count.mock.calls[1][0].where).toEqual(
      expect.objectContaining({ companyId: 9, status: "pending" })
    );
    expect(JSON.stringify(count.mock.calls[1][0].where)).not.toContain("99");
  });
});
