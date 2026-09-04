import {
  firstBillableDueDate,
  nextRecurringDueDate,
  resolveDueDate,
  resolveTrialEndsAt
} from "../BillingDateService";
import { calculateProrataCents } from "../ProrataService";

describe("billing date and prorata rules", () => {
  it("implements the approved R$ 300 example exactly", () => {
    const trialEndsAt = resolveTrialEndsAt("2026-09-04", 15);
    const dueDate = firstBillableDueDate(trialEndsAt, 5);
    expect(trialEndsAt).toBe("2026-09-19");
    expect(dueDate).toBe("2026-10-05");
    expect(calculateProrataCents(30000, trialEndsAt, dueDate)).toBe(15871);
  });

  it.each([
    [2025, 1, 31, "2025-02-28"],
    [2024, 1, 31, "2024-02-29"],
    [2026, 3, 31, "2026-04-30"],
    [2026, 0, 31, "2026-01-31"]
  ])("clamps due day to the actual month", (year, month, day, expected) => {
    expect(resolveDueDate(year as number, month as number, day as number)).toBe(
      expected
    );
  });

  it("uses a strictly later due date when trial ends on due day", () => {
    expect(firstBillableDueDate("2026-09-05", 5)).toBe("2026-10-05");
    expect(calculateProrataCents(29990, "2026-09-05", "2026-10-05")).toBe(
      29990
    );
  });

  it("handles year boundaries and recurrence anchors", () => {
    expect(firstBillableDueDate("2026-12-31", 5)).toBe("2027-01-05");
    expect(nextRecurringDueDate("2024-02-29", 31, "MENSAL")).toBe("2024-03-31");
    expect(nextRecurringDueDate("2026-01-31", 31, "ANUAL")).toBe("2027-01-31");
  });

  it.each([
    ["MENSAL", "2026-02-28"],
    ["BIMESTRAL", "2026-03-31"],
    ["TRIMESTRAL", "2026-04-30"],
    ["SEMESTRAL", "2026-07-31"],
    ["ANUAL", "2027-01-31"]
  ])("preserves due-day anchors for %s", (recurrence, expected) => {
    expect(nextRecurringDueDate("2026-01-31", 31, recurrence)).toBe(expected);
  });

  it("keeps integer precision across month boundaries", () => {
    expect(calculateProrataCents(29990, "2024-02-20", "2024-04-05")).toBe(
      44330
    );
  });

  it("makes trial zero billable on the activation day", () => {
    expect(resolveTrialEndsAt("2026-09-04", 0)).toBe("2026-09-04");
  });
});
