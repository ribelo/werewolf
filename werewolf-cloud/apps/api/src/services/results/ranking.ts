import type { TeamResultInput } from '@werewolf/domain/services/team-results';
import { MANDATORY_TAG_LABEL } from '../../utils/tags';
import { resolveAgeOnContestDate } from './age';
import type { RankingResultRow, TeamResultRow } from './rows';

type RankableRow = {
  coefficientPoints?: number | null;
  totalWeight?: number | null;
  bodyweight?: number | null;
  registrationId?: string | null;
};

export function hasTag(labels: readonly string[], tag: string): boolean {
  if (tag === MANDATORY_TAG_LABEL) {
    return labels.length === 0 || labels.includes(tag);
  }
  return labels.includes(tag);
}

export function compareResults(a: RankableRow, b: RankableRow): number {
  const pointsA = Number(a.coefficientPoints ?? 0);
  const pointsB = Number(b.coefficientPoints ?? 0);
  if (pointsA !== pointsB) {
    return pointsB - pointsA;
  }

  const totalA = Number(a.totalWeight ?? 0);
  const totalB = Number(b.totalWeight ?? 0);
  if (totalA !== totalB) {
    return totalB - totalA;
  }

  const bodyA = Number(a.bodyweight ?? 0);
  const bodyB = Number(b.bodyweight ?? 0);
  if (bodyA !== bodyB) {
    return bodyA - bodyB;
  }

  const idA = a.registrationId ?? '';
  const idB = b.registrationId ?? '';
  return idA.localeCompare(idB);
}

/** Rows that still compete in any individual ranking. */
export function activeRows(rows: readonly RankingResultRow[]): RankingResultRow[] {
  return rows.filter((row) => !row.isDisqualified);
}

/**
 * Open-ranking candidates: not disqualified and either untagged or carrying
 * the mandatory tag, optionally narrowed to one extra tag.
 */
export function filterOpenCandidates(
  rows: readonly RankingResultRow[],
  tag: string | null = null,
): RankingResultRow[] {
  const open = activeRows(rows).filter((row) => hasTag(row.labels, MANDATORY_TAG_LABEL));

  return tag === null ? open : open.filter((row) => hasTag(row.labels, tag));
}

/** Stored place wins when both rows have one; otherwise fall back to points. */
function byPlaceThenPoints(
  place: (row: RankingResultRow) => number | null,
): (a: RankingResultRow, b: RankingResultRow) => number {
  return (a, b) => {
    const placeA = place(a) ?? 0;
    const placeB = place(b) ?? 0;
    if (placeA && placeB && placeA !== placeB) {
      return placeA - placeB;
    }
    return compareResults(a, b);
  };
}

export function sortOpenRows(rows: readonly RankingResultRow[]): RankingResultRow[] {
  return [...rows].sort(byPlaceThenPoints((row) => row.placeOpen));
}

export function buildGroupedRankings(
  rows: readonly RankingResultRow[],
  category: (row: RankingResultRow) => string,
  place: (row: RankingResultRow) => number | null,
): RankingResultRow[] {
  const groups = new Map<string, RankingResultRow[]>();
  for (const row of rows) {
    const key = category(row);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  const ranked: RankingResultRow[] = [];
  for (const key of sortedKeys) {
    const group = groups.get(key) ?? [];
    ranked.push(...[...group].sort(byPlaceThenPoints(place)));
  }

  return ranked;
}

export function buildIndividualRankings(
  rows: readonly RankingResultRow[],
  options: { tag?: string | null } = {},
): { open: RankingResultRow[]; age: RankingResultRow[]; weight: RankingResultRow[] } {
  const candidates = filterOpenCandidates(rows, options.tag ?? null);

  return {
    open: sortOpenRows(candidates),
    age: buildGroupedRankings(
      candidates,
      (row) => row.ageCategory ?? 'Unassigned',
      (row) => row.placeInAgeClass,
    ),
    weight: buildGroupedRankings(
      candidates,
      (row) => row.weightClass ?? 'Unassigned',
      (row) => row.placeInWeightClass,
    ),
  };
}

/** Ad-hoc tag ranking: places are assigned by the order of this view, not stored ones. */
export function buildTagRankings(rows: readonly RankingResultRow[], tag: string): RankingResultRow[] {
  const tagged = activeRows(rows).filter((row) => hasTag(row.labels, tag));

  return [...tagged].sort(compareResults).map((row, index) => ({
    ...row,
    placeOpen: index + 1,
  }));
}

export function toTeamResultInputs(rows: readonly TeamResultRow[]): TeamResultInput[] {
  const inputs: TeamResultInput[] = [];

  for (const row of rows) {
    if (row.gender !== 'Male' && row.gender !== 'Female') {
      continue;
    }

    inputs.push({
      registrationId: row.registrationId,
      competitorId: row.competitorId,
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      club: row.club,
      coefficientPoints: row.coefficientPoints,
      squatPoints: row.squatPoints,
      benchPoints: row.benchPoints,
      deadliftPoints: row.deadliftPoints,
      bestSquat: row.bestSquat,
      bestBench: row.bestBench,
      bestDeadlift: row.bestDeadlift,
      totalWeight: row.totalWeight,
      bodyweight: row.bodyweight,
      ageCategory: row.ageCategory,
      weightClass: row.weightClass,
      ageYears: resolveAgeOnContestDate(row.birthDate, row.contestDate),
      reshelCoefficient: row.reshelCoefficient,
      mcculloughCoefficient: row.mcculloughCoefficient,
      isDisqualified: Boolean(row.isDisqualified),
    });
  }

  return inputs;
}
