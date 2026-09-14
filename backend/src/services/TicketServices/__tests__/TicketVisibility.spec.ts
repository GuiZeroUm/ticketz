import { isSharedOpenView } from "../TicketVisibility";

describe("TicketVisibility", () => {
  it("shares every open ticket with regular users", () => {
    expect(isSharedOpenView("user", "open")).toBe(true);
  });

  it("keeps the regular queue rules outside the open tab", () => {
    expect(isSharedOpenView("user", "pending")).toBe(false);
    expect(isSharedOpenView("user", "closed")).toBe(false);
    expect(isSharedOpenView("user", undefined)).toBe(false);
  });

  it("does not change administrator visibility", () => {
    expect(isSharedOpenView("admin", "open")).toBe(false);
  });

  it("preserves the dedicated access rules for groups", () => {
    expect(isSharedOpenView("user", "open", true)).toBe(false);
  });
});
