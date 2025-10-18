import { render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addMessages, init, waitLocale } from 'svelte-i18n';

import Page from '../contests/[id]/+page.svelte';
import en from '$lib/i18n/locales/en.json';
import type { ContestDetail, Registration, Attempt, ContestBarWeights, ContestRankingEntry, ContestPlateSetEntry, BackupSummary } from '$lib/types';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
const { connectMock, disconnectMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  disconnectMock: vi.fn(),
}));
const { modalOpenMock } = vi.hoisted(() => ({ modalOpenMock: vi.fn().mockResolvedValue(undefined) }));
const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('$lib/api', () => ({
  apiClient: {
    baseUrl: 'http://127.0.0.1:8787',
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('$lib/realtime', () => {
  const { readable } = require('svelte/store');

  return {
    realtimeClient: {
      connectionStatus: readable('connected', () => () => {}),
      events: readable(null, () => () => {}),
      connect: connectMock,
      disconnect: disconnectMock,
    },
  };
});

vi.mock('$lib/ui/modal', () => ({
  modalStore: {
    open: modalOpenMock,
  },
}));

vi.mock('$lib/ui/toast', () => ({
  toast: toastMock,
}));

describe('Contest registrations table', () => {
  beforeEach(async () => {
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();

    getMock.mockReset();
    getMock.mockImplementation(async (path: string) => {
      if (path === '/system/health') {
        return {
          data: { status: 'ok', timestamp: new Date().toISOString() },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    connectMock.mockReset();
    disconnectMock.mockReset();
    modalOpenMock.mockResolvedValue(undefined);
    Object.values(toastMock).forEach(fn => fn.mockReset());
  });

  it('renders Reshel and McCulloch coefficients with formatted values', async () => {
    const contest: ContestDetail = {
      id: 'contest-1',
      name: 'Werewolf Open',
      date: '2024-03-01',
      location: 'Warsaw',
      discipline: 'Deadlift',
      status: 'Live',
      mensBarWeight: 20,
      womensBarWeight: 15,
      registrations: [],
      updatedAt: '2024-02-20T10:00:00Z',
    };

    const registrations: Registration[] = [
      {
        id: 'reg-1',
        competitorId: 'comp-1',
        firstName: 'Anna',
        lastName: 'Nowak',
        birthDate: '1995-01-01',
        gender: 'Female',
        club: 'Werewolf',
        city: 'Warsaw',
        weightClassId: 'wc1',
        weightClassName: 'Up to 63 kg',
        ageCategoryId: 'ac-senior',
        ageCategoryName: 'Senior (24-39)',
        bodyweight: 61.2,
        rackHeightSquat: 42,
        rackHeightBench: 37,
        reshelCoefficient: 0.9453,
        mcculloughCoefficient: 1.072,
        competitionOrder: 5,
      },
    ];

    contest.registrations = registrations;

    const barWeights: ContestBarWeights = {
      mensBarWeight: 20,
      womensBarWeight: 15,
      clampWeight: 2.5,
    };

    const data = {
      contest,
      registrations,
      attempts: [] as Attempt[],
      currentAttempt: null,
      referenceData: {
        weightClasses: [
          { id: 'wc1', code: 'F_67_5', name: 'Up to 63 kg', gender: 'Female', minWeight: 57, maxWeight: 63 },
        ],
        ageCategories: [
          { id: 'ac-senior', code: 'SENIOR', name: 'Senior (24-39)', minAge: 24, maxAge: 39 },
        ],
      },
      resultsOpen: [] as ContestRankingEntry[],
      resultsAge: [] as ContestRankingEntry[],
      resultsWeight: [] as ContestRankingEntry[],
      plateSets: [] as ContestPlateSetEntry[],
      barWeights,
      backupsSummary: null as BackupSummary | null,
      error: null,
      apiBase: 'http://127.0.0.1:8787',
      contestId: contest.id,
    };

    render(Page, {
      data,
      params: { id: contest.id },
    });

    const reshelHeader = await screen.findByRole('columnheader', { name: /Reshel/i });
    const table = reshelHeader.closest('table');
    expect(table).not.toBeNull();

    const mccHeader = within(table as HTMLTableElement).getByRole('columnheader', { name: /McC\./i });
    expect(mccHeader).toBeInTheDocument();

    expect(within(table as HTMLTableElement).getByText('0.945')).toBeInTheDocument();
    expect(within(table as HTMLTableElement).getByText('1.072')).toBeInTheDocument();
  });
});
