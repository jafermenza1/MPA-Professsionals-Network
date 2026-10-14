/**
 * Membership validity is inclusive of both start_date and end_date.
 * A recurring 365-day plan is treated as one calendar year (anniversary minus
 * one day), including leap years. Other configured durations are exact days.
 * Lifetime plans have no end date.
 */
export function membershipEndDate(startDate, feeTerms = {}) {
  if (feeTerms.durationDays === null || feeTerms.durationDays === undefined || feeTerms.durationDays === "") return null;
  const days = Number(feeTerms.durationDays);
  if (!Number.isInteger(days) || days < 1) throw new RangeError("Membership duration must be a positive whole number of days.");
  const start = startDate instanceof Date ? new Date(startDate) : new Date(String(startDate) + "T00:00:00.000Z");
  if (Number.isNaN(start.getTime())) throw new RangeError("Membership start date is invalid.");
  start.setUTCHours(0, 0, 0, 0);
  if (feeTerms.durationPolicy === "calendar_year_inclusive") {
    const end = new Date(start);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    return end;
  }
  return new Date(start.getTime() + days * 86400000 - 86400000);
}

export function isMembershipCurrent({ status, startDate, endDate }, today = new Date()) {
  if (status !== "active" || !startDate) return false;
  const date = today instanceof Date ? new Date(today) : new Date(today);
  const start = new Date(String(startDate).slice(0, 10) + "T00:00:00.000Z");
  const end = endDate ? new Date(String(endDate).slice(0, 10) + "T00:00:00.000Z") : null;
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return !Number.isNaN(start.getTime()) && start.getTime() <= current && (!end || end.getTime() >= current);
}
