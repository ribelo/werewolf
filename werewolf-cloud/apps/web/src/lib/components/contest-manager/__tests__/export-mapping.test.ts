import { describe, expect, it } from 'vitest';
import {
  buildGroupedJpgModel,
  buildResultsFilename,
  buildResultsFilenameWithLift,
  type SingleLiftExportEntry,
} from '../export-mapping';

function entry(
  overrides: Partial<SingleLiftExportEntry> & { row?: Record<string, string> } = {},
): SingleLiftExportEntry {
  return {
    row: {},
    gender: 'Female',
    ageCategory: 'Senior',
    ageMin: 24,
    ageMax: 39,
    ...overrides,
  };
}

describe('buildGroupedJpgModel', () => {
  it('groups by sex and age class, women first, and renumbers places inside each group', () => {
    const sections = buildGroupedJpgModel(
      [
        entry({ row: { Place: '5', Surname: 'Nowak', BP1: '60' } }),
        entry({ row: { Place: '1', Surname: 'Kowalska', BP1: '70' } }),
        entry({
          row: { Place: '2', Surname: 'Kowalski', BP1: '120' },
          gender: 'Male',
          ageCategory: 'Open',
          ageMin: null,
          ageMax: null,
        }),
        entry({
          row: { Place: 'OUT', Surname: 'Zawadzka', BP1: '-' },
          gender: 'Female',
        }),
      ],
      'Bench',
    );

    expect(sections.map((section) => section.title)).toEqual([
      'WOMEN - Senior RAW',
      'MEN - Open RAW',
    ]);

    const [women, men] = sections;
    expect(women?.rows.map((row) => row['Place'])).toEqual(['1', '2', 'OUT']);
    expect(women?.rows.map((row) => row['Surname'])).toEqual(['Kowalska', 'Nowak', 'Zawadzka']);
    expect(men?.rows.map((row) => row['Place'])).toEqual(['1']);
    expect(women?.rows[0]?.['BP1']).toBe('70');
  });

  it('labels the attempt columns with the prefix of the exported lift', () => {
    const [squat] = buildGroupedJpgModel([entry({ row: { SQ1: '100' } })], 'Squat');
    const [deadlift] = buildGroupedJpgModel([entry({ row: { DL1: '200' } })], 'Deadlift');

    expect(squat?.columns.map((column) => column.key)).toContain('SQ1');
    expect(squat?.columns.map((column) => column.key)).toContain('TotalSQ');
    expect(deadlift?.columns.map((column) => column.key)).toContain('DL4');
    expect(deadlift?.rows[0]?.['DL1']).toBe('200');
    expect(deadlift?.rows[0]?.['SQ1']).toBeUndefined();
  });

  it('falls back to a generic section for rows without sex or age class', () => {
    const [section] = buildGroupedJpgModel(
      [entry({ gender: null, ageCategory: null, ageMin: null, ageMax: null, row: { Place: '1' } })],
      'Bench',
    );
    expect(section?.title).toBe('ATHLETES - Unassigned RAW');
  });

  it('orders rows by place, then by total, then by surname', () => {
    const [section] = buildGroupedJpgModel(
      [
        entry({ row: { Place: '1', Surname: 'Zed', TotalBP: '100' } }),
        entry({ row: { Place: '1', Surname: 'Alfa', TotalBP: '100' } }),
        entry({ row: { Place: '1', Surname: 'Beta', TotalBP: '150' } }),
      ],
      'Bench',
    );
    expect(section?.rows.map((row) => row['Surname'])).toEqual(['Beta', 'Alfa', 'Zed']);
  });
});

describe('results file names', () => {
  const base = {
    contestName: 'Mistrzostwa Polski',
    discipline: 'Powerlifting',
    contestId: 'contest-1',
    extension: 'csv' as const,
  };

  it('builds the contest and discipline file name', () => {
    expect(buildResultsFilename(base)).toBe('Mistrzostwa_Polski_Powerlifting.csv');
    expect(buildResultsFilename({ ...base, discipline: 'Bench', extension: 'jpg' })).toBe(
      'Mistrzostwa_Polski_Benchpress.jpg',
    );
  });

  it('falls back to the contest id when the name has no usable characters', () => {
    expect(buildResultsFilename({ ...base, contestName: '***' })).toBe(
      'contest_contest-1_Powerlifting.csv',
    );
  });

  it('adds the lift to powerlifting exports only', () => {
    expect(buildResultsFilenameWithLift(base, 'Bench')).toBe('Mistrzostwa_Polski_Powerlifting_Benchpress.csv');
    expect(buildResultsFilenameWithLift({ ...base, discipline: 'Bench' }, 'Bench')).toBe(
      'Mistrzostwa_Polski_Benchpress.csv',
    );
    expect(buildResultsFilenameWithLift(base)).toBe('Mistrzostwa_Polski_Powerlifting.csv');
  });
});
