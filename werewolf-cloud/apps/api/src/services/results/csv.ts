import { resolveAgeOnContestDate } from './age';
import type { ExportResultRow } from './rows';

export type AttemptExportRow = {
  registrationId: string;
  attemptNumber: number;
  weight: number | null;
  status: string | null;
};

export type SingleLiftExportConfig = {
  liftType: 'Bench' | 'Deadlift' | 'Squat';
  prefix: 'BP' | 'DL' | 'SQ';
};

export type SingleLiftExportRow = Record<string, string>;

export type SingleLiftExportEntry = {
  row: SingleLiftExportRow;
  gender: string | null;
  ageCategory: string | null;
  ageMin: number | null;
  ageMax: number | null;
};

export interface BuildSingleLiftExportRowsOptions {
  rows: ExportResultRow[];
  attemptsByRegistration: Map<string, AttemptExportRow[]>;
  contestDate: string | null;
  config: SingleLiftExportConfig;
}

export function resolveSingleLiftExportConfig(discipline: unknown): SingleLiftExportConfig | null {
  if (typeof discipline !== 'string') {
    return null;
  }
  switch (discipline) {
    case 'Bench':
      return { liftType: 'Bench', prefix: 'BP' };
    case 'Deadlift':
      return { liftType: 'Deadlift', prefix: 'DL' };
    case 'Squat':
      return { liftType: 'Squat', prefix: 'SQ' };
    default:
      return null;
  }
}

export function buildAttemptLookup(attempts: AttemptExportRow[]): Map<string, AttemptExportRow[]> {
  const lookup = new Map<string, AttemptExportRow[]>();
  for (const attempt of attempts) {
    if (!attempt.registrationId || typeof attempt.attemptNumber !== 'number') {
      continue;
    }
    const key = attempt.registrationId;
    const bucket = lookup.get(key) ?? [];
    const index = Math.min(Math.max(attempt.attemptNumber - 1, 0), 3);
    bucket[index] = attempt;
    lookup.set(key, bucket);
  }
  return lookup;
}

export function buildSingleLiftExportRows(options: BuildSingleLiftExportRowsOptions): SingleLiftExportEntry[] {
  const { rows, attemptsByRegistration, contestDate, config } = options;
  return rows.map((row) => {
    const attempts = attemptsByRegistration.get(row.registrationId) ?? [];
    const place = Boolean(row.isDisqualified) ? 'OUT' : (row.placeOpen ?? '').toString();
    const bodyweight = typeof row.bodyweight === 'number' ? row.bodyweight : null;
    const reshelCoefficient = typeof row.reshelCoefficient === 'number' ? row.reshelCoefficient : 1;
    const mcculloughCoefficient = typeof row.mcculloughCoefficient === 'number' ? row.mcculloughCoefficient : 1;
    const bestLift = getBestLiftValue(row, config);
    const reshelPoints = bestLift * reshelCoefficient;
    const points = getLiftPointsValue(row, config);
    const mccPoints = points ?? reshelPoints * mcculloughCoefficient;
    const age = resolveAgeOnContestDate(row.birthDate, contestDate);
    const attemptStrings = [0, 1, 2, 3].map((index) => formatAttemptValue(attempts[index]));

    const exportRow = {
      Place: place === 'NaN' ? '' : place,
      Name: row.firstName ?? '',
      Surname: row.lastName ?? '',
      Country: '',
      Age: age !== null ? formatDecimal(age, 0) : '',
      Weight: bodyweight !== null ? formatDecimal(bodyweight, 2) : '',
      'Age Class': row.ageCategory ?? '',
      'Weight Class': row.weightClass ?? '',
      // Export requirement: always emit RAW for division field
      Div: 'RAW',
      [`${config.prefix}1`]: attemptStrings[0],
      [`${config.prefix}2`]: attemptStrings[1],
      [`${config.prefix}3`]: attemptStrings[2],
      [`${config.prefix}4`]: attemptStrings[3],
      [`Total${config.prefix}`]: formatDecimal(bestLift, 2),
      [`Reshel${config.prefix}`]: formatDecimal(reshelPoints, 4),
      [`McCoulogh${config.prefix}`]: formatDecimal(mccPoints, 4),
    } as SingleLiftExportRow;

    return {
      row: exportRow,
      gender: row.gender ?? null,
      ageCategory: row.ageCategory ?? null,
      ageMin: typeof row.ageMin === 'number' ? row.ageMin : null,
      ageMax: typeof row.ageMax === 'number' ? row.ageMax : null,
    };
  });
}

