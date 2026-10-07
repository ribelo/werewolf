import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { addMessages, init, _ as translateStore, waitLocale } from 'svelte-i18n';

import Page from '../settings/+page.svelte';
import type { PageData } from '../settings/$types';
import en from '$lib/i18n/locales/en.json';
import type {
  BackupRecord,
  DatabaseInfo,
  Settings,
  SystemHealth,
} from '$lib/types';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const { changeLanguageMock } = vi.hoisted(() => ({
  changeLanguageMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/i18n', () => ({
  availableLocales: [
    { code: 'en', label: 'English' },
    { code: 'pl', label: 'Polski' },
  ],
  changeLanguage: changeLanguageMock,
}));

const { getMock, postMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('$lib/api', () => ({
  apiClient: {
    baseUrl: 'http://127.0.0.1:8787',
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('$lib/ui/toast', () => ({ toast: toastMock }));

const HEALTH_TIMESTAMP = '2026-01-01T10:00:00.000Z';
const BACKUP_TIMESTAMP = '2026-01-01T09:00:00.000Z';

const SETTINGS: Settings = {
  language: 'pl',
  ui: { theme: 'light', showWeights: true },
  competition: { defaultBarWeight: 20, defaultPlateSet: [] },
  database: { backupEnabled: true, autoBackupInterval: 24 },
};

const HEALTH: SystemHealth = { status: 'ok', timestamp: HEALTH_TIMESTAMP };

const DATABASE: DatabaseInfo = {
  status: 'ok',
  stats: { contests: 0, competitors: 3, registrations: 4 },
};

const BACKUP: BackupRecord = {
  id: 'backup-2026-01-01.json',
  timestamp: BACKUP_TIMESTAMP,
  size: 2048,
  recordCounts: { contests: 1, competitors: 2, registrations: 3, attempts: 4, results: 0 },
};

function buildData(): PageData {
  return {
    session: { authenticated: false, checked: true },
    settings: SETTINGS,
    settingsError: null,
    health: HEALTH,
    healthError: null,
    database: DATABASE,
    databaseError: null,
    backups: { backups: [BACKUP], total: 1, timestamp: BACKUP_TIMESTAMP },
    backupsError: null,
    apiBase: 'http://127.0.0.1:8787',
  };
}

/** What the transport throws when the Worker cannot be reached. */
function offlineError(): Error {
  return Object.assign(new Error('api.offline.not_queueable'), { kind: 'offline' });
}

describe('settings page', () => {
  beforeEach(async () => {
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();

    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    changeLanguageMock.mockReset();
    changeLanguageMock.mockResolvedValue(undefined);
    toastMock.success.mockReset();
    toastMock.error.mockReset();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    getMock.mockResolvedValue({ data: HEALTH, error: null });
    postMock.mockResolvedValue({ data: { success: true }, error: null });
    deleteMock.mockResolvedValue({ data: { success: true }, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders language, worker, D1, backup and reset panels without weight controls', () => {
    render(Page, { data: buildData() });

    const languageSelect = screen.getByRole('combobox') as HTMLSelectElement;
    expect(within(languageSelect).getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(within(languageSelect).getByRole('option', { name: 'Polski' })).toBeInTheDocument();

    // Worker health panel (status badge and last check) and D1 panel (statistics).
    expect(screen.getAllByText('ok')).toHaveLength(2);
    expect(screen.getByText(new Date(HEALTH_TIMESTAMP).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('Contests: 0')).toBeInTheDocument();
    expect(screen.getByText('Competitors: 3')).toBeInTheDocument();
    expect(screen.getByText('Registrations: 4')).toBeInTheDocument();

    // KV backups panel with the stored backup and its actions.
    expect(screen.getByText('Cloudflare KV Backups')).toBeInTheDocument();
    expect(screen.getByText('Stored backups: 1')).toBeInTheDocument();
    expect(screen.getByText(BACKUP.id)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    // Danger zone.
    expect(screen.getByRole('button', { name: 'Reset Database' })).toBeInTheDocument();

    // The removed UI/competition settings must not come back.
    expect(screen.queryByText('Show weights by default')).toBeNull();
    expect(screen.queryByText('Default bar weight (kg)')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('changes the language through changeLanguage', async () => {
    render(Page, { data: buildData() });

    const languageSelect = screen.getByRole('combobox');
    await fireEvent.change(languageSelect, { target: { value: 'pl' } });

    await waitFor(() => expect(changeLanguageMock).toHaveBeenCalledWith('pl'));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(en.settings_page.language_updated));
  });

  it('reports an offline restore as an error and never as a success', async () => {
    postMock.mockRejectedValue(offlineError());

    render(Page, { data: buildData() });
    await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalled();
    expect(postMock).toHaveBeenCalledWith(`/system/backups/${BACKUP.id}/restore`);
    // The catalog has no settings_page.offline_error entry yet, so the key itself
    // is what the toast carries; once it is translated the assertion follows.
    expect(toastMock.error).toHaveBeenCalledWith(get(translateStore)('settings_page.offline_error'));
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('reports an offline database reset as an error and never as a success', async () => {
    postMock.mockRejectedValue(offlineError());

    render(Page, { data: buildData() });
    await fireEvent.click(screen.getByRole('button', { name: 'Reset Database' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/system/database/reset', {
        confirm: 'YES_I_WANT_TO_RESET_THE_DATABASE',
      }),
    );
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.error).toHaveBeenCalledWith(get(translateStore)('settings_page.offline_error'));
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
