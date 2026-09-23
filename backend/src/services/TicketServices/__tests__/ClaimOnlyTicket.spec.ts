import Ticket from "../../../models/Ticket";
import { serializeClaimOnlyTicket } from "../ClaimOnlyTicket";

describe("serializeClaimOnlyTicket", () => {
  it("does not expose contact or message data in the shared pool", () => {
    const ticket = {
      id: 2047,
      uuid: "secret-ticket-uuid",
      status: "pending",
      queueId: 22,
      queue: { id: 22, name: "Automação inicial", color: "#123456" },
      isGroup: false,
      createdAt: new Date("2026-09-22T12:00:00Z"),
      updatedAt: new Date("2026-09-22T12:01:00Z"),
      contact: { id: 10, name: "Cliente", number: "556899999999" },
      contactId: 10,
      lastMessage: "conteúdo privado",
      unreadMessages: 1,
      whatsappId: 16
    } as unknown as Ticket;

    const result = serializeClaimOnlyTicket(ticket);

    expect(result).toMatchObject({
      id: 2047,
      status: "pending",
      queueId: 22,
      claimOnly: true
    });
    expect(result).not.toHaveProperty("contact");
    expect(result).not.toHaveProperty("contactId");
    expect(result).not.toHaveProperty("lastMessage");
    expect(result).not.toHaveProperty("unreadMessages");
    expect(result).not.toHaveProperty("whatsappId");
    expect(result).not.toHaveProperty("uuid");
  });
});
