import type { AgeFilter, LabelFilter, WeightFilter } from '$lib/filters/registrations';

/** Table sort/filter state persisted per contest. */
export interface TablePrefs {
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  weightFilter: WeightFilter;
  ageFilter: AgeFilter;
  labelFilter: LabelFilter;
}

export interface TablePrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const TABLE_PREFS_NAMESPACE = 'werewolf:contest-table';

export function tablePrefsKey(contestId: string): string {
  return `${TABLE_PREFS_NAMESPACE}:${contestId}`;
}

function resolveStorage(storage?: TablePrefsStorage | null): TablePrefsStorage | null {
  if (storage) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function readTablePrefs(
  contestId: string,
  storage?: TablePrefsStorage | null,
): TablePrefs | null {
  const target = resolveStorage(storage);
  if (!target || !contestId) return null;

  try {
    const raw = target.getItem(tablePrefsKey(contestId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const sortColumnPref =
      typeof parsed['sortColumn'] === 'string' && parsed['sortColumn'].length > 0
        ? parsed['sortColumn']
        : 'order';
    const sortDirectionPref: 'asc' | 'desc' = parsed['sortDirection'] === 'desc' ? 'desc' : 'asc';
    const savedWeightFilter =
      typeof parsed['weightFilter'] === 'string'
        ? parsed['weightFilter']
        : typeof parsed['flightFilter'] === 'string'
          ? parsed['flightFilter']
          : 'ALL';

    let weightPref: WeightFilter = 'ALL';
    if (
      savedWeightFilter === 'FEMALE_OPEN' ||
      savedWeightFilter === 'MALE_OPEN' ||
      savedWeightFilter === 'ALL'
    ) {
      weightPref = savedWeightFilter;
    } else if (savedWeightFilter.length > 0 && savedWeightFilter !== 'OPEN') {
      weightPref = savedWeightFilter as WeightFilter;
    }

    const savedAgeFilter: AgeFilter =
      typeof parsed['ageFilter'] === 'string' && parsed['ageFilter'].length > 0
        ? (parsed['ageFilter'] as AgeFilter)
        : 'ALL';
    const savedLabelFilter: LabelFilter =
      typeof parsed['labelFilter'] === 'string' && parsed['labelFilter'].length > 0
        ? (parsed['labelFilter'] as LabelFilter)
        : 'ALL';

    return {
      sortColumn: sortColumnPref,
      sortDirection: sortDirectionPref,
      weightFilter: weightPref,
      ageFilter: savedAgeFilter,
      labelFilter: savedLabelFilter,
    };
  } catch (error) {
    console.warn('Failed to read table preferences', error);
    return null;
  }
}

/**
 * Persists an already-built payload. Callers must build the payload inside the
 * reactive statement that calls this, otherwise Svelte cannot see which table
 * state the preference write depends on and the write never re-runs.
 */
export function persistTablePrefs(
  prefs: TablePrefs,
  contestId: string,
  storage?: TablePrefsStorage | null,
): void {
  const target = resolveStorage(storage);
  if (!target || !contestId) return;

  try {
    target.setItem(tablePrefsKey(contestId), JSON.stringify(prefs));
  } catch (error) {
    console.warn('Failed to persist table preferences', error);
  }
}
