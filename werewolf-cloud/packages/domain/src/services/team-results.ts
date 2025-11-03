import type { Gender } from '../models/competitor';

const REQUIRED_MALE_COUNT = 4;
const REQUIRED_FEMALE_COUNT = 1;

export type TeamScoreMetric = 'mixed';

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
  selectedLift: MixedLift | null;
  isPlaceholder?: boolean;
}

export interface TeamResultRow {
  club: string;
  rank: number;
  totalPoints: number;
  contributors: TeamResultContributor[];
}

export interface TeamScoreboard {
  metric: TeamScoreMetric;
  rows: TeamResultRow[];
}

export interface TeamResultsBundle {
  mixed: TeamScoreboard;
}

export function computeTeamResults(inputs: TeamResultInput[]): TeamResultsBundle {
  const grouped = groupByClub(inputs);
  const rows: TeamResultRow[] = [];

  for (const [club, members] of grouped.entries()) {
    const selection = selectMixedContributorsForClub(club, members);
    if (!selection) continue;

    rows.push({
      club,
      rank: 0,
      totalPoints: selection.totalPoints,
      contributors: selection.contributors,
    });
  }

  rows.sort((a, b) => compareTeamRows(a, b));
  assignRanks(rows);

  return {
    mixed: {
      metric: 'mixed',
      rows,
    },
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

type MixedLift = 'squat' | 'bench' | 'deadlift';

interface MixedLiftConfig {
  lift: MixedLift;
  pointsAccessor: (member: TeamResultInput) => number;
  bestAccessor: (member: TeamResultInput) => number;
}

interface MixedCandidate {
  member: TeamResultInput;
  lift: MixedLift;
  points: number;
  best: number;
}

const mixedLiftConfigs: MixedLiftConfig[] = [
  {
    lift: 'squat',
    pointsAccessor: (member) => numberOrZero(member.squatPoints),
    bestAccessor: (member) => numberOrZero(member.bestSquat),
  },
  {
    lift: 'bench',
    pointsAccessor: (member) => numberOrZero(member.benchPoints),
    bestAccessor: (member) => numberOrZero(member.bestBench),
  },
  {
    lift: 'deadlift',
    pointsAccessor: (member) => numberOrZero(member.deadliftPoints),
    bestAccessor: (member) => numberOrZero(member.bestDeadlift),
  },
];

function createMixedCandidates(members: TeamResultInput[], gender: Gender): MixedCandidate[] {
  const candidates: MixedCandidate[] = [];

  for (const member of members) {
    if (member.gender !== gender) continue;

    for (const config of mixedLiftConfigs) {
      const best = config.bestAccessor(member);
      const rawPoints = config.pointsAccessor(member);
      const reshel = normaliseCoefficient(member.reshelCoefficient) ?? 1;
      const mccullough = normaliseCoefficient(member.mcculloughCoefficient) ?? 1;
      const fallbackPoints = best > 0 ? best * reshel * mccullough : 0;
      const points = rawPoints > 0 ? rawPoints : fallbackPoints;
      if (points <= 0) continue;

      candidates.push({
        member,
        lift: config.lift,
        points,
        best,
      });
    }
  }

  return candidates;
}

function compareMixedCandidates(a: MixedCandidate, b: MixedCandidate): number {
  const pointsDiff = b.points - a.points;
  if (pointsDiff !== 0) {
    return pointsDiff;
  }

  const bestDiff = b.best - a.best;
  if (bestDiff !== 0) {
    return bestDiff;
  }

  const bodyweightDiff = numberOrZero(a.member.bodyweight) - numberOrZero(b.member.bodyweight);
  if (bodyweightDiff !== 0) {
    return bodyweightDiff;
  }

  return a.member.registrationId.localeCompare(b.member.registrationId);
}

function selectTopMixedCandidates(
  candidates: MixedCandidate[],
  requiredCount: number,
  usedCompetitors: Set<string>,
): MixedCandidate[] {
  const selected: MixedCandidate[] = [];

  for (const candidate of candidates) {
    const competitorKey = candidate.member.competitorId ?? candidate.member.registrationId;
    if (usedCompetitors.has(competitorKey)) {
      continue;
    }

    selected.push(candidate);
    usedCompetitors.add(competitorKey);

    if (selected.length >= requiredCount) {
      break;
    }
  }

  return selected;
}

function toMixedContributor(candidate: MixedCandidate): TeamResultContributor {
  const { member, lift, points, best } = candidate;

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
    squatPoints: lift === 'squat' ? points : 0,
    benchPoints: lift === 'bench' ? points : 0,
    deadliftPoints: lift === 'deadlift' ? points : 0,
    bestSquat: lift === 'squat' ? best : 0,
    bestBench: lift === 'bench' ? best : 0,
    bestDeadlift: lift === 'deadlift' ? best : 0,
    totalWeight: numberOrZero(member.totalWeight),
    reshelCoefficient: normaliseCoefficient(member.reshelCoefficient),
    mcculloughCoefficient: normaliseCoefficient(member.mcculloughCoefficient),
    selectedLift: lift,
  };

  if (typeof member.competitorId === 'string' && member.competitorId.length > 0) {
    contributor.competitorId = member.competitorId;
  }

  return contributor;
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
    selectedLift: null,
    isPlaceholder: true,
  }));
}

interface SelectedClubResult {
  totalPoints: number;
  contributors: TeamResultContributor[];
}

function selectMixedContributorsForClub(
  club: string,
  members: TeamResultInput[],
): SelectedClubResult | null {
  const maleCandidates = createMixedCandidates(members, 'Male').sort(compareMixedCandidates);
  const femaleCandidates = createMixedCandidates(members, 'Female').sort(compareMixedCandidates);

  if (maleCandidates.length + femaleCandidates.length === 0) {
    return null;
  }

  const usedCompetitors = new Set<string>();

  const selectedMales = selectTopMixedCandidates(maleCandidates, REQUIRED_MALE_COUNT, usedCompetitors);
  const selectedFemales = selectTopMixedCandidates(femaleCandidates, REQUIRED_FEMALE_COUNT, usedCompetitors);

  const selectedContributors = [
    ...selectedMales.map((candidate) => toMixedContributor(candidate)),
    ...selectedFemales.map((candidate) => toMixedContributor(candidate)),
  ];

  if (selectedContributors.length === 0) {
    return null;
  }

  const sortedContributors = [...selectedContributors].sort((a, b) => {
    const pointDiff = b.points - a.points;
    if (pointDiff !== 0) {
      return pointDiff;
    }

    const aBest = Math.max(a.bestSquat, a.bestBench, a.bestDeadlift);
    const bBest = Math.max(b.bestSquat, b.bestBench, b.bestDeadlift);
    const bestDiff = bBest - aBest;
    if (bestDiff !== 0) {
      return bestDiff;
    }

    const bodyweightDiff = numberOrZero(a.bodyweight) - numberOrZero(b.bodyweight);
    if (bodyweightDiff !== 0) {
      return bodyweightDiff;
    }

    return a.registrationId.localeCompare(b.registrationId);
  });

  const paddedContributors = [
    ...sortedContributors,
    ...createPlaceholderContributors(club, 'Male', REQUIRED_MALE_COUNT - selectedMales.length),
    ...createPlaceholderContributors(club, 'Female', REQUIRED_FEMALE_COUNT - selectedFemales.length),
  ];

  const totalPoints = sortedContributors.reduce((sum, contributor) => sum + contributor.points, 0);

  return {
    totalPoints,
    contributors: paddedContributors,
  };
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
