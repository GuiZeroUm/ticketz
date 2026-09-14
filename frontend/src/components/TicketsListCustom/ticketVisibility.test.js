import {
  getTicketQueueId,
  isSharedOpenTicketView,
  isTicketQueueVisible
} from "./ticketVisibility";

describe("ticket visibility", () => {
  it("shares the open tab with regular users", () => {
    expect(isSharedOpenTicketView("user", "open")).toBe(true);
    expect(isSharedOpenTicketView("user", "pending")).toBe(false);
    expect(isSharedOpenTicketView("admin", "open")).toBe(false);
    expect(isSharedOpenTicketView("user", "open", true)).toBe(false);
  });

  it("shows unassigned tickets even outside the shared open view", () => {
    expect(isTicketQueueVisible({ queueId: null }, [], false)).toBe(true);
  });

  it("shows every queue in the shared open view", () => {
    expect(isTicketQueueVisible({ queueId: 99 }, [13], true)).toBe(true);
  });

  it("keeps queue filtering outside the shared open view", () => {
    expect(isTicketQueueVisible({ queueId: 13 }, [13], false)).toBe(true);
    expect(isTicketQueueVisible({ queueId: 99 }, [13], false)).toBe(false);
  });

  it("normalizes socket and API queue shapes", () => {
    expect(getTicketQueueId({ queue: { id: 11 } })).toBe(11);
    expect(getTicketQueueId({ queueId: 12 })).toBe(12);
  });
});
