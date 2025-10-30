import { formatAgeClass, formatCoefficient, formatWeight, formatWeightClass } from '$lib/utils';
import type { AttemptNumber, LiftKind, UnifiedRow } from '$lib/contest-table';
import type { AgeCategory, AttemptStatus, Registration, WeightClass } from '$lib/types';

const attemptLabels: Record<AttemptNumber, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
};

const liftHeaderKey: Record<LiftKind, string> = {
  Squat: 'contest_table.lifts.squat',
  Bench: 'contest_table.lifts.bench',
  Deadlift: 'contest_table.lifts.deadlift',
};

const liftAbbrevKey: Record<LiftKind, string> = {
  Squat: 'contest_table.lifts_short.squat',
  Bench: 'contest_table.lifts_short.bench',
  Deadlift: 'contest_table.lifts_short.deadlift',
};

interface TableColumn {
  key: string;
  header: string;
}

export interface UnifiedTableExportModel {
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
}

export interface BuildUnifiedTableExportOptions {
  rows: UnifiedRow[];
  lifts: LiftKind[];
  attemptNumbers: AttemptNumber[];
  showPointsColumn: boolean;
  showMaxColumn: boolean;
  weightClasses: WeightClass[];
  ageCategories: AgeCategory[];
  translate: (key: string, params?: Record<string, unknown>) => string;
  statusLabels: Record<AttemptStatus, string>;
  showRowNumbers?: boolean;
}

