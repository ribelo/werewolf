import type { LiftType } from '$lib/types';

export type ExportLift = Extract<LiftType, 'Squat' | 'Bench' | 'Deadlift'>;

/** Menu/tab id of each exportable lift. */
export type ExportMenuId = 'squat' | 'bench' | 'deadlift';

export const EXPORT_MENU_IDS: Record<ExportLift, ExportMenuId> = {
  Squat: 'squat',
  Bench: 'bench',
  Deadlift: 'deadlift',
};

export const POWERLIFTING_LIFTS: ExportLift[] = ['Squat', 'Bench', 'Deadlift'];

export const liftPrefixes: Record<ExportLift, { prefix: 'SQ' | 'BP' | 'DL'; label: string }> = {
  Squat: { prefix: 'SQ', label: 'Squat' },
  Bench: { prefix: 'BP', label: 'Benchpress' },
  Deadlift: { prefix: 'DL', label: 'Deadlift' },
};

export interface SingleLiftExportEntry {
  row: Record<string, string>;
  gender?: string | null;
  ageCategory?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
}

export interface GroupedJpgSection {
  title: string;
  columns: Array<{ key: string; header: string }>;
  rows: Record<string, string>[];
}

function sexRank(gender?: string | null): number {
  if (gender === 'Female') return 0;
  if (gender === 'Male') return 1;
  return 2;
}

/**
 * Groups single-lift export rows by sex and age class and numbers places inside
 * each group, matching the layout used on the printed single-lift sheets.
 */
export function buildGroupedJpgModel(
  entries: SingleLiftExportEntry[],
  lift: ExportLift
): GroupedJpgSection[] {
  const prefix = liftPrefixes[lift].prefix;
  const columns = [
    { key: 'Place', header: 'Place' },
    { key: 'Name', header: 'Name' },
    { key: 'Surname', header: 'Surname' },
    { key: 'Country', header: 'Country' },
    { key: 'Age', header: 'Age' },
    { key: 'Weight', header: 'Weight' },
    { key: 'Age Class', header: 'Age Class' },
    { key: 'Weight Class', header: 'Weight Class' },
    { key: 'Div', header: 'Div' },
    { key: `${prefix}1`, header: `${prefix}1` },
    { key: `${prefix}2`, header: `${prefix}2` },
    { key: `${prefix}3`, header: `${prefix}3` },
    { key: `${prefix}4`, header: `${prefix}4` },
    { key: `Total${prefix}`, header: `Total${prefix}` },
    { key: `Reshel${prefix}`, header: `Reshel${prefix}` },
    { key: `McCoulogh${prefix}`, header: `McCoulogh${prefix}` },
  ];

  const groups = new Map<string, SingleLiftExportEntry[]>();
  entries.forEach((entry) => {
    const key = `${entry.gender ?? ''}|${entry.ageCategory ?? ''}`;
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  });

  const sortedKeys = Array.from(groups.keys()).sort((aKey, bKey) => {
    const a = groups.get(aKey)?.[0];
    const b = groups.get(bKey)?.[0];

    const sexDifference = sexRank(a?.gender) - sexRank(b?.gender);
    if (sexDifference !== 0) return sexDifference;

    const aMin = typeof a?.ageMin === 'number' ? a.ageMin : Number.POSITIVE_INFINITY;
    const bMin = typeof b?.ageMin === 'number' ? b.ageMin : Number.POSITIVE_INFINITY;
    if (aMin !== bMin) return aMin - bMin;

    const aMax = typeof a?.ageMax === 'number' ? a.ageMax : Number.POSITIVE_INFINITY;
    const bMax = typeof b?.ageMax === 'number' ? b.ageMax : Number.POSITIVE_INFINITY;
    if (aMax !== bMax) return aMax - bMax;

    const aLabel = a?.ageCategory ?? '';
    const bLabel = b?.ageCategory ?? '';
    return aLabel.localeCompare(bLabel);
  });

  return sortedKeys.map((key) => {
    const list = groups.get(key) ?? [];
    const sample = list[0];
    const genderLabel = sample?.gender === 'Male' ? 'MEN' : sample?.gender === 'Female' ? 'WOMEN' : 'ATHLETES';
    const ageLabel = sample?.ageCategory ?? 'Unassigned';
    const totalKey = `Total${prefix}`;

    const parseNum = (value: string | undefined) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };

    const sorted = [...list].sort((a, b) => {
      const aPlace = parseNum(a.row['Place']);
      const bPlace = parseNum(b.row['Place']);
      if (aPlace !== bPlace) return aPlace - bPlace;
      const aTotal = parseNum(a.row[totalKey]);
      const bTotal = parseNum(b.row[totalKey]);
      if (aTotal !== bTotal) return bTotal - aTotal;
      return (a.row['Surname'] ?? '').localeCompare(b.row['Surname'] ?? '');
    });

    let localPlace = 1;
    const rows = sorted.map((entry) => {
      const placeValue = entry.row['Place'] === 'OUT' ? 'OUT' : String(localPlace++);
      const record: Record<string, string> = {};
      for (const column of columns) {
        record[column.key] = column.key === 'Place' ? placeValue : entry.row[column.key] ?? '';
      }
      return record;
    });

    return {
      title: `${genderLabel} - ${ageLabel} RAW`,
      columns,
      rows,
    };
  });
}

export interface ResultsFilenameInput {
  contestName: string | null | undefined;
  discipline: string | null | undefined;
  contestId: string;
  extension: 'csv' | 'json' | 'jpg';
}

const disciplineFilenameLabels: Record<string, string> = {
  Bench: 'Benchpress',
  Deadlift: 'Deadlift',
  Squat: 'Squat',
  Powerlifting: 'Powerlifting',
};

export function normaliseFilenameSegment(value: string): string {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

export function buildResultsFilename(input: ResultsFilenameInput): string {
  const nameSegment = normaliseFilenameSegment(input.contestName ?? '') || `contest_${input.contestId}`;
  const disciplineSegment =
    normaliseFilenameSegment(disciplineFilenameLabels[input.discipline ?? ''] ?? 'Results') || 'Results';
  return `${nameSegment}_${disciplineSegment}.${input.extension}`;
}

export function buildResultsFilenameWithLift(input: ResultsFilenameInput, lift?: ExportLift): string {
  const base = buildResultsFilename(input);
  if (!lift || input.discipline !== 'Powerlifting') return base;
  const liftLabel = normaliseFilenameSegment(disciplineFilenameLabels[lift] ?? lift) || lift;
  const [namePart, ...rest] = base.split('.');
  const extension = rest.pop() ?? input.extension;
  return `${namePart}_${liftLabel}.${extension}`;
}
