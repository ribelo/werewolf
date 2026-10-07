import { describe, expect, it, vi } from 'vitest';
import {
  persistTablePrefs,
  readTablePrefs,
  tablePrefsKey,
  type TablePrefs,
  type TablePrefsStorage,
} from '../table-prefs';

function createStorage(initial: Record<string, string> = {}): TablePrefsStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

const prefs: TablePrefs = {
  sortColumn: 'order',
  sortDirection: 'asc',
  weightFilter: 'ALL',
  ageFilter: 'ALL',
  labelFilter: 'ALL',
};

describe('table preferences persistence', () => {
  it('writes the payload under the contest-scoped key and reads it back', () => {
    const storage = createStorage();
    persistTablePrefs({ ...prefs, sortColumn: 'name', sortDirection: 'desc' }, 'contest-1', storage);

    expect(storage.entries.has(tablePrefsKey('contest-1'))).toBe(true);
    expect(readTablePrefs('contest-1', storage)).toEqual({
      ...prefs,
      sortColumn: 'name',
      sortDirection: 'desc',
    });
    expect(readTablePrefs('contest-2', storage)).toBeNull();
  });

  it('persists every sort and filter change', () => {
    const storage = createStorage();
    persistTablePrefs(prefs, 'contest-1', storage);
    persistTablePrefs(
      {
        sortColumn: 'total',
        sortDirection: 'desc',
        weightFilter: 'FEMALE_OPEN',
        ageFilter: 'UNASSIGNED',
        labelFilter: 'label:Open',
      },
      'contest-1',
      storage,
    );

    expect(readTablePrefs('contest-1', storage)).toEqual({
      sortColumn: 'total',
      sortDirection: 'desc',
      weightFilter: 'FEMALE_OPEN',
      ageFilter: 'UNASSIGNED',
      labelFilter: 'label:Open',
    });
  });

  it('keeps reading preferences written by the older flight filter key', () => {
    const storage = createStorage({
      [tablePrefsKey('contest-1')]: JSON.stringify({
        sortColumn: '',
        sortDirection: 'desc',
        flightFilter: 'MALE_OPEN',
        ageFilter: 'UNASSIGNED',
      }),
    });

    expect(readTablePrefs('contest-1', storage)).toEqual({
      sortColumn: 'order',
      sortDirection: 'desc',
      weightFilter: 'MALE_OPEN',
      ageFilter: 'UNASSIGNED',
      labelFilter: 'ALL',
    });
  });

  it('drops the legacy OPEN weight filter and survives unparsable entries', () => {
    const storage = createStorage({
      [tablePrefsKey('contest-1')]: JSON.stringify({ weightFilter: 'OPEN' }),
      [tablePrefsKey('contest-2')]: '{not json',
    });

    expect(readTablePrefs('contest-1', storage)?.weightFilter).toBe('ALL');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readTablePrefs('contest-2', storage)).toBeNull();
    warn.mockRestore();
  });
});
