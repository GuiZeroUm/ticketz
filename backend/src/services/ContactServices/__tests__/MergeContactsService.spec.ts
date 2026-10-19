/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("../../../database", () => ({
  __esModule: true,
  default: {
    transaction: jest.fn(async (fn: any) => fn({ id: "tx" })),
    query: jest.fn()
  }
}));
const mockModel = () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn()
  }
});
jest.mock("../../../models/CampaignShipping", () => mockModel());
jest.mock("../../../models/Contact", () => mockModel());
jest.mock("../../../models/ContactCustomField", () => mockModel());
jest.mock("../../../models/ContactIdentity", () => mockModel());
jest.mock("../../../models/ContactTag", () => mockModel());
jest.mock("../../../models/Message", () => mockModel());
jest.mock("../../../models/Schedule", () => mockModel());
jest.mock("../../../models/ScheduleAudienceContact", () => mockModel());
jest.mock("../../../models/ScheduleDelivery", () => mockModel());
jest.mock("../../../models/Ticket", () => mockModel());
jest.mock("../../../models/TicketNote", () => mockModel());
jest.mock("../../../models/WhatsappLidMap", () => mockModel());
jest.mock("../../TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../ContactNamePolicy", () => ({
  preserveLockedNameOnMerge: jest.fn(() => null)
}));

import ContactIdentity from "../../../models/ContactIdentity";
import ContactTag from "../../../models/ContactTag";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import WhatsappLidMap from "../../../models/WhatsappLidMap";
import UpdateTicketService from "../../TicketServices/UpdateTicketService";
import MergeContactsService from "../MergeContactsService";

const contact = (id: number, createdAt: string): any => ({
  id,
  createdAt: new Date(createdAt),
  update: jest.fn(),
  destroy: jest.fn()
});

const ticket = (over: any): any => ({
  status: "open",
  updatedAt: new Date("2026-10-19T10:00:00Z"),
  channel: "whatsapp",
  emailAccountId: null,
  ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  (ContactTag.findAll as jest.Mock).mockResolvedValue([]);
  (WhatsappLidMap.findAll as jest.Mock).mockResolvedValue([]);
  (Message.findAll as jest.Mock).mockResolvedValue([]);
  (Ticket.findAll as jest.Mock).mockResolvedValue([]);
});

describe("MergeContactsService", () => {
  it("moves the loser's email identities to the winner before destroying it", async () => {
    const winner = contact(1, "2026-01-01T00:00:00Z");
    const loser = contact(2, "2026-02-01T00:00:00Z");

    await MergeContactsService([winner, loser], { companyId: 7 });

    expect(ContactIdentity.update).toHaveBeenCalledWith(
      { contactId: 1 },
      expect.objectContaining({
        where: { contactId: 2, companyId: 7 },
        transaction: { id: "tx" }
      })
    );
    expect(
      (ContactIdentity.update as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(loser.destroy.mock.invocationCallOrder[0]);
    expect(winner.destroy).not.toHaveBeenCalled();
  });

  it("never closes email tickets when collapsing duplicated open tickets", async () => {
    const winner = contact(1, "2026-01-01T00:00:00Z");
    const loser = contact(2, "2026-02-01T00:00:00Z");
    (Ticket.findAll as jest.Mock).mockResolvedValue([
      ticket({ id: 10, whatsappId: 3 }),
      ticket({ id: 11, whatsappId: 3 }),
      ticket({ id: 20, whatsappId: null, channel: "email", emailAccountId: 5 }),
      ticket({ id: 21, whatsappId: null, channel: "email", emailAccountId: 5 }),
      ticket({ id: 22, whatsappId: null, channel: "email", emailAccountId: 6 })
    ]);

    await MergeContactsService([winner, loser], { companyId: 7 });

    const closed = (UpdateTicketService as jest.Mock).mock.calls.map(
      ([args]: any[]) => args.ticketId
    );
    expect(closed).toEqual([10]);
  });

  it("keeps closing duplicated WhatsApp tickets per connection", async () => {
    const winner = contact(1, "2026-01-01T00:00:00Z");
    const loser = contact(2, "2026-02-01T00:00:00Z");
    (Ticket.findAll as jest.Mock).mockResolvedValue([
      ticket({ id: 10, whatsappId: 3 }),
      ticket({ id: 11, whatsappId: 3 }),
      ticket({ id: 12, whatsappId: 4 }),
      ticket({ id: 13, whatsappId: 4, channel: null })
    ]);

    await MergeContactsService([winner, loser], { companyId: 7 });

    const closed = (UpdateTicketService as jest.Mock).mock.calls
      .map(([args]: any[]) => args.ticketId)
      .sort();
    expect(closed).toEqual([10, 12]);
  });
});
