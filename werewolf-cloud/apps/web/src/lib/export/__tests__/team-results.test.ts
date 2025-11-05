import { describe, it, expect } from 'vitest';
import { buildTeamResultsExportModel } from '$lib/export/team-results';
import type { TeamResultsTable } from '$lib/types';

describe('Team Results Export', () => {
  it('should build export model correctly', () => {
    const mockTable: TeamResultsTable = {
      metric: 'mixed',
      rows: [
        {
          club: 'Test Club',
          rank: 1,
          totalPoints: 100.5,
          contributors: [
            {
              registrationId: '1',
              firstName: 'John',
              lastName: 'Doe',
              gender: 'Male',
              bodyweight: 80.5,
              ageCategory: 'Senior',
              weightClass: '83kg',
              ageYears: 25,
              points: 50.25,
              coefficientPoints: 45.0,
              squatPoints: 0,
              benchPoints: 0,
              deadliftPoints: 0,
              bestSquat: 0,
              bestBench: 0,
              bestDeadlift: 0,
              totalWeight: 0,
              reshelCoefficient: 1.0,
              mcculloughCoefficient: 1.0,
              selectedLift: 'squat',
              isPlaceholder: false,
            },
            {
              registrationId: '2',
              firstName: 'Jane',
              lastName: 'Smith',
              gender: 'Female',
              bodyweight: 60.0,
              ageCategory: 'Senior',
              weightClass: '63kg',
              ageYears: 23,
              points: 50.25,
              coefficientPoints: 40.0,
              squatPoints: 0,
              benchPoints: 0,
              deadliftPoints: 0,
              bestSquat: 0,
              bestBench: 0,
              bestDeadlift: 0,
              totalWeight: 0,
              reshelCoefficient: 0.8,
              mcculloughCoefficient: 0.9,
              selectedLift: 'bench',
              isPlaceholder: false,
            },
          ],
        },
      ],
    };

    const mockTranslate = (key: string) => key;
    
    const model = buildTeamResultsExportModel({
      table: mockTable,
      translate: mockTranslate,
    });

    expect(model.columns).toHaveLength(12);
    expect(model.columns[0]?.key).toBe('place');
    expect(model.columns[1]?.key).toBe('teamOrLifter');
    
    // Should have team header row + contributor rows
    expect(model.rows).toHaveLength(3);
    
    // First row should be team header
    const firstRow = model.rows[0];
    if (firstRow) {
      expect(firstRow['place']).toBe('1');
      expect(firstRow['teamOrLifter']).toContain('Test Club');
      expect(firstRow['points']).toBe('100.50');
    }
    
    // Second row should be first contributor
    const secondRow = model.rows[1];
    if (secondRow) {
      expect(secondRow['place']).toBe('–');
      expect(secondRow['teamOrLifter']).toBe('John Doe');
      expect(secondRow['gender']).not.toBe('–');
    }
    
    // Third row should be second contributor  
    const thirdRow = model.rows[2];
    if (thirdRow) {
      expect(thirdRow['place']).toBe('–');
      expect(thirdRow['teamOrLifter']).toBe('Jane Smith');
      expect(thirdRow['gender']).not.toBe('–');
    }
  });

  it('should handle empty table', () => {
    const mockTable: TeamResultsTable = {
      metric: 'mixed',
      rows: [],
    };

    const mockTranslate = (key: string) => key;
    
    const model = buildTeamResultsExportModel({
      table: mockTable,
      translate: mockTranslate,
    });

    expect(model.columns).toHaveLength(12);
    expect(model.rows).toHaveLength(0);
  });

  it('should handle placeholder contributors', () => {
    const mockTable: TeamResultsTable = {
      metric: 'mixed',
      rows: [
        {
          club: 'Test Club',
          rank: 1,
          totalPoints: 50.25,
          contributors: [
            {
              registrationId: 'placeholder-1',
              firstName: '',
              lastName: '',
              gender: 'Male',
              bodyweight: null,
              ageCategory: null,
              weightClass: null,
              ageYears: null,
              points: 0,
              coefficientPoints: 0,
              squatPoints: 0,
              benchPoints: 0,
              deadliftPoints: 0,
              bestSquat: 0,
              bestBench: 0,
              bestDeadlift: 0,
              totalWeight: 0,
              reshelCoefficient: null,
              mcculloughCoefficient: null,
              selectedLift: null,
              isPlaceholder: true,
            },
          ],
        },
      ],
    };

    const mockTranslate = (key: string) => key;
    
    const model = buildTeamResultsExportModel({
      table: mockTable,
      translate: mockTranslate,
    });

    expect(model.rows).toHaveLength(2); // Team header + placeholder
    
    // Placeholder row should have dashes for most fields
    const placeholderRow = model.rows[1];
    if (placeholderRow) {
      expect(placeholderRow['teamOrLifter']).toContain('contest_detail.team_results.placeholder.male');
      expect(placeholderRow['gender']).toBe('–');
      expect(placeholderRow['bodyweight']).toBe('–');
    }
  });
});