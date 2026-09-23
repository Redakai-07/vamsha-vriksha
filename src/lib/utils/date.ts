import type { PartialDate } from "@/lib/domain/types";
import { nowIso } from "@/lib/utils/id";

/**
 * Dates in genealogy are often uncertain. We store them as strings with
 * varying precision ("1948", "1948-03", "1948-03-12") so nothing is invented
 * and lexicographic sorting still produces chronological order.
 */

const DATE_PATTERNS = [
  /^(\d{4})$/, // 1948
  /^(\d{4})-(\d{1,2})$/, // 1948-03
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // 1948-03-12
];

export type DatePrecision = "year" | "month" | "day";

export function datePrecision(value: PartialDate): DatePrecision | null {
  if (!value) return null;
  if (DATE_PATTERNS[0].test(value)) return "year";
  if (DATE_PATTERNS[1].test(value)) return "month";
  if (DATE_PATTERNS[2].test(value)) return "day";
  return null;
}

export function isValidPartialDate(value: string): boolean {
  return datePrecision(value) !== null;
}

/** Normalises loose user input: "1948/3/7" -> "1948-03-07". */
export function normalizeDateInput(raw: string): PartialDate {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.replace(/[/.]/g, "-").split("-").filter(Boolean);
  const [year, month, day] = parts;
  if (!year || !/^\d{4}$/.test(year)) return null;
  if (!month) return `${year}`;
  if (!day) return `${year}-${month.padStart(2, "0")}`;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats a partial date for display without inventing missing precision,
 * e.g. "1991" -> "1991", "1991-04" -> "April 1991".
 */
export function formatPartialDate(value: PartialDate, locale?: string): string {
  if (!value) return "";
  const precision = datePrecision(value);
  if (!precision) return value;
  const [year, month, day] = value.split("-");
  if (precision === "year") return year;
  const monthName = MONTHS[Number(month) - 1] ?? month;
  if (precision === "month") return `${monthName} ${year}`;
  if (locale === "iso") return `${year}-${month}-${day}`;
  return `${Number(day)} ${monthName} ${year}`;
}

/** Sortable numeric key; unknown dates sort last. */
export function dateSortKey(value: PartialDate): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const precision = datePrecision(value);
  if (!precision) return Number.POSITIVE_INFINITY;
  const [year, month = "01", day = "01"] = value.split("-");
  return Number(year) * 10000 + Number(month) * 100 + Number(day);
}

export function birthSortKey(dateOfBirth: PartialDate, fallback = Date.now()): number {
  const key = dateSortKey(dateOfBirth);
  return Number.isFinite(key) ? key : fallback;
}

/** "1948 – 2011" / "b. 1948" / "d. 2011" / "" */
export function formatLifespan(dob: PartialDate, dod: PartialDate): string {
  const born = formatPartialDate(dob);
  const died = formatPartialDate(dod);
  if (born && died) return `${born} – ${died}`;
  if (born) return `b. ${born}`;
  if (died) return `d. ${died}`;
  return "";
}

export function isDeceased(dod: PartialDate): boolean {
  return Boolean(dod);
}

/** Whole years between two partial dates, or null when it cannot be known. */
export function ageBetween(dob: PartialDate, dod: PartialDate): number | null {
  const precision = datePrecision(dob);
  if (!dob || precision === null) return null;
  const endKey = dod ? dateSortKey(dod) : dateSortKey(nowIso().slice(0, 10));
  const startKey = dateSortKey(dob);
  if (!Number.isFinite(endKey) || !Number.isFinite(startKey)) return null;
  return Math.max(0, Math.floor((endKey - startKey) / 10000));
}

export function describeAge(dob: PartialDate, dod: PartialDate): string | null {
  const years = ageBetween(dob, dod);
  if (years === null) return null;
  return dod ? `lived ${years} years` : `${years} years`;
}
