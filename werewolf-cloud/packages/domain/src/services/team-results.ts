import type { Gender } from '../models/competitor';

const REQUIRED_MALE_COUNT = 4;
const REQUIRED_FEMALE_COUNT = 1;

export type TeamScoreMetric = 'overall' | 'squat' | 'bench' | 'deadlift';

export interface TeamResultInput {
  registrationId: string;
  competitorId?: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  club: string | null | undefined;
  coefficientPoints?: number | null;
  squatPoints?: number | null;
  benchPoints?: number | null;
  deadliftPoints?: number | null;
  bestSquat?: number | null;
  bestBench?: number | null;
  bestDeadlift?: number | null;
  totalWeight?: number | null;
  bodyweight?: number | null;
  ageCategory?: string | null;
  weightClass?: string | null;
  ageYears?: number | null;
  reshelCoefficient?: number | null;
  mcculloughCoefficient?: number | null;
  isDisqualified?: boolean | null;
}

export interface TeamResultContributor {
  registrationId: string;
  competitorId?: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  bodyweight: number | null;
  ageCategory: string | null;
  weightClass: string | null;
  ageYears: number | null;
  points: number;
  coefficientPoints: number;
  squatPoints: number;
  benchPoints: number;
  deadliftPoints: number;
  bestSquat: number;
  bestBench: number;
  bestDeadlift: number;
  totalWeight: number;
  reshelCoefficient: number | null;
  mcculloughCoefficient: number | null;
  isPlaceholder?: boolean;
}

export interface TeamResultRow {
  club: string;
  rank: number;
  totalPoints: number;
  overallPoints: number;
  contributors: TeamResultContributor[];
}

export interface TeamScoreboard {
  metric: TeamScoreMetric;
  rows: TeamResultRow[];
}

export interface TeamResultsBundle {
  overall: TeamScoreboard;
  squat: TeamScoreboard;
  bench: TeamScoreboard;
  deadlift: TeamScoreboard;
}

interface ScoreConfig {
  metric: TeamScoreMetric;
  pointsAccessor: (member: TeamResultInput) => number;
  totalAccessor?: (member: TeamResultInput) => number;
  liftAccessor?: (member: TeamResultInput) => number;
}

interface SelectedClubResult {
  totalPoints: number;
  contributors: TeamResultContributor[];
}

const scoreConfigs: ScoreConfig[] = [
  {
    metric: 'overall',
    pointsAccessor: (member) => numberOrZero(member.coefficientPoints),
    totalAccessor: (member) => numberOrZero(member.totalWeight),
  },
  {
    metric: 'squat',
    pointsAccessor: (member) => numberOrZero(member.squatPoints),
    liftAccessor: (member) => numberOrZero(member.bestSquat),
  },
  {
    metric: 'bench',
    pointsAccessor: (member) => numberOrZero(member.benchPoints),
    liftAccessor: (member) => numberOrZero(member.bestBench),
  },
  {
    metric: 'deadlift',
    pointsAccessor: (member) => numberOrZero(member.deadliftPoints),
    liftAccessor: (member) => numberOrZero(member.bestDeadlift),
  },
];

export function computeTeamResults(inputs: TeamResultInput[]): TeamResultsBundle {
  const grouped = groupByClub(inputs);

  const results: Record<TeamScoreMetric, TeamScoreboard> = {
    overall: { metric: 'overall', rows: [] },
    squat: { metric: 'squat', rows: [] },
    bench: { metric: 'bench', rows: [] },
    deadlift: { metric: 'deadlift', rows: [] },
  };

  for (const config of scoreConfigs) {
    const rows: TeamResultRow[] = [];

    for (const [club, members] of grouped.entries()) {
      const selection = selectContributorsForClub(club, members, config);
      if (!selection) continue;

      rows.push({
        club,
        rank: 0,
        totalPoints: selection.totalPoints,
        overallPoints: 0,
        contributors: selection.contributors,
      });
    }

    rows.sort((a, b) => compareTeamRows(a, b));
    assignRanks(rows);

    results[config.metric] = {
      metric: config.metric,
      rows,
    };
  }

  const overallLookup = new Map<string, number>();
  for (const row of results.overall.rows) {
    overallLookup.set(row.club, row.totalPoints);
    row.overallPoints = row.totalPoints;
  }

  for (const scoreboard of [results.squat, results.bench, results.deadlift]) {
    scoreboard.rows.forEach((row) => {
      row.overallPoints = overallLookup.get(row.club) ?? row.totalPoints;
    });
  }

  return {
    overall: results.overall,
    squat: results.squat,
    bench: results.bench,
    deadlift: results.deadlift,
  };
}

function groupByClub(inputs: TeamResultInput[]): Map<string, TeamResultInput[]> {
  const grouped = new Map<string, TeamResultInput[]>();

  for (const member of inputs) {
    if (member.isDisqualified) continue;
    if (member.gender !== 'Male' && member.gender !== 'Female') continue;

    const club = normaliseClub(member.club);
    if (!club) continue;

    const bucket = grouped.get(club);
    if (bucket) {
      bucket.push(member);
    } else {
      grouped.set(club, [member]);
    }
  }

  return grouped;
}

