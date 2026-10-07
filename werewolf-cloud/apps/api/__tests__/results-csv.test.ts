import { describe, it, expect } from 'vitest';
import {
  buildAttemptLookup,
  escapeCsvValue,
  formatDecimal,
  serialiseSingleLiftCsv,
  type SingleLiftExportEntry,
} from '../src/services/results/csv';
import { resolveAgeOnContestDate } from '../src/services/results/age';
import { hasTag } from '../src/services/results/ranking';

describe('formatDecimal', () => {
  it('trims trailing zeros and keeps significant decimals', () => {
    expect(formatDecimal(370, 2)).toBe('370');
    expect(formatDecimal(58.5, 2)).toBe('58.5');
    expect(formatDecimal(219.60000000000002, 2)).toBe('219.6');
    expect(formatDecimal(145.68, 4)).toBe('145.68');
    expect(formatDecimal(Number.NaN, 2)).toBe('');
  });
});

describe('escapeCsvValue', () => {
  it('quotes separators, quotes and newlines only', () => {
    expect(escapeCsvValue('Anna')).toBe('Anna');
    expect(escapeCsvValue('Anna;Kowalska')).toBe('"Anna;Kowalska"');
    expect(escapeCsvValue('An"na')).toBe('"An""na"');
    expect(escapeCsvValue('An\nna')).toBe('"An\nna"');
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(0)).toBe('0');
  });
});

describe('resolveAgeOnContestDate', () => {
  it('returns whole years on the contest date', () => {
    expect(resolveAgeOnContestDate('1990-06-14', '2025-06-14')).toBe(35);
    expect(resolveAgeOnContestDate('1990-06-15', '2025-06-14')).toBe(34);
    expect(resolveAgeOnContestDate('1960-02-29', '2024-02-29')).toBe(64);
  });

  it('returns null when a date is missing or not a real calendar date', () => {
    expect(resolveAgeOnContestDate(null, '2025-06-14')).toBeNull();
    expect(resolveAgeOnContestDate('1990-06-14', null)).toBeNull();
    expect(resolveAgeOnContestDate(undefined, undefined)).toBeNull();
    expect(resolveAgeOnContestDate('1990-06-14T00:00:00Z', '2025-06-14')).toBeNull();
    expect(resolveAgeOnContestDate('1990-02-30', '2025-06-14')).toBeNull();
  });
});

describe('hasTag', () => {
  it('treats an untagged competitor as open', () => {
    expect(hasTag([], 'Open')).toBe(true);
    expect(hasTag(['Open'], 'Open')).toBe(true);
    expect(hasTag(['vip'], 'Open')).toBe(false);
    expect(hasTag(['Open', 'vip'], 'vip')).toBe(true);
    expect(hasTag(['Open'], 'vip')).toBe(false);
  });
});

describe('buildAttemptLookup', () => {
  it('indexes attempts by their attempt number', () => {
    const lookup = buildAttemptLookup([
      { registrationId: 'reg-1', attemptNumber: 2, weight: 100, status: 'Successful' },
      { registrationId: 'reg-1', attemptNumber: 1, weight: 90, status: 'Failed' },
      { registrationId: '', attemptNumber: 1, weight: 50, status: 'Successful' },
    ]);

    expect(lookup.get('reg-1')?.[0]?.weight).toBe(90);
    expect(lookup.get('reg-1')?.[1]?.weight).toBe(100);
    expect(lookup.has('')).toBe(false);
  });
});

describe('serialiseSingleLiftCsv', () => {
  it('groups women before men and numbers places inside each group', () => {
    const csv = serialiseSingleLiftCsv(
      [
        entry({ gender: 'Male', surname: 'Zielinski' }),
        entry({ gender: 'Female', surname: 'Kowalska' }),
      ],
      { liftType: 'Bench', prefix: 'BP' },
    );

    expect(csv.startsWith('BENCH RESULTS;')).toBe(true);

    const titles = csv
      .split('\n')
      .filter((line) => line.startsWith('WOMEN') || line.startsWith('MEN'))
      .map((line) => line.split(';')[0]);
    expect(titles).toEqual(['WOMEN - Senior (24-39) RAW', 'MEN - Senior (24-39) RAW']);
  });
});

function entry(input: { gender: string; surname: string }): SingleLiftExportEntry {
  const ageCategory = 'Senior (24-39)';

  return {
    row: {
      Place: '1',
      Name: 'Anna',
      Surname: input.surname,
      Country: '',
      Age: '35',
      Weight: '90',
      'Age Class': ageCategory,
      'Weight Class': 'Do 95 kg',
      Div: 'RAW',
      BP1: '100',
      BP2: '',
      BP3: '',
      BP4: '',
      TotalBP: '100',
      ReshelBP: '91.5',
      McCouloghBP: '91.5',
    },
    gender: input.gender,
    ageCategory,
    ageMin: 24,
    ageMax: 39,
  };
}
