import { unassignedTicketRoom } from "../../helpers/TicketSocketRooms";

describe("TicketSocketRooms", () => {
  it("isolates unassigned ticket rooms by company and status", () => {
    expect(unassignedTicketRoom(9, "pending")).toBe(
      "company-9-unassigned-pending"
    );
    expect(unassignedTicketRoom(10, "pending")).not.toBe(
      unassignedTicketRoom(9, "pending")
    );
    expect(unassignedTicketRoom(9, "notification")).not.toBe(
      unassignedTicketRoom(9, "pending")
    );
  });
});
