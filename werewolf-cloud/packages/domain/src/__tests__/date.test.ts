import { describe, expect, it } from 'vitest';
import { ageOnDate, dateOnlySchema, isValidDateOnly, parseDateOnly } from '../utils/date';
import { contestCreateSchema } from '../models/contest';
import { competitorCreateSchema } from '../models/competitor';

const IMPOSSIBLE_OR_MALFORMED_DATES = [
  'prefix2025-09-20suffix',
  '2025-09-20T00:00:00Z',
  '2025-02-31',
  '2025-02-29',
  '1900-02-29',
  '2025-04-31',
  '2025-13-01',
  '2025-00-10',
  '2025-09-00',
  '2025-9-20',
  '20250920',
  '2025/09/20',
  '',
];

describe('parseDateOnly', () => {
  it('parses strict calendar dates into fields', () => {
    expect(parseDateOnly('2025-09-20')).toEqual({ year: 2025, month: 9, day: 20 });
    expect(parseDateOnly('2000-01-01')).toEqual({ year: 2000, month: 1, day: 1 });
  });

  it('accepts February 29 in leap years only', () => {
    expect(parseDateOnly('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseDateOnly('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
    expect(parseDateOnly('1900-02-29')).toBeNull();
    expect(parseDateOnly('2025-02-29')).toBeNull();
  });

  it('rejects malformed strings and impossible calendar dates', () => {
    for (const value of IMPOSSIBLE_OR_MALFORMED_DATES) {
      expect(parseDateOnly(value), value).toBeNull();
      expect(isValidDateOnly(value), value).toBe(false);
    }
  });

  it('accepts the last day of every month', () => {
    const monthEnds = ['2025-01-31', '2025-03-31', '2025-05-31', '2025-07-31', '2025-08-31', '2025-10-31', '2025-12-31', '2025-06-30', '2025-09-30', '2025-11-30'];
    for (const value of monthEnds) {
      expect(isValidDateOnly(value), value).toBe(true);
    }
  });
});

describe('ageOnDate', () => {
  it('counts a birthday that falls on the reference date as reached', () => {
    expect(ageOnDate('1960-03-01', '2025-03-01')).toBe(65);
  });

  it('subtracts a year before the birthday', () => {
    expect(ageOnDate('1960-03-02', '2025-03-01')).toBe(64);
    expect(ageOnDate('1960-04-01', '2025-03-31')).toBe(64);
  });

  it('handles leap-day birthdays', () => {
    expect(ageOnDate('1960-02-29', '2024-02-29')).toBe(64);
    expect(ageOnDate('1960-02-29', '2025-02-28')).toBe(64);
    expect(ageOnDate('1960-02-29', '2025-03-01')).toBe(65);
  });

  it('handles year and month boundaries', () => {
    expect(ageOnDate('2000-12-31', '2025-01-01')).toBe(24);
    expect(ageOnDate('2000-01-01', '2025-12-31')).toBe(25);
    expect(ageOnDate('2000-01-01', '2000-01-01')).toBe(0);
    expect(ageOnDate('2000-06-15', '2000-05-15')).toBe(-1);
  });

  it('returns null when either date is not a real calendar date', () => {
    expect(ageOnDate('invalid-date', '2025-01-01')).toBeNull();
    expect(ageOnDate('1960-03-01', 'prefix2025-03-01suffix')).toBeNull();
    expect(ageOnDate('1960-02-30', '2025-03-01')).toBeNull();
    expect(ageOnDate('1960-03-01', '2025-02-31')).toBeNull();
  });
});

describe('dateOnlySchema', () => {
  const validContest = { name: 'Test', date: '2025-09-20', location: 'Kraków', discipline: 'Powerlifting' } as const;

  it('accepts a real calendar date', () => {
    expect(contestCreateSchema.safeParse(validContest).success).toBe(true);
    expect(dateOnlySchema().safeParse('2024-02-29').success).toBe(true);
  });

  it('rejects malformed and impossible contest dates with the field message', () => {
    for (const date of ['prefix2025-09-20suffix', '2025-02-31', '2025-9-20', '2025-09-20T00:00:00Z']) {
      const parsed = contestCreateSchema.safeParse({ ...validContest, date });
      expect(parsed.success, date).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message, date).toBe('date must be YYYY-MM-DD');
      }
    }
  });

  it('rejects impossible birth dates with the field message', () => {
    const validCompetitor = { firstName: 'Jan', lastName: 'Kowalski', birthDate: '1990-02-28', gender: 'Male' } as const;
    expect(competitorCreateSchema.safeParse(validCompetitor).success).toBe(true);

    const parsed = competitorCreateSchema.safeParse({ ...validCompetitor, birthDate: '1990-02-31' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe('birthDate must be YYYY-MM-DD');
    }
  });
});
