import { describe, it, expect } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

import { apiClient } from '$lib/api';
import { load as loadNewContest } from '../contests/new/+page';
import { load as loadContestPage } from '../contests/[id]/+page';
import { load as loadSettings, type SettingsPageData } from '../settings/+page';
import type { BackupSummary, DatabaseInfo, Settings, SystemHealth } from '$lib/types';

/**
 * Route-loader smoke tests.
 *
 * These exercise the real load functions with a stubbed transport. The larger
 * loader contracts live in their own suites (dashboard-loader,
 * contest-layout-loader, results-page-loader, login-loader); this file covers
 * the settings page, the contest wizard entry and the contests/[id] redirect.
 */

type StubFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface Stub {
  data: unknown;
  error: string | null;
  status?: number;
}

function ok(data: unknown): Stub {
  return { data, error: null };
}

/** The API answered non-2xx with an error envelope; the client throws. */
function httpError(error: string): Stub {
  return { data: null, error, status: 500 };
}

function createFetch(stubs: Record<string, Stub | Error>): {
  fetchImpl: StubFetch;
  requested: string[];
} {
  const requested: string[] = [];
  const fetchImpl: StubFetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { pathname } = new URL(url);
    requested.push(pathname);

    const stub = stubs[pathname];
    if (stub === undefined) throw new Error(`unexpected request: ${pathname}`);
    if (stub instanceof Error) throw stub;

    return new Response(JSON.stringify({ data: stub.data, error: stub.error }), {
      status: stub.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchImpl, requested };
}

type SettingsLoadEvent = Parameters<typeof loadSettings>[0];

function settingsEvent(fetchImpl: StubFetch): SettingsLoadEvent {
  return { fetch: fetchImpl } as unknown as SettingsLoadEvent;
}

function runSettingsLoad(event: SettingsLoadEvent): Promise<SettingsPageData> {
  return loadSettings(event) as unknown as Promise<SettingsPageData>;
}

type ContestLoadEvent = Parameters<typeof loadContestPage>[0];

function contestEvent(id: string): ContestLoadEvent {
  return { params: { id } } as unknown as ContestLoadEvent;
}

const SETTINGS: Settings = {
  language: 'pl',
  ui: { theme: 'light', showWeights: false },
  competition: { defaultBarWeight: 20, defaultPlateSet: [] },
  database: { backupEnabled: true, autoBackupInterval: 24 },
};

const HEALTH: SystemHealth = { status: 'ok', timestamp: '2026-01-01T10:00:00.000Z' };

const DATABASE: DatabaseInfo = {
  status: 'ok',
  stats: { contests: 2, competitors: 8, registrations: 11 },
};

const BACKUPS: BackupSummary = {
  backups: [
    {
      id: 'backup-1.json',
      timestamp: '2026-01-01T09:00:00.000Z',
      size: 1024,
      recordCounts: { contests: 2, competitors: 8, registrations: 11, attempts: 33, results: 0 },
    },
  ],
  total: 1,
  timestamp: '2026-01-01T09:00:00.000Z',
};

const SETTINGS_ROUTES = {
  '/settings': ok(SETTINGS),
  '/system/health': ok(HEALTH),
  '/system/database': ok(DATABASE),
  '/system/backups': ok(BACKUPS),
};

describe('settings page loader', () => {
  it('returns every panel when all four requests succeed', async () => {
    const { fetchImpl, requested } = createFetch(SETTINGS_ROUTES);

    const data = await runSettingsLoad(settingsEvent(fetchImpl));

    expect(Object.keys(data).sort()).toEqual(
      [
        'apiBase',
        'backups',
        'backupsError',
        'database',
        'databaseError',
        'health',
        'healthError',
        'settings',
        'settingsError',
      ].sort(),
    );
    expect(requested.sort()).toEqual(
      ['/settings', '/system/health', '/system/database', '/system/backups'].sort(),
    );

    expect(data.settings).toEqual(SETTINGS);
    expect(data.settingsError).toBeNull();
    expect(data.health).toEqual(HEALTH);
    expect(data.healthError).toBeNull();
    expect(data.database).toEqual(DATABASE);
    expect(data.databaseError).toBeNull();
    expect(data.backups).toEqual(BACKUPS);
    expect(data.backupsError).toBeNull();
    expect(data.apiBase).toBe(apiClient.baseUrl);
  });

  it('keeps the reachable panels when an auxiliary request fails', async () => {
    const { fetchImpl } = createFetch({
      ...SETTINGS_ROUTES,
      '/system/health': httpError('health unavailable'),
      '/system/database': new Error('database offline'),
    });

    const data = await runSettingsLoad(settingsEvent(fetchImpl));

    expect(data.settings).toEqual(SETTINGS);
    expect(data.settingsError).toBeNull();
    expect(data.backups).toEqual(BACKUPS);
    expect(data.backupsError).toBeNull();

    expect(data.health).toBeNull();
    expect(data.healthError).toBe('health unavailable');
    expect(data.database).toBeNull();
    expect(data.databaseError).toBe('database offline');
  });
});

describe('contest wizard loader', () => {
  it('exposes the API base used by the create form', async () => {
    const data = await loadNewContest();

    expect(data.apiBase).toBe(apiClient.baseUrl);
  });
});

describe('contests/[id] page loader', () => {
  it('redirects to the desk tab of the contest', async () => {
    const thrown: unknown = await Promise.resolve(loadContestPage(contestEvent('contest-42'))).then(
      () => null,
      (error: unknown) => error,
    );

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ status: 307, location: '/contests/contest-42/desk' });
  });
});