function competitorMeta(registration: Registration): string | null {
  const parts: string[] = [];
  if (registration.city && registration.city.trim().length > 0) {
    parts.push(registration.city.trim());
  }
  if (registration.club && registration.club.trim().length > 0) {
    parts.push(registration.club.trim());
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join(' • ');
}

function formatBirthDateDisplay(value: string): string {
  return value.replace(/-/g, '\u2011');
}

function ageDisplay(row: UnifiedRow): { birth: string; age: string } {
  const birthDate = row.birthDate ?? row.registration.birthDate ?? null;
  const age = row.age ?? null;
  return {
    birth: birthDate ? `(${formatBirthDateDisplay(birthDate)})` : '—',
    age: age !== null ? `${age}` : '—',
  };
}

function resolveBestForLift(row: UnifiedRow, lift: LiftKind): number {
  switch (lift) {
    case 'Squat':
      return row.bestSquat;
    case 'Bench':
      return row.bestBench;
    case 'Deadlift':
      return row.bestDeadlift;
    default:
      return 0;
  }
}

function resolveMax(row: UnifiedRow, lifts: LiftKind[]): number {
  if (lifts.length === 1) {
    return resolveBestForLift(row, lifts[0]!);
  }
  return row.maxLift ?? 0;
}

function resolvePoints(row: UnifiedRow, lifts: LiftKind[]): number | null {
  if (lifts.length === 1) {
    const lift = lifts[0]!;
    return row.pointsByLift?.[lift] ?? row.points ?? null;
  }
  return row.points ?? null;
}

function attemptStatusString(
  weight: number | null | undefined,
  status: AttemptStatus | null,
  statusLabels: Record<AttemptStatus, string>,
  translate: (key: string, params?: Record<string, unknown>) => string
): string {
  if (!status) {
    return '—';
  }
  const statusLabel = statusLabels[status] ?? translate(`attempt.status.${status.toLowerCase()}`, {});
  const weightString = Number.isFinite(weight as number) && weight != null ? formatWeight(weight as number) : '—';
  if (weightString === '—') {
    return statusLabel;
  }
  return `${weightString} (${statusLabel})`;
}

export function buildUnifiedTableExportModel(
  options: BuildUnifiedTableExportOptions
): UnifiedTableExportModel {
  const {
    rows,
    lifts,
    attemptNumbers,
    showPointsColumn,
    showMaxColumn,
    weightClasses,
    ageCategories,
    translate,
    statusLabels,
    showRowNumbers = false,
  } = options;

  const hasSquat = lifts.includes('Squat');
  const hasBench = lifts.includes('Bench');
  const columns: TableColumn[] = [];

  if (showRowNumbers) {
    columns.push({ key: 'rowNumber', header: '#' });
  }

  columns.push(
    { key: 'name', header: translate('contest_table.columns.lifter') },
    { key: 'age', header: translate('contest_table.columns.age') },
    { key: 'bodyweight', header: translate('contest_table.columns.bodyweight') },
    { key: 'weightClass', header: translate('contest_table.columns.weight_class') },
    { key: 'ageClass', header: translate('contest_table.columns.age_class') },
    { key: 'reshel', header: translate('contest_table.columns.reshel') },
    { key: 'mccullough', header: translate('contest_table.columns.mccullough') }
  );

  if (hasSquat || hasBench) {
    columns.push({ key: 'rack', header: translate('contest_table.columns.rack') });
  }

  for (const lift of lifts) {
    for (const attemptNumber of attemptNumbers) {
      const header = `${translate(liftAbbrevKey[lift])} ${attemptLabels[attemptNumber]}`;
      columns.push({ key: `attempt:${lift}:${attemptNumber}`, header });
    }
  }

  if (showPointsColumn) {
    columns.push({ key: 'points', header: translate('contest_table.columns.points') });
  }

  if (showMaxColumn) {
    columns.push({ key: 'max', header: translate('contest_table.columns.max') });
  }

  const exportRows = rows.map((row, index) => {
    const registration = row.registration;
    const nameParts = [registration.lastName, registration.firstName].filter(Boolean);
    const primaryName = nameParts.length > 0 ? nameParts.join(' ') : '—';
    const meta = competitorMeta(registration);
    const ageInfo = ageDisplay(row);
    const rackLines: string[] = [];
    if (hasSquat) {
      rackLines.push(`SQ: ${registration.rackHeightSquat ?? '—'}`);
    }
    if (hasBench) {
      rackLines.push(`BP: ${registration.rackHeightBench ?? '—'}`);
    }

    const record: Record<string, string> = {};

    if (showRowNumbers) {
      record['rowNumber'] = (index + 1).toString();
    }

    Object.assign(record, {
      name: meta ? `${primaryName}\n${meta}` : primaryName,
      age: `${ageInfo.birth}\n${ageInfo.age}`,
      bodyweight: formatWeight(registration.bodyweight),
      weightClass:
        registration.weightClassName ??
        formatWeightClass(registration.weightClassId, weightClasses) ??
        '—',
      ageClass:
        formatAgeClass(registration.ageCategoryId, ageCategories) ??
        registration.ageCategoryName ??
        '—',
      reshel: formatCoefficient(registration.reshelCoefficient),
      mccullough: formatCoefficient(registration.mcculloughCoefficient),
    });

    if (hasSquat || hasBench) {
      record['rack'] = rackLines.join('\n');
    }

    for (const lift of lifts) {
      for (const attemptNumber of attemptNumbers) {
        const index = (attemptNumber as number) - 1;
        const cell = row.attempts?.[lift]?.[index] ?? null;
        const key = `attempt:${lift}:${attemptNumber}`;
        if (!cell || !cell.attempt) {
          record[key] = '—';
          continue;
        }
        const attempt = cell.attempt;
        const status = (attempt.status as AttemptStatus | null) ?? 'Pending';
        record[key] = attemptStatusString(
          attempt.weight ?? null,
          status,
          statusLabels,
          translate
        );
      }
    }

    if (showPointsColumn) {
      const points = resolvePoints(row, lifts);
      record['points'] = points !== null ? formatCoefficient(points) : '—';
    }

    if (showMaxColumn) {
      const max = resolveMax(row, lifts);
      record['max'] = max > 0 ? formatWeight(max) : '—';
    }

    return record;
  });

  return {
    columns,
    rows: exportRows,
  };
}