export function serialiseSingleLiftCsv(entries: SingleLiftExportEntry[], config: SingleLiftExportConfig): string {
  const columns = createSingleLiftColumns(config.prefix);
  const header = columns.join(';');
  const lines: string[] = [];

  const groups = new Map<string, SingleLiftExportEntry[]>();

  for (const entry of entries) {
    const key = `${entry.gender ?? ''}|${entry.ageCategory ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  }

  const sortedKeys = Array.from(groups.keys()).sort((aKey, bKey) => {
    const a = groups.get(aKey)?.[0];
    const b = groups.get(bKey)?.[0];

    const sexRank = (gender: string | null | undefined) => {
      if (gender === 'Female') return 0;
      if (gender === 'Male') return 1;
      return 2;
    };

    const sexDiff = sexRank(a?.gender) - sexRank(b?.gender);
    if (sexDiff !== 0) return sexDiff;

    const aMin = a?.ageMin ?? Number.POSITIVE_INFINITY;
    const bMin = b?.ageMin ?? Number.POSITIVE_INFINITY;
    if (aMin !== bMin) return aMin - bMin;

    const aMax = a?.ageMax ?? Number.POSITIVE_INFINITY;
    const bMax = b?.ageMax ?? Number.POSITIVE_INFINITY;
    if (aMax !== bMax) return aMax - bMax;

    const aLabel = a?.ageCategory ?? '';
    const bLabel = b?.ageCategory ?? '';
    return aLabel.localeCompare(bLabel);
  });

  // Title row at top
  lines.push([escapeCsvValue(`${config.liftType.toUpperCase()} RESULTS`), ...Array(columns.length - 1).fill('')].join(';'));

  for (const key of sortedKeys) {
    const groupEntries = groups.get(key) ?? [];
    const sample = groupEntries[0];
    const genderLabel = sample?.gender === 'Male' ? 'MEN' : sample?.gender === 'Female' ? 'WOMEN' : 'ATHLETES';
    const ageLabel = sample?.ageCategory ?? 'Unassigned';
    const title = `${genderLabel} - ${ageLabel} RAW`;

    // Empty separator row
    lines.push('');
    // Title row in first column
    lines.push([escapeCsvValue(title), ...Array(columns.length - 1).fill('')].join(';'));
    // Header row
    lines.push(header);

    const sortedGroup = [...groupEntries].sort((a, b) => {
      const parseNum = (value: string | undefined) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      };

      const aPlace = parseNum(a.row['Place']);
      const bPlace = parseNum(b.row['Place']);
      if (aPlace !== bPlace) return aPlace - bPlace;

      const totalKey = `Total${config.prefix}`;
      const aTotal = parseNum(a.row[totalKey]);
      const bTotal = parseNum(b.row[totalKey]);
      if (aTotal !== bTotal) return bTotal - aTotal;

      return (a.row['Surname'] ?? '').localeCompare(b.row['Surname'] ?? '');
    });

    let localPlace = 1;
    for (const entry of sortedGroup) {
      const placeValue = entry.row['Place'] === 'OUT' ? 'OUT' : String(localPlace++);
      lines.push(columns.map((column) => {
        if (column === 'Place') {
          return escapeCsvValue(placeValue);
        }
        return escapeCsvValue(entry.row[column] ?? '');
      }).join(';'));
    }
  }

  return lines.join('\n');
}

export function createSingleLiftColumns(prefix: string): string[] {
  return [
    'Place',
    'Name',
    'Surname',
    'Country',
    'Age',
    'Weight',
    'Age Class',
    'Weight Class',
    'Div',
    `${prefix}1`,
    `${prefix}2`,
    `${prefix}3`,
    `${prefix}4`,
    `Total${prefix}`,
    `Reshel${prefix}`,
    `McCoulogh${prefix}`,
  ];
}

export function exportLegacyResultsCsv(rows: readonly ExportResultRow[]): string {
  let csv = 'Place;Name;Best Squat;Best Bench;Best Deadlift;Total;Squat Points;Bench Points;Deadlift Points;Coefficient Points\n';

  for (const result of rows) {
    csv += `${escapeCsvValue(result.placeOpen || '')};${escapeCsvValue(`${result.firstName} ${result.lastName}`)};${escapeCsvValue(result.bestSquat || 0)};${escapeCsvValue(result.bestBench || 0)};${escapeCsvValue(result.bestDeadlift || 0)};${escapeCsvValue(result.totalWeight || 0)};${escapeCsvValue(result.squatPoints || 0)};${escapeCsvValue(result.benchPoints || 0)};${escapeCsvValue(result.deadliftPoints || 0)};${escapeCsvValue(result.coefficientPoints || 0)}\n`;
  }

  return csv;
}

function getBestLiftValue(row: ExportResultRow, config: SingleLiftExportConfig): number {
  switch (config.liftType) {
    case 'Bench':
      return Number(row.bestBench ?? 0) || 0;
    case 'Deadlift':
      return Number(row.bestDeadlift ?? 0) || 0;
    case 'Squat':
      return Number(row.bestSquat ?? 0) || 0;
    default:
      return 0;
  }
}

function getLiftPointsValue(row: ExportResultRow, config: SingleLiftExportConfig): number | null {
  switch (config.liftType) {
    case 'Bench':
      return typeof row.benchPoints === 'number' ? row.benchPoints : null;
    case 'Deadlift':
      return typeof row.deadliftPoints === 'number' ? row.deadliftPoints : null;
    case 'Squat':
      return typeof row.squatPoints === 'number' ? row.squatPoints : null;
    default:
      return null;
  }
}

function formatAttemptValue(attempt?: AttemptExportRow): string {
  if (!attempt || attempt.weight === null || attempt.weight === undefined) {
    return '';
  }
  const weight = formatDecimal(attempt.weight, 2);
  if (!weight) {
    return '';
  }
  if (attempt.status === 'Failed') {
    return `-${weight}`;
  }
  return weight;
}

export function formatDecimal(value: number, decimals: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = value.toString();
  if (/[";\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
