import moment, { Moment } from "moment";
import AppError from "../../errors/AppError";

const FORMAT = "YYYY-MM-DD";

const civil = (value: string): Moment => {
  const parsed = moment.utc(value, FORMAT, true);
  if (!parsed.isValid()) throw new AppError("ERR_INVALID_BILLING_DATE");
  return parsed.startOf("day");
};

export const resolveTrialEndsAt = (
  anchor: string,
  trialDays: number
): string => {
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 3650)
    throw new AppError("ERR_INVALID_TRIAL_DAYS");
  return civil(anchor).add(trialDays, "days").format(FORMAT);
};

export const resolveDueDate = (
  year: number,
  month: number,
  dueDay: number
): string => {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)
    throw new AppError("ERR_INVALID_DUE_DAY");
  const base = moment.utc({ year, month, day: 1 });
  return base.date(Math.min(dueDay, base.daysInMonth())).format(FORMAT);
};

export const firstBillableDueDate = (
  trialEndsAt: string,
  dueDay: number
): string => {
  const start = civil(trialEndsAt);
  let due = civil(resolveDueDate(start.year(), start.month(), dueDay));
  if (!due.isAfter(start, "day")) {
    const next = start.clone().add(1, "month");
    due = civil(resolveDueDate(next.year(), next.month(), dueDay));
  }
  return due.format(FORMAT);
};

export const recurrenceMonths = (recurrence?: string): number => {
  const periods: Record<string, number> = {
    MENSAL: 1,
    BIMESTRAL: 2,
    TRIMESTRAL: 3,
    SEMESTRAL: 6,
    ANUAL: 12
  };
  return periods[recurrence || "MENSAL"] || 1;
};

export const nextRecurringDueDate = (
  currentDueDate: string,
  dueDay: number,
  recurrence?: string
): string => {
  const current = civil(currentDueDate).add(
    recurrenceMonths(recurrence),
    "month"
  );
  return resolveDueDate(current.year(), current.month(), dueDay);
};

export const todayCivil = (): string => moment.utc().format(FORMAT);
