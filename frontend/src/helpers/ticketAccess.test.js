import { canActOnTicket, canSeeTicket } from "./ticketAccess";

const attendant = { id: 40, profile: "user", queues: [{ id: 11 }, { id: 16 }] };
const admin = { id: 30, profile: "admin", queues: [] };

describe("canSeeTicket", () => {
  it("keeps unassigned tickets in the shared triage pool", () => {
    expect(canSeeTicket(attendant, { queueId: null, status: "pending" })).toBe(
      true
    );
  });

  it("allows the queues of the attendant", () => {
    expect(canSeeTicket(attendant, { queueId: 11 })).toBe(true);
    expect(canSeeTicket(attendant, { queue: { id: 16 } })).toBe(true);
  });

  it("blocks queues the attendant does not belong to", () => {
    expect(canSeeTicket(attendant, { queueId: 12 })).toBe(false);
  });

  it("still allows a ticket assigned to the attendant", () => {
    expect(canSeeTicket(attendant, { queueId: 12, userId: 40 })).toBe(true);
  });

  it("allows everything for admins", () => {
    expect(canSeeTicket(admin, { queueId: 12 })).toBe(true);
  });
});

describe("canActOnTicket", () => {
  it("allows acting on a pending ticket of a visible queue", () => {
    expect(canActOnTicket(attendant, { queueId: 11, status: "pending" })).toBe(
      true
    );
    expect(
      canActOnTicket(attendant, { queueId: null, status: "pending" })
    ).toBe(true);
  });

  it("blocks acting on an open ticket of another attendant", () => {
    expect(
      canActOnTicket(attendant, { queueId: 11, status: "open", userId: 39 })
    ).toBe(false);
  });

  it("allows acting on an open ticket of the attendant", () => {
    expect(
      canActOnTicket(attendant, { queueId: 11, status: "open", userId: 40 })
    ).toBe(true);
  });
});
