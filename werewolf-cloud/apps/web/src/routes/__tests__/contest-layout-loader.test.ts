import { describe, it, expect } from 'vitest';
import { load } from '../contests/[id]/+layout.ts';
import type { LayoutData } from '../contests/[id]/$types';
import type { ContestDetail } from '$lib/types';

type LoadEvent = Parameters<typeof load>[0];
type StubFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Stub = { data: unknown; error: string | null; status?: number };

/** Every contest tab reads all of these keys: the layout must always return them. */
const LAYOUT_KEYS = [
  'contest',
  'registrations',
  'attempts',
  'currentAttempt',
  'referenceData',
  'contestTags',
  'plateSets',
  'barWeights',
  'backupsSummary',
  'error',
  'apiBase',
  'contestId',
];

function ok(data: unknown): Stub {
  return { data, error: null };
}

/** The API answered non-2xx with an error envelope; the client throws. */
function httpError(error: string): Stub {
  return { data: null, error, status: 500 };
}

/** The API answered 2xx but reported a failure in the envelope. */
function envelopeError(error: string): Stub {
  return { data: null, error };
}

function contestDetail(id: string): ContestDetail {
  return {
    id,
    name: `Meet ${id}`,
    date: '2026-01-01',
    location: 'Warszawa',
    discipline: 'Powerlifting',
    status: 'InProgress',
    mensBarWeight: 20,
    womensBarWeight: 15,
    clampWeight: 2.5,
    registrations: [],
  };
}

function routes(
  contestId: string,
  overrides: Record<string, Stub | Error> = {},
): Record<string, Stub | Error> {
  return {
    [`/contests/${contestId}`]: ok(contestDetail(contestId)),
    [`/contests/${contestId}/registrations`]: ok([{ id: `reg-${contestId}` }]),
    [`/contests/${contestId}/attempts`]: ok([]),
    [`/contests/${contestId}/attempts/current`]: ok(null),
    [`/contests/${contestId}/categories`]: ok({ weightClasses: [], ageCategories: [] }),
    [`/contests/${contestId}/tags`]: ok([]),
    [`/contests/${contestId}/platesets`]: ok([{ weight: 25, quantity: 4, color: '#DC2626' }]),
    [`/contests/${contestId}/platesets/barweights`]: ok({
      mensBarWeight: 20,
      womensBarWeight: 15,
      clampWeight: 2.5,
    }),
    '/system/backups': ok({ backups: [], total: 0, timestamp: '2026-01-01T00:00:00Z' }),
    ...overrides,
  };
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

function loadEvent(contestId: string, fetchImpl: StubFetch): LoadEvent {
  return { params: { id: contestId }, fetch: fetchImpl } as unknown as LoadEvent;
}

/**
 * `load` is annotated with SvelteKit's LayoutLoad, whose return type is widened
 * (it allows void plus a Record<string, any> shape). The generated LayoutData is
 * the contract the tab pages actually receive, so the tests assert on that.
 */
function runLoad(event: LoadEvent): Promise<LayoutData> {
  return load(event) as unknown as Promise<LayoutData>;
}

function expectCompleteShape(data: LayoutData): void {
  expect(Object.keys(data).sort()).toEqual([...LAYOUT_KEYS].sort());
}

describe('contest [id] layout loader', () => {
  it('returns the complete shape when every request succeeds', async () => {
    const { fetchImpl, requested } = createFetch(routes('contest-a'));

    const data = await runLoad(loadEvent('contest-a', fetchImpl));

    expectCompleteShape(data);
    expect(data.error).toBeNull();
    expect(data.contestId).toBe('contest-a');
    expect(data.contest?.name).toBe('Meet contest-a');
    expect(data.registrations.map((registration) => registration.id)).toEqual(['reg-contest-a']);
    expect(data.attempts).toEqual([]);
    expect(data.currentAttempt).toBeNull();
    expect(data.referenceData).toEqual({ weightClasses: [], ageCategories: [] });
    expect(data.contestTags).toEqual([]);
    expect(data.plateSets).toHaveLength(1);
    expect(data.barWeights?.mensBarWeight).toBe(20);
    expect(data.backupsSummary?.total).toBe(0);
    expect(typeof data.apiBase).toBe('string');
    expect(requested).toContain('/contests/contest-a');
    expect(requested).toContain('/system/backups');
  });

  it('keeps the contest when auxiliary requests fail', async () => {
    const { fetchImpl } = createFetch(
      routes('contest-a', {
        '/system/backups': httpError('backups unavailable'),
        '/contests/contest-a/platesets': new Error('network down'),
        '/contests/contest-a/platesets/barweights': envelopeError('bar weights unavailable'),
      }),
    );

    const data = await runLoad(loadEvent('contest-a', fetchImpl));

    expectCompleteShape(data);
    // The contest itself loaded, so this is not an error page.
    expect(data.error).toBeNull();
    expect(data.contest?.id).toBe('contest-a');
    expect(data.registrations).toHaveLength(1);
    expect(data.referenceData).toEqual({ weightClasses: [], ageCategories: [] });

    // Failed auxiliary fields degrade to their unavailable values.
    expect(data.plateSets).toEqual([]);
    expect(data.barWeights).toBeNull();
    expect(data.backupsSummary).toBeNull();
  });

  it('errors when the primary contest request fails', async () => {
    const { fetchImpl } = createFetch(
      routes('contest-a', { '/contests/contest-a': httpError('contest not found') }),
    );

    const data = await runLoad(loadEvent('contest-a', fetchImpl));

    expectCompleteShape(data);
    expect(data.error).toBe('contest not found');
    expect(data.contest).toBeNull();
    expect(data.contestId).toBe('contest-a');

    expect(data.registrations).toEqual([]);
    expect(data.attempts).toEqual([]);
    expect(data.currentAttempt).toBeNull();
    expect(data.referenceData).toEqual({ weightClasses: [], ageCategories: [] });
    expect(data.contestTags).toEqual([]);
    expect(data.plateSets).toEqual([]);
    expect(data.barWeights).toBeNull();
    expect(data.backupsSummary).toBeNull();
  });

  it('reports a transport failure on the primary request as the error', async () => {
    const { fetchImpl } = createFetch(routes('contest-a', { '/contests/contest-a': new Error('offline') }));

    const data = await runLoad(loadEvent('contest-a', fetchImpl));

    expectCompleteShape(data);
    expect(data.error).toBe('offline');
    expect(data.contest).toBeNull();
  });

  it('loads the second contest after A -> B navigation', async () => {
    const first = createFetch(routes('contest-a'));
    const second = createFetch(routes('contest-b'));

    const dataA = await runLoad(loadEvent('contest-a', first.fetchImpl));
    const dataB = await runLoad(loadEvent('contest-b', second.fetchImpl));

    expect(dataA.contestId).toBe('contest-a');
    expect(dataA.contest?.id).toBe('contest-a');

    expect(dataB.contestId).toBe('contest-b');
    expect(dataB.contest?.id).toBe('contest-b');
    expect(dataB.registrations.map((registration) => registration.id)).toEqual(['reg-contest-b']);

    // The second load must not touch the previous contest's endpoints.
    expect(second.requested).toContain('/contests/contest-b');
    expect(second.requested.some((path) => path.includes('contest-a'))).toBe(false);
  });
});
