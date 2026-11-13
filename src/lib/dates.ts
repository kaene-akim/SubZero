import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  isWeekend,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDaysInMonth,
} from "date-fns";

export type ISODate = string; // YYYY-MM-DD

/** Calendar date in a specific IANA time zone. */
export function todayInTimeZone(timeZone = "Europe/London", now = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidISODate(value: string | null | undefined): value is ISODate {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseISO(value);
  return !Number.isNaN(d.getTime()) && format(d, "yyyy-MM-dd") === value;
}

/** Date arithmetic on calendar dates, anchored at UTC noon to avoid DST drift. */
function anchor(iso: ISODate): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function unanchor(date: Date): ISODate {
  return format(date, "yyyy-MM-dd");
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return unanchor(addDays(anchor(iso), days));
}

export function addMonthsISO(iso: ISODate, months: number): ISODate {
  return unanchor(addMonths(anchor(iso), months));
}

export function addYearsISO(iso: ISODate, years: number): ISODate {
  return unanchor(addYears(anchor(iso), years));
}

/**
 * Add months while preserving an anchor day-of-month. Billing on the 31st
 * should fall on 28/29 February and return to the 31st in March, rather than
 * drifting backwards permanently.
 */
function addMonthsAnchored(iso: ISODate, months: number, anchorDay?: number): ISODate {
  const day = anchorDay ?? Number(iso.slice(8, 10));
  const base = anchor(iso);
  const shifted = addMonths(base, months);
  const lastDay = getDaysInMonth(shifted);
  const target = Math.min(Math.max(1, day), lastDay);
  const result = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), target, 12),
  );
  return unanchor(result);
}

export function addFrequency(
  iso: ISODate,
  frequency: string,
  count = 1,
  anchorDay?: number,
): ISODate {
  switch (frequency) {
    case "weekly":
      return unanchor(addWeeks(anchor(iso), count));
    case "fortnightly":
    case "biweekly":
      return unanchor(addWeeks(anchor(iso), 2 * count));
    case "monthly":
      return addMonthsAnchored(iso, count, anchorDay);
    case "quarterly":
      return addMonthsAnchored(iso, 3 * count, anchorDay);
    case "semiannual":
      return addMonthsAnchored(iso, 6 * count, anchorDay);
    case "annual":
      return addMonthsAnchored(iso, 12 * count, anchorDay);
    default:
      return addMonthsAnchored(iso, count, anchorDay);
  }
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(anchor(to), anchor(from));
}

export function isWeekendISO(iso: ISODate): boolean {
  return isWeekend(anchor(iso));
}

/** Shift backwards to the nearest weekday. Used when a provider only activates on business days. */
export function previousBusinessDay(iso: ISODate): ISODate {
  let d = iso;
  let guard = 0;
  while (isWeekendISO(d) && guard < 10) {
    d = addDaysISO(d, -1);
    guard++;
  }
  return d;
}

export function nextBusinessDay(iso: ISODate): ISODate {
  let d = iso;
  let guard = 0;
  while (isWeekendISO(d) && guard < 10) {
    d = addDaysISO(d, 1);
    guard++;
  }
  return d;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function formatDate(iso: string | null | undefined, locale = "en-GB"): string {
  if (!iso) return "—";
  const d = parseISO(iso.length > 10 ? iso : `${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function formatDateShort(iso: string | null | undefined, locale = "en-GB"): string {
  if (!iso) return "—";
  const d = parseISO(iso.length > 10 ? iso : `${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(d);
}

export function relativeFromNow(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  if (abs < 2_592_000_000) return rtf.format(Math.round(diff / 86_400_000), "day");
  if (abs < 31_536_000_000) return rtf.format(Math.round(diff / 2_592_000_000), "month");
  return rtf.format(Math.round(diff / 31_536_000_000), "year");
}

export function monthRange(iso: ISODate): { start: ISODate; end: ISODate; days: ISODate[] } {
  const d = anchor(iso);
  const start = unanchor(startOfMonth(d));
  const end = unanchor(endOfMonth(d));
  const days = eachDayOfInterval({ start: anchor(start), end: anchor(end) }).map(unanchor);
  return { start, end, days };
}

export function nextOccurrence(iso: ISODate, frequency: string, from: ISODate): ISODate {
  let next = iso;
  let guard = 0;
  while (next < from && guard < 240) {
    next = addFrequency(next, frequency);
    guard++;
  }
  return next;
}
