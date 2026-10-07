import { describe, it, expect } from 'vitest';
import { buildTeamResultsExportModel } from '../team-results';
import { serialiseCsv } from '../csv';
import type { TeamResultsTable } from '$lib/types';

/** The organizer team export contract; the public page must not change these. */
const TEAM_COLUMN_KEYS = [
  'place',
  'teamOrLifter',
  'gender',
  'bodyweight',
  'weightClass',
  'age',
  'ageCategory',
  'liftType',
  'bestLift',
  'reshel',
  'mcc',
  'points',
];

const table: TeamResultsTable = {
  metric: 'mixed',
  rows: [
    {
      club: 'Klub "Wilk"; Sekcja',
      rank: 1,
      totalPoints: 100.5,
      contributors: [
        {
          registrationId: 'reg-1',
          firstName: 'Jan',
          lastName: 'Kowalski',
          gender: 'Male',
          bodyweight: 83,
          ageCategory: 'Senior',
          weightClass: '83 kg',
          ageYears: 26,
          points: 100.5,
          coefficientPoints: 0,
          squatPoints: 0,
          benchPoints: 0,
          deadliftPoints: 0,
          bestSquat: 0,
          bestBench: 150,
          bestDeadlift: 0,
          totalWeight: 150,
          reshelCoefficient: 1.05,
          mcculloughCoefficient: 1.1,
          selectedLift: 'bench',
          isPlaceholder: false,
        },
      ],
    },
  ],
};

const translate = (key: string) => key;

describe('team results export model', () => {
  it('keeps the twelve organizer columns and their headers', () => {
    const model = buildTeamResultsExportModel({ table, translate });

    expect(model.columns.map((column) => column.key)).toEqual(TEAM_COLUMN_KEYS);
    expect(model.columns.map((column) => column.header)).toEqual([
      'contest_detail.team_results.columns.place',
      'contest_detail.team_results.columns.team_or_lifter',
      'contest_detail.team_results.columns.gender',
      'contest_detail.team_results.columns.bodyweight',
      'contest_detail.team_results.columns.weight_class',
      'contest_detail.team_results.columns.age',
      'contest_detail.team_results.columns.age_category',
      'contest_detail.team_results.labels.lift_types._header',
      'contest_detail.team_results.columns.lift_weight',
      'contest_detail.team_results.columns.reshel',
      'contest_detail.team_results.columns.mcc',
      'contest_detail.team_results.columns.lift_points',
    ]);
  });

  it('serialises the model with quoted, doubled values through the shared CSV writer', () => {
    const model = buildTeamResultsExportModel({ table, translate });
    const rows = serialiseCsv(model).split('\r\n');

    expect(rows[0]).toBe(model.columns.map((column) => column.header).join(';'));
    expect(rows[1]).toBe(
      '1;"Klub ""Wilk""; Sekcja\n1/5 contest_detail.team_results.labels.slots_filled";–;–;–;–;–;–;–;–;–;100.50'
    );
    expect(rows[2]).toContain('Jan Kowalski');
    expect(rows[2]).toContain('150.0 kg');
  });
});