function normaliseClub(club: string | null | undefined): string | null {
  if (typeof club !== 'string') return null;
  const trimmed = club.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function numberOrZero(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normaliseCoefficient(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function createPlaceholderContributors(
  club: string,
  gender: Gender,
  missingCount: number,
): TeamResultContributor[] {
  if (missingCount <= 0) {
    return [];
  }

  const safeClubId = club.replace(/\s+/g, '-');

  return Array.from({ length: missingCount }, (_, index) => ({
    registrationId: `${safeClubId}::placeholder-${gender}-${index}`,
    firstName: '',
    lastName: '',
    gender,
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
    isPlaceholder: true,
  }));
}

function selectContributorsForClub(
  club: string,
  members: TeamResultInput[],
  config: ScoreConfig,
): SelectedClubResult | null {
  const maleCandidates = members.filter((member) => member.gender === 'Male');
  const femaleCandidates = members.filter((member) => member.gender === 'Female');

  if (maleCandidates.length + femaleCandidates.length === 0) {
    return null;
  }

  const comparator = createMemberComparator(config);
  maleCandidates.sort(comparator);
  femaleCandidates.sort(comparator);

  const selectedMales = maleCandidates.slice(0, REQUIRED_MALE_COUNT);
  const selectedFemales = femaleCandidates.slice(0, REQUIRED_FEMALE_COUNT);

  const selectedMembers = [...selectedMales, ...selectedFemales].sort(comparator);
  const contributors = selectedMembers.map((member) => toContributor(member, config));

  if (contributors.length === 0) {
    return null;
  }

  const paddedContributors = [
    ...contributors,
    ...createPlaceholderContributors(club, 'Male', REQUIRED_MALE_COUNT - selectedMales.length),
    ...createPlaceholderContributors(club, 'Female', REQUIRED_FEMALE_COUNT - selectedFemales.length),
  ];

  const totalPoints = contributors.reduce((sum, contributor) => sum + contributor.points, 0);

  return {
    totalPoints,
    contributors: paddedContributors,
  };
}

function createMemberComparator(config: ScoreConfig) {
  return (a: TeamResultInput, b: TeamResultInput): number => {
    const pointsDiff = config.pointsAccessor(b) - config.pointsAccessor(a);
    if (pointsDiff !== 0) {
      return pointsDiff;
    }

    if (config.totalAccessor) {
      const totalDiff = config.totalAccessor(b) - config.totalAccessor(a);
      if (totalDiff !== 0) {
        return totalDiff;
      }
    }

    if (config.liftAccessor) {
      const liftDiff = config.liftAccessor(b) - config.liftAccessor(a);
      if (liftDiff !== 0) {
        return liftDiff;
      }
    }

    const bodyweightDiff = numberOrZero(a.bodyweight) - numberOrZero(b.bodyweight);
    if (bodyweightDiff !== 0) {
      return bodyweightDiff;
    }

    return a.registrationId.localeCompare(b.registrationId);
  };
}

function toContributor(member: TeamResultInput, config: ScoreConfig): TeamResultContributor {
  const points = config.pointsAccessor(member);

  const contributor: TeamResultContributor = {
    registrationId: member.registrationId,
    firstName: member.firstName,
    lastName: member.lastName,
    gender: member.gender,
    bodyweight: member.bodyweight ?? null,
    ageCategory: member.ageCategory ?? null,
    weightClass: member.weightClass ?? null,
    ageYears: member.ageYears ?? null,
    points,
    coefficientPoints: numberOrZero(member.coefficientPoints),
    squatPoints: numberOrZero(member.squatPoints),
    benchPoints: numberOrZero(member.benchPoints),
   deadliftPoints: numberOrZero(member.deadliftPoints),
   bestSquat: numberOrZero(member.bestSquat),
   bestBench: numberOrZero(member.bestBench),
   bestDeadlift: numberOrZero(member.bestDeadlift),
    totalWeight: numberOrZero(member.totalWeight),
    reshelCoefficient: normaliseCoefficient(member.reshelCoefficient),
    mcculloughCoefficient: normaliseCoefficient(member.mcculloughCoefficient),
  };

  if (typeof member.competitorId === 'string' && member.competitorId.length > 0) {
    contributor.competitorId = member.competitorId;
  }

  return contributor;
}

function compareTeamRows(a: TeamResultRow, b: TeamResultRow): number {
  const totalDiff = b.totalPoints - a.totalPoints;
  if (totalDiff !== 0) {
    return totalDiff;
  }

  const maxLength = Math.max(a.contributors.length, b.contributors.length);
  for (let index = 0; index < maxLength; index += 1) {
    const aContributor = a.contributors[index];
    const bContributor = b.contributors[index];
    const aPoints = aContributor ? aContributor.points : 0;
    const bPoints = bContributor ? bContributor.points : 0;
    if (bPoints !== aPoints) {
      return bPoints - aPoints;
    }
  }

  return a.club.localeCompare(b.club);
}

function assignRanks(rows: TeamResultRow[]): void {
  let currentRank = 0;
  let previousRow: TeamResultRow | null = null;

  rows.forEach((row, index) => {
    if (previousRow && compareTeamRows(previousRow, row) === 0) {
      row.rank = currentRank;
    } else {
      currentRank = index + 1;
      row.rank = currentRank;
    }
    previousRow = row;
  });
}
