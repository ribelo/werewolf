import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable } from 'svelte/store';
import { tick } from 'svelte';
import Page from '../settings/+page.svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import en from '$lib/i18n/locales/en.json';

vi.mock('$app/environment', () => ({ browser: false }));

const { changeLanguageMock } = vi.hoisted(() => ({
  changeLanguageMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/i18n', () => ({
  availableLocales: [
    { code: 'en', label: 'English' },
    { code: 'pl', label: 'Polski' },
  ],
  changeLanguage: changeLanguageMock,
  locale: writable('en'),
}));

const patchMock = vi.fn();
const getMock = vi.fn();
const putMock = vi.fn();

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('$lib/api', () => ({
  apiClient: {
    baseUrl: 'http://127.0.0.1:8787',
    get: (...args: unknown[]) => getMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    post: vi.fn(),
  },
}));

vi.mock('$lib/ui/toast', () => ({
  toast: toastMock,
}));

describe('Settings page – optimistic rollback', () => {
  const basePlateSet = [
    { weight: 25, quantity: 4, color: '#DC2626' },
    { weight: 20, quantity: 4, color: '#2563EB' },
    { weight: 15, quantity: 4, color: '#EAB308' },
    { weight: 10, quantity: 6, color: '#16A34A' },
  ];

  const buildData = () => ({
    settings: {
      language: 'pl',
      ui: { theme: 'light', showWeights: true, showAttempts: true },
      competition: {
        defaultBarWeight: 20,
        defaultPlateSet: basePlateSet.map((plate) => ({ ...plate })),
      },
      database: { backupEnabled: true, autoBackupInterval: 24 },
    },
    settingsError: null,
    health: { status: 'ok', timestamp: new Date().toISOString() },
    healthError: null,
    database: { status: 'ok', stats: { contests: 0, competitors: 0, registrations: 0 } },
    databaseError: null,
    backups: { backups: [], total: 0, timestamp: new Date().toISOString() },
    backupsError: null,
    apiBase: 'http://127.0.0.1:8787',
  });

  beforeEach(async () => {
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();

    patchMock.mockReset();
    getMock.mockReset();
    putMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    changeLanguageMock.mockReset();
    changeLanguageMock.mockResolvedValue(undefined);

    patchMock.mockResolvedValue({ data: { success: true }, error: null });
    getMock.mockResolvedValue({
      data: { status: 'ok', timestamp: new Date().toISOString() },
      error: null,
    });
  });

  function renderPage() {
    return render(Page, {
      data: buildData(),
    });
  }

  it('reverts showWeights when PATCH /settings/ui fails', async () => {
    patchMock.mockRejectedValueOnce(new Error('network failure'));

    const { getByRole } = renderPage();

    const checkbox = getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(false);

    await fireEvent.click(checkbox);
    await tick();

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith('/settings/ui', { showWeights: false });
    });

    await waitFor(() => expect(checkbox.checked).toBe(true));
    expect(toastMock.error).toHaveBeenCalled();
  });

  it('reverts default bar weight when PATCH /settings/competition fails', async () => {
    patchMock.mockRejectedValueOnce(new Error('db offline'));

    const { getByLabelText } = renderPage();

    const input = getByLabelText('Default bar weight (kg)') as HTMLInputElement;
    expect(input.value).toBe('20');

    await fireEvent.change(input, { target: { value: '25' } });
    await tick();

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith('/settings/competition', { defaultBarWeight: 25 });
    });

    await waitFor(() => expect(input.value).toBe('20'));
    expect(toastMock.error).toHaveBeenCalled();
  });
});
