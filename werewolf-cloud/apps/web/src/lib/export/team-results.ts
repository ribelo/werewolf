import type { UnifiedTableExportModel } from './unified-table';
import type { TeamResultsTable, TeamResultRow, TeamResultContributor } from '$lib/types';

interface TableColumn {
  key: string;
  header: string;
}

export interface BuildTeamResultsExportOptions {
  table: TeamResultsTable;
  translate: (key: string, params?: Record<string, unknown>) => string;
}

function formatLift(value?: number | null): string {
  const normalised = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(normalised) || normalised <= 0) {
    return '–';
  }
  return `${normalised.toFixed(1)} kg`;
}

function formatPoints(value?: number | null): string {
  const normalised = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(normalised) || normalised === 0) {
    return '0.00';
  }
  return normalised.toFixed(2);
}

function formatBodyweight(value?: number | null): string {
  const normalised = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(normalised) || normalised <= 0) {
    return '–';
  }
  return `${normalised.toFixed(2)} kg`;
}

function formatCoefficient(value?: number | null): string {
  const normalised = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(normalised) || normalised <= 0) {
    return '–';
  }
  return normalised.toFixed(3);
}

function formatMetricBest(contributor: TeamResultContributor): string {
  const selected = contributor.selectedLift;
  if (selected === 'squat') return formatLift(contributor.bestSquat);
  if (selected === 'bench') return formatLift(contributor.bestBench);
  if (selected === 'deadlift') return formatLift(contributor.bestDeadlift);
  return '–';
}

function formatMetricPoints(contributor: TeamResultContributor): string {
  return formatPoints(contributor.points);
}

function activeContributorCount(contributors: TeamResultContributor[]): number {
  return contributors.filter((contributor) => !contributor.isPlaceholder).length;
}

const liftLabelKeys: Record<string, string> = {
  squat: 'contest_detail.team_results.labels.lift_types.squat',
  bench: 'contest_detail.team_results.labels.lift_types.bench',
  deadlift: 'contest_detail.team_results.labels.lift_types.deadlift',
};

function getLiftKindKey(contributor: TeamResultContributor): string | null {
  if (contributor.isPlaceholder) return null;
  if (!contributor.selectedLift) return null;
  return liftLabelKeys[contributor.selectedLift] ?? null;
}

const sexLabelKeys: Record<string, string> = {
  Male: 'contest_detail.team_results.labels.sex_m',
  Female: 'contest_detail.team_results.labels.sex_f',
};

const placeholderLabelKeys: Record<string, string> = {
  Male: 'contest_detail.team_results.placeholder.male',
  Female: 'contest_detail.team_results.placeholder.female',
};

function compareRows(a: TeamResultRow, b: TeamResultRow): number {
  const metricDiff = b.totalPoints - a.totalPoints;
  if (Math.abs(metricDiff) > 0.0001) {
    return metricDiff;
  }
  return a.club.localeCompare(b.club);
}

export function buildTeamResultsExportModel(
  options: BuildTeamResultsExportOptions
): UnifiedTableExportModel {
  const { table, translate } = options;

  const columns: TableColumn[] = [
    { key: 'place', header: translate('contest_detail.team_results.columns.place') },
    { key: 'teamOrLifter', header: translate('contest_detail.team_results.columns.team_or_lifter') },
    { key: 'gender', header: translate('contest_detail.team_results.columns.gender') },
    { key: 'bodyweight', header: translate('contest_detail.team_results.columns.bodyweight') },
    { key: 'weightClass', header: translate('contest_detail.team_results.columns.weight_class') },
    { key: 'age', header: translate('contest_detail.team_results.columns.age') },
    { key: 'ageCategory', header: translate('contest_detail.team_results.columns.age_category') },
    { key: 'liftType', header: translate('contest_detail.team_results.labels.lift_types._header') },
    { key: 'bestLift', header: translate('contest_detail.team_results.columns.lift_weight') },
    { key: 'reshel', header: translate('contest_detail.team_results.columns.reshel') },
    { key: 'mcc', header: translate('contest_detail.team_results.columns.mcc') },
    { key: 'points', header: translate('contest_detail.team_results.columns.lift_points') },
  ];

  const sortedRows = [...table.rows].sort(compareRows);
  const rankedRows = sortedRows.map((row, index) => ({ row, displayRank: index + 1 }));

  const exportRows: Array<Record<string, string>> = [];

  for (const { row, displayRank } of rankedRows) {
    // Team header row
    exportRows.push({
      place: displayRank.toString(),
      teamOrLifter: `${row.club}\n${activeContributorCount(row.contributors)}/5 ${translate('contest_detail.team_results.labels.slots_filled')}`,
      gender: '–',
      bodyweight: '–',
      weightClass: '–',
      age: '–',
      ageCategory: '–',
      liftType: '–',
      bestLift: '–',
      reshel: '–',
      mcc: '–',
      points: formatPoints(row.totalPoints),
    });

    // Contributor rows
    for (const contributor of row.contributors) {
      exportRows.push({
        place: '–',
        teamOrLifter: contributor.isPlaceholder
          ? translate(placeholderLabelKeys[contributor.gender] ?? 'contest_detail.team_results.placeholder.generic')
          : `${contributor.firstName} ${contributor.lastName}`,
        gender: contributor.isPlaceholder
          ? '–'
          : translate(sexLabelKeys[contributor.gender] ?? 'contest_detail.team_results.labels.sex_unknown'),
        bodyweight: contributor.isPlaceholder ? '–' : formatBodyweight(contributor.bodyweight),
        weightClass: contributor.isPlaceholder ? '–' : (contributor.weightClass ?? '–'),
        age: contributor.isPlaceholder ? '–' : (typeof contributor.ageYears === 'number' ? String(contributor.ageYears) : '–'),
        ageCategory: contributor.isPlaceholder ? '–' : (contributor.ageCategory ?? '–'),
        liftType: contributor.isPlaceholder
          ? '–'
          : translate(getLiftKindKey(contributor) ?? 'contest_detail.team_results.labels.lift_types.unknown'),
        bestLift: contributor.isPlaceholder ? '–' : formatMetricBest(contributor),
        reshel: contributor.isPlaceholder ? '–' : formatCoefficient(contributor.reshelCoefficient),
        mcc: contributor.isPlaceholder ? '–' : formatCoefficient(contributor.mcculloughCoefficient),
        points: contributor.isPlaceholder
          ? '–'
          : formatMetricPoints(contributor),
      });
    }
  }

  return {
    columns,
    rows: exportRows,
  };
}