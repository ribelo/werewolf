import { describe, it, expect } from 'vitest';
import type { TeamResultInput } from '../services/team-results';
import { computeTeamResults } from '../services/team-results';

function createMember(
  overrides: Partial<TeamResultInput> & Pick<TeamResultInput, 'registrationId' | 'firstName' | 'lastName' | 'gender' | 'club'>,
): TeamResultInput {
  return {
    competitorId: `${overrides.registrationId}-competitor`,
    coefficientPoints: 0,
    squatPoints: 0,
    benchPoints: 0,
    deadliftPoints: 0,
    bestSquat: 0,
    bestBench: 0,
    bestDeadlift: 0,
    totalWeight: 0,
    bodyweight: 90,
    ageCategory: 'Open',
    weightClass: '90',
    isDisqualified: false,
    ...overrides,
  };
}

describe('computeTeamResults', () => {
  it('ranks clubs using the best single-lift points from four men and one woman', () => {
    const titanMembers: TeamResultInput[] = [
      createMember({
        registrationId: 'titan-m1',
        firstName: 'Adam',
        lastName: 'Nowak',
        gender: 'Male',
        club: 'Titan Gym',
        coefficientPoints: 82,
        squatPoints: 30,
        benchPoints: 24,
        deadliftPoints: 28,
        bestSquat: 245,
        bestBench: 165,
        bestDeadlift: 275,
        totalWeight: 720,
        bodyweight: 92,
      }),
      createMember({
        registrationId: 'titan-m2',
        firstName: 'Bartek',
        lastName: 'Kania',
        gender: 'Male',
        club: 'Titan Gym',
        coefficientPoints: 79,
        squatPoints: 29,
        benchPoints: 23,
        deadliftPoints: 27,
        bestSquat: 240,
        bestBench: 160,
        bestDeadlift: 270,
        totalWeight: 703,
        bodyweight: 90,
      }),
      createMember({
        registrationId: 'titan-m3',
        firstName: 'Cezary',
        lastName: 'Lis',
        gender: 'Male',
        club: 'Titan Gym',
        coefficientPoints: 76,
        squatPoints: 28,
        benchPoints: 22,
        deadliftPoints: 26,
        bestSquat: 235,
        bestBench: 155,
        bestDeadlift: 265,
        totalWeight: 690,
        bodyweight: 88,
      }),
      createMember({
        registrationId: 'titan-m4',
        firstName: 'Dawid',
        lastName: 'Urban',
        gender: 'Male',
        club: 'Titan Gym',
        coefficientPoints: 74,
        squatPoints: 27,
        benchPoints: 21,
        deadliftPoints: 25,
        bestSquat: 230,
        bestBench: 150,
        bestDeadlift: 260,
        totalWeight: 675,
        bodyweight: 89,
      }),
      createMember({
        registrationId: 'titan-m5',
        firstName: 'Eryk',
        lastName: 'Wolski',
        gender: 'Male',
        club: 'Titan Gym',
        coefficientPoints: 60,
        squatPoints: 35,
        benchPoints: 18,
        deadliftPoints: 20,
        bestSquat: 255,
        bestBench: 140,
        bestDeadlift: 245,
        totalWeight: 640,
        bodyweight: 95,
      }),
      createMember({
        registrationId: 'titan-f1',
        firstName: 'Karolina',
        lastName: 'Mazur',
        gender: 'Female',
        club: 'Titan Gym',
        coefficientPoints: 78,
        squatPoints: 32,
        benchPoints: 19,
        deadliftPoints: 24,
        bestSquat: 210,
        bestBench: 110,
        bestDeadlift: 230,
        totalWeight: 550,
        bodyweight: 68,
      }),
      createMember({
        registrationId: 'titan-f2',
        firstName: 'Lena',
        lastName: 'Zięba',
        gender: 'Female',
        club: 'Titan Gym',
        coefficientPoints: 55,
        squatPoints: 20,
        benchPoints: 16,
        deadliftPoints: 18,
        bestSquat: 180,
        bestBench: 105,
        bestDeadlift: 200,
        totalWeight: 485,
        bodyweight: 70,
      }),
    ];

    const ironMembers: TeamResultInput[] = [
      createMember({
        registrationId: 'iron-m1',
        firstName: 'Filip',
        lastName: 'Adamczyk',
        gender: 'Male',
        club: 'Iron Club',
        coefficientPoints: 85,
        squatPoints: 31,
        benchPoints: 26,
        deadliftPoints: 30,
        bestSquat: 250,
        bestBench: 170,
        bestDeadlift: 285,
        totalWeight: 735,
        bodyweight: 94,
      }),
      createMember({
        registrationId: 'iron-m2',
        firstName: 'Grzegorz',
        lastName: 'Borowik',
        gender: 'Male',
        club: 'Iron Club',
        coefficientPoints: 83,
        squatPoints: 30,
        benchPoints: 25,
        deadliftPoints: 29,
        bestSquat: 248,
        bestBench: 168,
        bestDeadlift: 280,
        totalWeight: 725,
        bodyweight: 93,
      }),
      createMember({
        registrationId: 'iron-m3',
        firstName: 'Hubert',
        lastName: 'Ciepły',
        gender: 'Male',
        club: 'Iron Club',
        coefficientPoints: 80,
        squatPoints: 29,
        benchPoints: 23,
        deadliftPoints: 28,
        bestSquat: 245,
        bestBench: 165,
        bestDeadlift: 275,
        totalWeight: 715,
        bodyweight: 91,
      }),
      createMember({
        registrationId: 'iron-m4',
        firstName: 'Igor',
        lastName: 'Dudek',
        gender: 'Male',
        club: 'Iron Club',
        coefficientPoints: 77,
        squatPoints: 27,
        benchPoints: 22,
        deadliftPoints: 27,
        bestSquat: 240,
        bestBench: 160,
        bestDeadlift: 270,
        totalWeight: 705,
        bodyweight: 90,
      }),
      createMember({
        registrationId: 'iron-m5',
        firstName: 'Jan',
        lastName: 'Ficek',
        gender: 'Male',
        club: 'Iron Club',
        coefficientPoints: 72,
        squatPoints: 34,
        benchPoints: 18,
        deadliftPoints: 24,
        bestSquat: 260,
        bestBench: 150,
        bestDeadlift: 255,
        totalWeight: 670,
        bodyweight: 96,
      }),
      createMember({
        registrationId: 'iron-f1',
        firstName: 'Magda',
        lastName: 'Gajda',
        gender: 'Female',
        club: 'Iron Club',
        coefficientPoints: 81,
        squatPoints: 33,
        benchPoints: 20,
        deadliftPoints: 25,
        bestSquat: 215,
        bestBench: 112,
        bestDeadlift: 235,
        totalWeight: 562,
        bodyweight: 66,
      }),
      createMember({
        registrationId: 'iron-f2',
        firstName: 'Natalia',
        lastName: 'Hara',
        gender: 'Female',
        club: 'Iron Club',
        coefficientPoints: 58,
        squatPoints: 21,
        benchPoints: 17,
        deadliftPoints: 19,
        bestSquat: 185,
        bestBench: 108,
        bestDeadlift: 205,
        totalWeight: 498,
        bodyweight: 69,
      }),
    ];

    const results = computeTeamResults([...titanMembers, ...ironMembers]);

    const leaderboard = results.mixed.rows;
    expect(leaderboard).toHaveLength(2);

    const firstClub = leaderboard[0]!;
    const secondClub = leaderboard[1]!;

    expect(firstClub.club).toBe('Iron Club');
    expect(firstClub.rank).toBe(1);
    expect(firstClub.totalPoints).toBeCloseTo(157);

    expect(secondClub.club).toBe('Titan Gym');
    expect(secondClub.rank).toBe(2);
    expect(secondClub.totalPoints).toBeCloseTo(154);

    const titanContributors = secondClub.contributors.filter((contributor) => !contributor.isPlaceholder);
    expect(titanContributors).toHaveLength(5);
    const titanNames = titanContributors.map((contributor) => contributor.firstName).sort();
    expect(titanNames).toEqual(['Adam', 'Bartek', 'Cezary', 'Eryk', 'Karolina'].sort());
    expect(titanContributors.every((contributor) => contributor.gender === 'Male' || contributor.gender === 'Female')).toBe(true);
  });

  it('deduplicates mixed contributors by competitor and selects the highest-point lifts', () => {
    const totalForceMembers: TeamResultInput[] = [
      createMember({
        registrationId: 'force-m1',
        firstName: 'Adam',
        lastName: 'Nowak',
        gender: 'Male',
        club: 'Total Force',
        squatPoints: 105,
        benchPoints: 100,
        deadliftPoints: 90,
        bestSquat: 250,
        bestBench: 200,
        bestDeadlift: 240,
        totalWeight: 680,
        bodyweight: 93,
      }),
      createMember({
        registrationId: 'force-m2',
        firstName: 'Bartek',
        lastName: 'Kania',
        gender: 'Male',
        club: 'Total Force',
        squatPoints: 102,
        benchPoints: 99,
        deadliftPoints: 96,
        bestSquat: 245,
        bestBench: 198,
        bestDeadlift: 255,
        totalWeight: 670,
        bodyweight: 91,
      }),
      createMember({
        registrationId: 'force-m3',
        firstName: 'Cezary',
        lastName: 'Lis',
        gender: 'Male',
        club: 'Total Force',
        squatPoints: 101,
        benchPoints: 97,
        deadliftPoints: 98,
        bestSquat: 242,
        bestBench: 195,
        bestDeadlift: 252,
        totalWeight: 660,
        bodyweight: 90,
      }),
      createMember({
        registrationId: 'force-m4',
        firstName: 'Dawid',
        lastName: 'Urban',
        gender: 'Male',
        club: 'Total Force',
        squatPoints: 95,
        benchPoints: 94,
        deadliftPoints: 99,
        bestSquat: 235,
        bestBench: 190,
        bestDeadlift: 260,
        totalWeight: 640,
        bodyweight: 92,
      }),
      createMember({
        registrationId: 'force-m5',
        firstName: 'Eryk',
        lastName: 'Wolski',
        gender: 'Male',
        club: 'Total Force',
        squatPoints: 93,
        benchPoints: 92,
        deadliftPoints: 91,
        bestSquat: 230,
        bestBench: 188,
        bestDeadlift: 250,
        totalWeight: 630,
        bodyweight: 95,
      }),
      createMember({
        registrationId: 'force-f1',
        firstName: 'Anna',
        lastName: 'Mazur',
        gender: 'Female',
        club: 'Total Force',
        squatPoints: 88,
        benchPoints: 90,
        deadliftPoints: 87,
        bestSquat: 200,
        bestBench: 150,
        bestDeadlift: 210,
        totalWeight: 560,
        bodyweight: 68,
      }),
      createMember({
        registrationId: 'force-f2',
        firstName: 'Bella',
        lastName: 'Nowak',
        gender: 'Female',
        club: 'Total Force',
        squatPoints: 82,
        benchPoints: 85,
        deadliftPoints: 80,
        bestSquat: 190,
        bestBench: 145,
        bestDeadlift: 205,
        totalWeight: 540,
        bodyweight: 70,
      }),
    ];

    const results = computeTeamResults(totalForceMembers);
    const mixedRow = results.mixed.rows.find((row) => row.club === 'Total Force');

    expect(mixedRow).toBeDefined();
    const teamRow = mixedRow!;
    const activeContributors = teamRow.contributors.filter((contributor) => !contributor.isPlaceholder);
    expect(activeContributors).toHaveLength(5);
    const contributorNames = activeContributors.map((contributor) => contributor.firstName).sort();
    expect(contributorNames).toEqual(['Adam', 'Anna', 'Bartek', 'Cezary', 'Dawid'].sort());
    expect(teamRow.totalPoints).toBeCloseTo(105 + 102 + 101 + 99 + 90);
    expect(activeContributors.filter((contributor) => contributor.firstName === 'Adam')).toHaveLength(1);
    const annaContributor = activeContributors.find((contributor) => contributor.firstName === 'Anna');
    expect(annaContributor?.benchPoints).toBeCloseTo(90);
    expect(annaContributor?.bestBench).toBeCloseTo(150);
  });

  it('pads mixed results with placeholders when a club lacks enough lifters', () => {
    const limitedTeam: TeamResultInput[] = [
      createMember({
        registrationId: 'limited-m1',
        firstName: 'Olek',
        lastName: 'Jot',
        gender: 'Male',
        club: 'Limited Club',
        squatPoints: 80,
        benchPoints: 78,
        deadliftPoints: 0,
        bestSquat: 220,
        bestBench: 182,
        bestDeadlift: 0,
      }),
      createMember({
        registrationId: 'limited-m2',
        firstName: 'Piotr',
        lastName: 'Kas',
        gender: 'Male',
        club: 'Limited Club',
        squatPoints: 0,
        benchPoints: 75,
        deadliftPoints: 0,
        bestSquat: 0,
        bestBench: 175,
        bestDeadlift: 0,
      }),
    ];

    const results = computeTeamResults(limitedTeam);
    const mixedRow = results.mixed.rows.find((row) => row.club === 'Limited Club');

    expect(mixedRow).toBeDefined();
    const teamRow = mixedRow!;
    expect(teamRow.contributors).toHaveLength(5);
    const placeholders = teamRow.contributors.filter((contributor) => contributor.isPlaceholder);
    expect(placeholders).toHaveLength(3);
    const malePlaceholders = placeholders.filter((contributor) => contributor.gender === 'Male');
    const femalePlaceholders = placeholders.filter((contributor) => contributor.gender === 'Female');
    expect(malePlaceholders).toHaveLength(2);
    expect(femalePlaceholders).toHaveLength(1);
    const totalPoints = teamRow.contributors
      .filter((contributor) => !contributor.isPlaceholder)
      .reduce((sum, contributor) => sum + contributor.points, 0);
    expect(teamRow.totalPoints).toBeCloseTo(totalPoints);
  });

  it('pads missing slots with placeholders when a club lacks enough eligible lifters', () => {
    const incompleteTeam: TeamResultInput[] = [
      createMember({
        registrationId: 'alpha-m1',
        firstName: 'Olek',
        lastName: 'Jot',
        gender: 'Male',
        club: 'Alpha Club',
        coefficientPoints: 70,
        squatPoints: 25,
        benchPoints: 20,
        deadliftPoints: 22,
        bestSquat: 220,
        bestBench: 140,
        bestDeadlift: 240,
        totalWeight: 600,
      }),
      createMember({
        registrationId: 'alpha-m2',
        firstName: 'Piotr',
        lastName: 'Kas',
        gender: 'Male',
        club: 'Alpha Club',
        coefficientPoints: 68,
        squatPoints: 24,
        benchPoints: 19,
        deadliftPoints: 21,
        bestSquat: 215,
        bestBench: 138,
        bestDeadlift: 235,
        totalWeight: 588,
      }),
      createMember({
        registrationId: 'alpha-f1',
        firstName: 'Rita',
        lastName: 'Lew',
        gender: 'Female',
        club: 'Alpha Club',
        coefficientPoints: 65,
        squatPoints: 22,
        benchPoints: 18,
        deadliftPoints: 20,
        bestSquat: 190,
        bestBench: 110,
        bestDeadlift: 210,
        totalWeight: 520,
      }),
    ];

    const completeTeam: TeamResultInput[] = [
      createMember({
        registrationId: 'bravo-m1',
        firstName: 'Stefan',
        lastName: 'Mak',
        gender: 'Male',
        club: 'Bravo Club',
        coefficientPoints: 81,
        squatPoints: 30,
        benchPoints: 24,
        deadliftPoints: 26,
        bestSquat: 240,
        bestBench: 160,
        bestDeadlift: 265,
        totalWeight: 705,
      }),
      createMember({
        registrationId: 'bravo-m2',
        firstName: 'Tomek',
        lastName: 'Now',
        gender: 'Male',
        club: 'Bravo Club',
        coefficientPoints: 79,
        squatPoints: 29,
        benchPoints: 23,
        deadliftPoints: 25,
        bestSquat: 235,
        bestBench: 158,
        bestDeadlift: 260,
        totalWeight: 688,
      }),
      createMember({
        registrationId: 'bravo-m3',
        firstName: 'Ula',
        lastName: 'Ost',
        gender: 'Male',
        club: 'Bravo Club',
        coefficientPoints: 77,
        squatPoints: 28,
        benchPoints: 22,
        deadliftPoints: 24,
        bestSquat: 230,
        bestBench: 155,
        bestDeadlift: 255,
        totalWeight: 670,
      }),
      createMember({
        registrationId: 'bravo-m4',
        firstName: 'Wojtek',
        lastName: 'Paw',
        gender: 'Male',
        club: 'Bravo Club',
        coefficientPoints: 75,
        squatPoints: 27,
        benchPoints: 21,
        deadliftPoints: 23,
        bestSquat: 228,
        bestBench: 152,
        bestDeadlift: 250,
        totalWeight: 655,
      }),
      createMember({
        registrationId: 'bravo-m5',
        firstName: 'Zenon',
        lastName: 'Rut',
        gender: 'Male',
        club: 'Bravo Club',
        coefficientPoints: 60,
        squatPoints: 24,
        benchPoints: 18,
        deadliftPoints: 19,
        bestSquat: 215,
        bestBench: 145,
        bestDeadlift: 235,
        totalWeight: 620,
      }),
      createMember({
        registrationId: 'bravo-f1',
        firstName: 'Anna',
        lastName: 'Saw',
        gender: 'Female',
        club: 'Bravo Club',
        coefficientPoints: 70,
        squatPoints: 23,
        benchPoints: 19,
        deadliftPoints: 21,
        bestSquat: 195,
        bestBench: 112,
        bestDeadlift: 215,
        totalWeight: 530,
      }),
    ];

    const results = computeTeamResults([...incompleteTeam, ...completeTeam]);

    const clubs = results.mixed.rows.map((row) => row.club);
    expect(clubs).toEqual(['Bravo Club', 'Alpha Club']);

    const alphaRow = results.mixed.rows.find((row) => row.club === 'Alpha Club');
    expect(alphaRow).toBeDefined();
    expect(alphaRow?.contributors).toHaveLength(5);
    const placeholderCount = alphaRow?.contributors.filter((contributor) => contributor.isPlaceholder).length ?? 0;
    expect(placeholderCount).toBe(2);
    const alphaPoints = alphaRow?.totalPoints ?? 0;
    expect(alphaPoints).toBeGreaterThan(0);
  });
});
