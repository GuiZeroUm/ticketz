import TicketNote from "../../../models/TicketNote";
import FindNotesByContactIdAndTicketId from "../FindNotesByContactIdAndTicketId";

describe("FindNotesByContactIdAndTicketId", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loads every note for the authorized contact and scopes the ticket join by company", async () => {
    const findAll = jest.spyOn(TicketNote, "findAll").mockResolvedValue([]);

    await FindNotesByContactIdAndTicketId({ contactId: 42, companyId: 9 });

    const options = (findAll as jest.Mock).mock.calls[0][0];
    expect(options.where).toEqual({ contactId: 42 });
    expect(options.include).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          as: "ticket",
          where: { companyId: 9 },
          required: true
        })
      ])
    );
  });

  it("preserves the legacy current-ticket scope outside owner mode", async () => {
    const findAll = jest.spyOn(TicketNote, "findAll").mockResolvedValue([]);

    await FindNotesByContactIdAndTicketId({
      contactId: 42,
      companyId: 3,
      ticketId: 100
    });

    expect((findAll as jest.Mock).mock.calls[0][0].where).toEqual({
      contactId: 42,
      ticketId: 100
    });
  });
});
