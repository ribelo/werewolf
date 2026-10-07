import { z } from 'zod';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export interface DateOnly {
  year: number;
  month: number;
  day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Parses a strict `YYYY-MM-DD` string into calendar fields without going
 * through `Date`, so the result never depends on the host timezone.
 * Returns null for malformed strings and for impossible calendar dates.
 */
export function parseDateOnly(value: string): DateOnly | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [, yearPart, monthPart, dayPart] = match;
  if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
    return null;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (month < 1 || month > 12) {
    return null;
  }

  const monthLength = month === 2 && isLeapYear(year) ? 29 : (MONTH_LENGTHS[month - 1] ?? 0);
  if (day < 1 || day > monthLength) {
    return null;
  }

  return { year, month, day };
}

export function isValidDateOnly(value: string): boolean {
  return parseDateOnly(value) !== null;
}

/**
 * Whole years between two `YYYY-MM-DD` dates, computed from calendar fields
 * only so every timezone produces the same age. Returns null when either date
 * is not a real calendar date.
 */
export function ageOnDate(birthDate: string, onDate: string): number | null {
  const birth = parseDateOnly(birthDate);
  const on = parseDateOnly(onDate);
  if (!birth || !on) {
    return null;
  }

  const yearDiff = on.year - birth.year;
  const monthDiff = on.month - birth.month;
  const isBeforeBirthday = monthDiff < 0 || (monthDiff === 0 && on.day < birth.day);

  return isBeforeBirthday ? yearDiff - 1 : yearDiff;
}

/**
 * Zod schema for a strict date-only value: exactly `YYYY-MM-DD` and a real
 * calendar date (leap years included, impossible days rejected).
 */
export function dateOnlySchema(message = 'must be a valid date in YYYY-MM-DD format'): z.ZodType<string> {
  return z.string().regex(DATE_ONLY_PATTERN, message).refine(isValidDateOnly, message);
}
