import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from '../+page';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('$lib/api', () => ({
  apiClient: {
    baseUrl: 'http://127.0.0.1:8787',
    get: (...args: unknown[]) => getMock(...args),
  },
}));

const contest = {
  id: 'contest-1',
  name: 'Winter Open',
  date: '2026-02-01',
  location: 'Warsaw',
  discipline: 'Powerlifting',
  status: 'Active',
  mensBarWeight: 20,
  womensBarWeight: 15,
};

type DashboardLoadEvent = Parameters<typeof load>[0];

function loadEvent(): DashboardLoadEvent {
  return { fetch: vi.fn() } as unknown as DashboardLoadEvent;
}

describe('dashboard page loader', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('keeps the contest list when the database statistics request fails', async () => {
    getMock.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/contests') {
        return { data: [contest], error: null };
      }
      throw new Error('statistics unavailable');
    });

    const data = await load(loadEvent());

    expect(data.contests).toEqual([contest]);
    expect(data.error).toBeNull();
    expect(data.database).toBeNull();
    expect(data.databaseError).toBe('statistics unavailable');
  });

  it('keeps the database statistics when the contest request fails', async () => {
    getMock.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/system/database') {
        return { data: { status: 'ok', stats: { contests: 0, competitors: 0, registrations: 0 } }, error: null };
      }
      throw new Error('contests unavailable');
    });

    const data = await load(loadEvent());

    expect(data.contests).toEqual([]);
    expect(data.error).toBe('contests unavailable');
    expect(data.database?.status).toBe('ok');
    expect(data.databaseError).toBeNull();
  });
});
