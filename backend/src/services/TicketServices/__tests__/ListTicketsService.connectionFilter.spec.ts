import Ticket from "../../../models/Ticket";
import ListTicketsService from "../ListTicketsService";
import CountVisibleTicketsService from "../CountVisibleTicketsService";

jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(3)
  }
}));
jest.mock("../../UserServices/ShowUserService", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ profile: "admin" })
}));
jest.mock("../../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn().mockResolvedValue("disabled")
}));
jest.mock("../TicketAccessPolicy", () => ({
  getTicketAccessMode: jest.fn().mockResolvedValue("shared")
}));

it("filters tickets by connection while keeping tenant and status scopes", async () => {
  await ListTicketsService({
    userId: "1",
    companyId: 1,
    status: "open",
    showAll: "true",
    queueIds: [],
    tags: [],
    users: [],
    whatsappId: 17
  });

  const findAll = Ticket.findAll as jest.Mock;
  expect(findAll).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        companyId: 1,
        status: "open",
        whatsappId: 17
      })
    })
  );
});

it("counts open and pending tickets for the same connection", async () => {
  await CountVisibleTicketsService({
    userId: "1",
    companyId: 1,
    profile: "admin",
    requestedQueueIds: [],
    whatsappId: 17
  });

  const count = Ticket.count as jest.Mock;
  expect(count).toHaveBeenCalledWith({
    where: expect.objectContaining({
      companyId: 1,
      whatsappId: 17,
      status: "open"
    })
  });
  expect(count).toHaveBeenCalledWith({
    where: expect.objectContaining({
      companyId: 1,
      whatsappId: 17,
      status: "pending"
    })
  });
});
